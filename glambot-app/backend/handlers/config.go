package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"photobooth/database"
)

// Timer layar booth: disimpan di app_settings (key→value TEXT), fallback ke
// default di bawah. Dibaca booth via GET /api/config, diubah admin lewat
// GET/PATCH /api/admin/settings.

const (
	keyVoucherChip     = "voucher_chip_enabled"
	keyVoucherChipCode = "voucher_chip_code"
	defaultChipCode    = "FREE FOTO"
	// Harga paket sebelum Mode Gratis (JSON id→harga). Ada = Mode Gratis aktif.
	keyFreeModeBackup  = "free_mode_backup"
	keyFreeDigitalOnly = "free_mode_digital_only"
)

type timerField struct {
	JSON, Key     string
	Def, Min, Max int
}

// Default & rentang HARUS sama dengan DEFAULT_SETTINGS.timeouts + skema zod di
// frontend/packages/shared/src/config.ts (dicek TestTimerDefaultsMatchBooth).
var timerFields = []timerField{
	{"paymentSeconds", "payment_seconds", 180, 30, 3600},
	{"selectionSeconds", "selection_seconds", 60, 15, 3600},
	{"frameSeconds", "frame_seconds", 180, 15, 3600},
	{"pickSeconds", "pick_seconds", 120, 15, 3600},
	{"editingSeconds", "editing_seconds", 180, 15, 3600},
	{"finalSeconds", "final_seconds", 60, 15, 3600},
	{"qrSeconds", "qr_seconds", 60, 10, 3600},
	{"thanksSeconds", "thanks_seconds", 60, 3, 600},
	{"warningSeconds", "warning_seconds", 15, 3, 120},
	{"errorResetSeconds", "error_reset_seconds", 90, 10, 3600},
}

type timerConfig struct {
	Timeouts           map[string]int `json:"timeouts"`
	VoucherChipEnabled bool           `json:"voucherChipEnabled"`
	VoucherChipCode    string         `json:"voucherChipCode"`
	FreeMode           bool           `json:"freeMode"`
	FreeDigitalOnly    bool           `json:"freeDigitalOnly"`
}

// loadTimerConfig membaca timer dari app_settings, mengisi default untuk key
// yang belum ada / nilainya tidak valid.
func loadTimerConfig() (timerConfig, error) {
	cfg := timerConfig{Timeouts: map[string]int{}, VoucherChipEnabled: true, VoucherChipCode: defaultChipCode}
	keys := []string{keyVoucherChip, keyVoucherChipCode, keyFreeModeBackup, keyFreeDigitalOnly}
	for _, f := range timerFields {
		cfg.Timeouts[f.JSON] = f.Def
		keys = append(keys, f.Key)
	}

	values, err := readAppSettings(keys...)
	if err != nil {
		return cfg, err
	}
	if v, ok := values[keyVoucherChip]; ok {
		cfg.VoucherChipEnabled = v != "0"
	}
	if v := values[keyVoucherChipCode]; v != "" {
		cfg.VoucherChipCode = v
	}
	_, cfg.FreeMode = values[keyFreeModeBackup]
	cfg.FreeDigitalOnly = values[keyFreeDigitalOnly] == "1"
	for _, f := range timerFields {
		if n, err := strconv.Atoi(values[f.Key]); err == nil && n >= f.Min && n <= f.Max {
			cfg.Timeouts[f.JSON] = n
		}
	}
	return cfg, nil
}

// GET /api/config — publik. Dibaca frontend untuk durasi timer tiap halaman.
func GetAppConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "load timer config", err)
		return
	}
	// Booth hides the chip when its voucher can no longer be used.
	if cfg.VoucherChipEnabled && !voucherUsable(cfg.VoucherChipCode) {
		cfg.VoucherChipEnabled = false
	}
	respondJSON(w, http.StatusOK, cfg)
}

func voucherUsable(code string) bool {
	var n int
	err := database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE code = ? AND is_active = 1
		AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses`, code).Scan(&n)
	return err == nil && n > 0
}

// GET /api/admin/settings — sama dengan /api/config, tapi di belakang auth admin.
func AdminGetSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "load timer config", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

// readAppSettings mengambil key→value dari app_settings untuk key yang diminta.
// Key yang belum ada di tabel tidak muncul di hasil — pemanggil yang memutuskan
// default & cara mem-parse nilainya. Pasangan baca untuk upsertAppSettings,
// dipakai bersama handler timer & robot-settings.
func readAppSettings(keys ...string) (map[string]string, error) {
	out := make(map[string]string, len(keys))
	if len(keys) == 0 {
		return out, nil
	}

	args := make([]interface{}, len(keys))
	for i, k := range keys {
		args[i] = k
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(keys)), ",")

	rows, err := database.DB.Query(
		`SELECT key, value FROM app_settings WHERE key IN (`+placeholders+`)`,
		args...,
	)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		out[k] = v
	}
	return out, rows.Err()
}

// DELETE /api/admin/settings — hapus override timer, kembali ke default hardcode.
func AdminResetSettings(w http.ResponseWriter, r *http.Request) {
	keys := make([]string, len(timerFields))
	for i, f := range timerFields {
		keys[i] = f.Key
	}
	if err := deleteAppSettings(keys...); err != nil {
		respondInternal(w, "reset timers", err)
		return
	}
	AdminGetSettings(w, r)
}

func deleteAppSettings(keys ...string) error {
	for _, k := range keys {
		if _, err := database.DB.Exec(`DELETE FROM app_settings WHERE key = ?`, k); err != nil {
			return err
		}
	}
	return nil
}

// upsertAppSettings menyimpan pasangan key/value ke app_settings (INSERT ...
// ON CONFLICT DO UPDATE). Dipakai bersama handler timer & robot-settings.
func upsertAppSettings(updates map[string]string) error {
	for k, v := range updates {
		if _, err := database.DB.Exec(
			`INSERT INTO app_settings (key, value, updated_at)
			 VALUES (?, ?, NOW())
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
			k, v,
		); err != nil {
			return err
		}
	}
	return nil
}

func AdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Timeouts           map[string]int `json:"timeouts"`
		VoucherChipEnabled *bool          `json:"voucherChipEnabled"`
		VoucherChipCode    *string        `json:"voucherChipCode"`
		FreeDigitalOnly    *bool          `json:"freeDigitalOnly"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	if len(body.Timeouts) == 0 && body.VoucherChipEnabled == nil && body.VoucherChipCode == nil && body.FreeDigitalOnly == nil {
		respondError(w, http.StatusBadRequest, "Tidak ada perubahan")
		return
	}

	strUpdates := map[string]string{}
	for k, v := range body.Timeouts {
		i := slices.IndexFunc(timerFields, func(f timerField) bool { return f.JSON == k })
		if i < 0 {
			respondError(w, http.StatusBadRequest, "Timer tidak dikenal: "+k)
			return
		}
		if f := timerFields[i]; v < f.Min || v > f.Max {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("%s harus antara %d–%d detik", k, f.Min, f.Max))
			return
		}
		strUpdates[timerFields[i].Key] = strconv.Itoa(v)
	}
	if body.VoucherChipEnabled != nil {
		strUpdates[keyVoucherChip] = strconv.Itoa(boolToInt(*body.VoucherChipEnabled))
	}
	if body.VoucherChipCode != nil {
		code := strings.ToUpper(strings.TrimSpace(*body.VoucherChipCode))
		if code == "" || len(code) > 80 {
			respondError(w, http.StatusBadRequest, "Kode voucher chip tidak valid")
			return
		}
		var n int
		if err := database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE code = ?`, code).Scan(&n); err != nil || n == 0 {
			respondError(w, http.StatusBadRequest, "Voucher chip tidak ditemukan")
			return
		}
		strUpdates[keyVoucherChipCode] = code
	}
	if body.FreeDigitalOnly != nil {
		strUpdates[keyFreeDigitalOnly] = strconv.Itoa(boolToInt(*body.FreeDigitalOnly))
	}
	if err := upsertAppSettings(strUpdates); err != nil {
		respondInternal(w, "update app_settings", err)
		return
	}

	cfg, err := loadTimerConfig()
	if err != nil {
		respondInternal(w, "reload timer config", err)
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}
