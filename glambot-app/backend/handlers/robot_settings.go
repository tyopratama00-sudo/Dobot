package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"photobooth/services"
)

// Robot runtime tuning: parameter gerak, durasi pose, & face tracking yang
// diatur admin, disimpan di app_settings (default di bawah = nilai .env dobot).
// PATCH admin → simpan ke DB → forward best-effort ke dobot (POST
// /config/runtime) supaya berlaku tanpa restart; dobot juga GET
// /api/robot-settings saat start.
//
// Key & rentang di file ini HARUS sama dengan RUNTIME_TUNABLES di
// dobot/app/core/runtime.py.

const (
	keyRobotSpeedFactor     = "robot_speed_factor"
	keyRobotJointSpeed      = "robot_joint_speed"
	keyRobotJointAcc        = "robot_joint_acc"
	keySafetyTimeout        = "safety_timeout"
	keyPostActionDelay      = "post_action_delay"
	keySequenceSlotSec      = "sequence_slot_sec"
	keyFaceTrackGainPan     = "face_track_gain_pan"
	keyFaceTrackGainTilt    = "face_track_gain_tilt"
	keyFaceTrackDeadbandPct = "face_track_deadband_pct"
	keyFaceTrackMaxDevDeg   = "face_track_max_dev_deg"
)

// robotSettings — bentuk JSON yang dipertukarkan dengan frontend & dobot
// (camelCase). Speed factor bertipe int (skala 1–100); sisanya float
// (detik / derajat / persen).
type robotSettings struct {
	RobotSpeedFactor     int     `json:"robotSpeedFactor"`
	RobotJointSpeed      int     `json:"robotJointSpeed"`
	RobotJointAcc        int     `json:"robotJointAcc"`
	SafetyTimeout        float64 `json:"safetyTimeout"`
	PostActionDelay      float64 `json:"postActionDelay"`
	SequenceSlotSec      float64 `json:"sequenceSlotSec"`
	FaceTrackGainPan     float64 `json:"faceTrackGainPan"`
	FaceTrackGainTilt    float64 `json:"faceTrackGainTilt"`
	FaceTrackDeadbandPct float64 `json:"faceTrackDeadbandPct"`
	FaceTrackMaxDevDeg   float64 `json:"faceTrackMaxDevDeg"`
}

// Default = nilai .env dobot. Menjaga perilaku identik saat DB kosong.
var robotDefaults = robotSettings{
	RobotSpeedFactor:     100,
	RobotJointSpeed:      80,
	RobotJointAcc:        30,
	SafetyTimeout:        10,
	PostActionDelay:      0.5,
	SequenceSlotSec:      30,
	FaceTrackGainPan:     8,
	FaceTrackGainTilt:    6,
	FaceTrackDeadbandPct: 6,
	FaceTrackMaxDevDeg:   20,
}

// Rentang aman per field — cegah nilai ekstrem yang bisa membuat robot terlalu
// agresif atau tracking berosilasi. Min/max inklusif.
type robotRange struct{ min, max float64 }

var robotRanges = map[string]robotRange{
	keyRobotSpeedFactor:     {1, 100},
	keyRobotJointSpeed:      {1, 100},
	keyRobotJointAcc:        {1, 100},
	keySafetyTimeout:        {3, 60},
	keyPostActionDelay:      {0, 5},
	keySequenceSlotSec:      {5, 120},
	keyFaceTrackGainPan:     {0, 40},
	keyFaceTrackGainTilt:    {0, 40},
	keyFaceTrackDeadbandPct: {0, 30},
	keyFaceTrackMaxDevDeg:   {0, 60},
}

// robotSettingKeys — satu daftar untuk dibaca dari app_settings.
var robotSettingKeys = []string{
	keyRobotSpeedFactor, keyRobotJointSpeed, keyRobotJointAcc,
	keySafetyTimeout, keyPostActionDelay, keySequenceSlotSec,
	keyFaceTrackGainPan, keyFaceTrackGainTilt,
	keyFaceTrackDeadbandPct, keyFaceTrackMaxDevDeg,
}

// loadRobotSettings membaca semua key dari app_settings, mengisi default untuk
// key yang belum ada / nilainya rusak.
func loadRobotSettings() (robotSettings, error) {
	cfg := robotDefaults

	values, err := readAppSettings(robotSettingKeys...)
	if err != nil {
		return cfg, err
	}

	for k, v := range values {
		f, convErr := strconv.ParseFloat(v, 64)
		if convErr != nil {
			continue // nilai rusak → biarkan default
		}
		switch k {
		case keyRobotSpeedFactor:
			cfg.RobotSpeedFactor = int(f)
		case keyRobotJointSpeed:
			cfg.RobotJointSpeed = int(f)
		case keyRobotJointAcc:
			cfg.RobotJointAcc = int(f)
		case keySafetyTimeout:
			cfg.SafetyTimeout = f
		case keyPostActionDelay:
			cfg.PostActionDelay = f
		case keySequenceSlotSec:
			cfg.SequenceSlotSec = f
		case keyFaceTrackGainPan:
			cfg.FaceTrackGainPan = f
		case keyFaceTrackGainTilt:
			cfg.FaceTrackGainTilt = f
		case keyFaceTrackDeadbandPct:
			cfg.FaceTrackDeadbandPct = f
		case keyFaceTrackMaxDevDeg:
			cfg.FaceTrackMaxDevDeg = f
		}
	}
	return cfg, nil
}

// GetRobotSettings — GET publik & admin. Publik dipakai service dobot saat start
// untuk mengambil override; admin (di belakang auth) dipakai halaman Settings.
func GetRobotSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadRobotSettings()
	if err != nil {
		respondInternal(w, "load robot settings", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// AdminUpdateRobotSettings — PATCH sebagian/semua field. Field nil = tidak
// diubah. Nilai divalidasi ke rentang masing-masing, disimpan ke DB, lalu
// diteruskan best-effort ke service dobot agar berlaku live.
func AdminUpdateRobotSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RobotSpeedFactor     *float64 `json:"robotSpeedFactor"`
		RobotJointSpeed      *float64 `json:"robotJointSpeed"`
		RobotJointAcc        *float64 `json:"robotJointAcc"`
		SafetyTimeout        *float64 `json:"safetyTimeout"`
		PostActionDelay      *float64 `json:"postActionDelay"`
		SequenceSlotSec      *float64 `json:"sequenceSlotSec"`
		FaceTrackGainPan     *float64 `json:"faceTrackGainPan"`
		FaceTrackGainTilt    *float64 `json:"faceTrackGainTilt"`
		FaceTrackDeadbandPct *float64 `json:"faceTrackDeadbandPct"`
		FaceTrackMaxDevDeg   *float64 `json:"faceTrackMaxDevDeg"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}

	// Field int disimpan sebagai integer; field float dengan desimal apa adanya.
	updates := map[string]string{}
	intField := func(key string, ptr *float64) bool {
		if ptr == nil {
			return true
		}
		rng := robotRanges[key]
		if *ptr < rng.min || *ptr > rng.max {
			respondError(w, http.StatusBadRequest, fmt.Sprintf(
				"%s harus antara %g–%g", key, rng.min, rng.max))
			return false
		}
		updates[key] = strconv.Itoa(int(*ptr))
		return true
	}
	floatField := func(key string, ptr *float64) bool {
		if ptr == nil {
			return true
		}
		rng := robotRanges[key]
		if *ptr < rng.min || *ptr > rng.max {
			respondError(w, http.StatusBadRequest, fmt.Sprintf(
				"%s harus antara %g–%g", key, rng.min, rng.max))
			return false
		}
		updates[key] = strconv.FormatFloat(*ptr, 'g', -1, 64)
		return true
	}

	if !intField(keyRobotSpeedFactor, body.RobotSpeedFactor) ||
		!intField(keyRobotJointSpeed, body.RobotJointSpeed) ||
		!intField(keyRobotJointAcc, body.RobotJointAcc) ||
		!floatField(keySafetyTimeout, body.SafetyTimeout) ||
		!floatField(keyPostActionDelay, body.PostActionDelay) ||
		!floatField(keySequenceSlotSec, body.SequenceSlotSec) ||
		!floatField(keyFaceTrackGainPan, body.FaceTrackGainPan) ||
		!floatField(keyFaceTrackGainTilt, body.FaceTrackGainTilt) ||
		!floatField(keyFaceTrackDeadbandPct, body.FaceTrackDeadbandPct) ||
		!floatField(keyFaceTrackMaxDevDeg, body.FaceTrackMaxDevDeg) {
		return
	}

	if len(updates) == 0 {
		respondError(w, http.StatusBadRequest, "Tidak ada perubahan")
		return
	}

	if err := upsertAppSettings(updates); err != nil {
		respondInternal(w, "update app_settings", err)
		return
	}

	cfg, err := loadRobotSettings()
	if err != nil {
		respondInternal(w, "reload robot settings", err)
		return
	}

	// Best-effort: teruskan ke service dobot agar berlaku live. Kegagalan di sini
	// TIDAK menggagalkan request — nilai sudah tersimpan di DB dan akan terpasang
	// saat dobot start berikutnya (atau di-forward ulang saat disimpan lagi).
	if payload, mErr := json.Marshal(cfg); mErr == nil {
		if fErr := services.UpdateRobotRuntimeConfig(payload); fErr != nil {
			log.Printf("⚠️  Forward robot settings ke dobot gagal (tersimpan di DB): %v", fErr)
		}
	}

	respondJSON(w, http.StatusOK, cfg)
}
