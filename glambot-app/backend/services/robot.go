package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"photobooth/config"
	"strings"
	"sync"
	"time"
)

var robotHTTPClient = &http.Client{Timeout: 12 * time.Second}

func robotBaseURL() (string, error) {
	if config.App == nil {
		return "", fmt.Errorf("config belum dimuat")
	}

	base := strings.TrimSpace(config.App.RobotAPIURL)
	if base == "" {
		return "", fmt.Errorf("ROBOT_API_URL belum diset")
	}

	return strings.TrimRight(base, "/"), nil
}

func callRobotAPI(method, path string, body []byte) error {
	base, err := robotBaseURL()
	if err != nil {
		return err
	}

	url := base + path
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return fmt.Errorf("gagal membuat request robot: %w", err)
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := robotHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("gagal memanggil robot api: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail := strings.TrimSpace(string(respBody))
		if detail != "" {
			return fmt.Errorf("robot api %s gagal: status %d: %s", path, resp.StatusCode, detail)
		}
		return fmt.Errorf("robot api %s gagal: status %d", path, resp.StatusCode)
	}

	return nil
}

// robotModeMu menjaga perintah mode kerja (enable/disable/stop) berjalan SATU
// PER SATU. Tanpa ini, disable yang dikirim saat enable masih di jalan bisa
// selesai duluan → enable mendarat belakangan dan lengan tetap aktif padahal
// sesi sudah berakhir. Dengan gerbang ini, urutan mendarat = urutan permintaan.
var robotModeMu sync.Mutex

// Mematikan robot itu langkah keselamatan, jadi tidak boleh menyerah pada
// kegagalan pertama (dobot bisa sesaat sibuk / jaringan kedip). Dicoba ulang,
// lalu masih ada emergency stop sebagai jaring terakhir.
const (
	robotDisableAttempts   = 3
	robotDisableRetryDelay = 700 * time.Millisecond
)

// Dobot membalas disable sebelum lengan selesai pulang, jadi "mati" baru dicatat
// setelah /robot/status melaporkan standby. Batasnya mencakup batal-enable + homing.
var (
	robotStandbyTimeout = 60 * time.Second
	robotStandbyPoll    = 500 * time.Millisecond
)

// EnableRobot memanggil API robot luar untuk menyalakan mode kerja.
// body (opsional) diteruskan apa adanya, mis. {"only":[7]} untuk retake.
func EnableRobot(body []byte) error {
	robotModeMu.Lock()
	defer robotModeMu.Unlock()

	if err := callRobotAPI(http.MethodPost, "/robot/enable", body); err != nil {
		return err
	}
	config.App.SetRobotEnabled(true)
	return nil
}

// DisableRobot memanggil API robot luar untuk mematikan mode kerja.
//
// Beda dari Enable: kegagalan di sini BERBAHAYA (lengan masih bisa bergerak
// padahal tidak ada sesi & tidak ada yang mengawasi), jadi dicoba beberapa kali
// dan kalau tetap gagal dijatuhkan ke emergency stop. Flag lokal hanya di-set
// false kalau robot benar-benar mengkonfirmasi — supaya `/api/robot/config`
// tidak melaporkan "mati" untuk robot yang nyatanya masih hidup.
//
// Konfirmasinya ditunggu di goroutine karena booth menunggu balasan request ini.
// robotModeMu ikut dipegang goroutine itu, jadi enable berikutnya tetap antre
// sampai lengan benar-benar mati.
func DisableRobot() error {
	robotModeMu.Lock()

	var lastErr error
	for attempt := 1; attempt <= robotDisableAttempts; attempt++ {
		if err := callRobotAPI(http.MethodPost, "/robot/disable", nil); err == nil {
			if attempt > 1 {
				log.Printf("✅ Robot disable berhasil pada percobaan ke-%d", attempt)
			}
			go func() {
				defer robotModeMu.Unlock()
				confirmRobotStandby()
			}()
			return nil
		} else {
			lastErr = err
			log.Printf("⚠️  Robot disable gagal (percobaan %d/%d): %v", attempt, robotDisableAttempts, err)
		}
		if attempt < robotDisableAttempts {
			time.Sleep(robotDisableRetryDelay)
		}
	}

	defer robotModeMu.Unlock()

	// Jaring terakhir: emergency stop. Lebih kasar dari disable, tapi jauh lebih
	// baik daripada meninggalkan lengan aktif tanpa sesi.
	log.Printf("🛑 Robot disable gagal %dx — mencoba emergency stop", robotDisableAttempts)
	if err := callRobotAPI(http.MethodPost, "/robot/stop", nil); err == nil {
		config.App.SetRobotEnabled(false)
		log.Printf("✅ Emergency stop berhasil setelah disable gagal")
		return nil
	} else {
		log.Printf("🚨 Emergency stop JUGA gagal: %v — robot mungkin masih aktif, cek fisik!", err)
	}

	return fmt.Errorf("robot tidak bisa dimatikan setelah %d percobaan + emergency stop: %w", robotDisableAttempts, lastErr)
}

// confirmRobotStandby menunggu dobot melaporkan standby. Kalau tidak kunjung
// standby atau dobot melaporkan error, jatuh ke emergency stop.
func confirmRobotStandby() {
	deadline := time.Now().Add(robotStandbyTimeout)
	var lastErr error
	for time.Now().Before(deadline) {
		status, err := fetchRobotStatus()
		lastErr = err
		if err == nil {
			if status.Standby {
				config.App.SetRobotEnabled(false)
				return
			}
			if status.Mode == "standby" {
				lastErr = fmt.Errorf("%s", status.Error)
				break
			}
		}
		time.Sleep(robotStandbyPoll)
	}

	log.Printf("🛑 Robot belum standby setelah disable (%v) — mencoba emergency stop", lastErr)
	if err := callRobotAPI(http.MethodPost, "/robot/stop", nil); err != nil {
		log.Printf("🚨 Emergency stop JUGA gagal: %v — robot mungkin masih aktif, cek fisik!", err)
		return
	}
	config.App.SetRobotEnabled(false)
}

type robotStatus struct {
	Mode    string `json:"mode"`
	Standby bool   `json:"standby"`
	Error   string `json:"error"`
}

func fetchRobotStatus() (*robotStatus, error) {
	base, err := robotBaseURL()
	if err != nil {
		return nil, err
	}
	resp, err := robotHTTPClient.Get(base + "/robot/status")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("robot status %d", resp.StatusCode)
	}
	var status robotStatus
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&status); err != nil {
		return nil, err
	}
	return &status, nil
}

// StopRobot memanggil emergency stop pada robot luar.
func StopRobot() error {
	robotModeMu.Lock()
	defer robotModeMu.Unlock()

	if err := callRobotAPI(http.MethodPost, "/robot/stop", nil); err != nil {
		return err
	}
	config.App.SetRobotEnabled(false)
	return nil
}

// UpdateRobotRuntimeConfig meneruskan parameter tuning (speed/timing) ke service
// dobot agar berlaku live tanpa restart. Body = JSON robotSettings (camelCase).
func UpdateRobotRuntimeConfig(body []byte) error {
	return callRobotAPI(http.MethodPost, "/config/runtime", body)
}

// TriggerPreset menjalankan preset gerakan robot di service luar.
func TriggerPreset(preset int) error {
	body, err := json.Marshal(map[string]int{"preset": preset})
	if err != nil {
		return fmt.Errorf("gagal encode preset: %w", err)
	}

	if err := callRobotAPI(http.MethodPost, "/robot/preset", body); err != nil {
		return err
	}

	if config.App != nil {
		config.App.SetCurrentPreset(preset)
	}

	return nil
}
