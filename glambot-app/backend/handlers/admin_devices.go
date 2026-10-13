package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"photobooth/services"
)

// Respons mengikuti kartu di features/admin/devices/components/*. Field yang
// tak terukur dari OS (sisa kertas/ribbon) dikirim kosong → N/A di UI.

const naValue = "N/A"

type cameraStatusDTO struct {
	ID             string `json:"id"`
	Resolution     string `json:"resolution"`
	Status         string `json:"status"`
	LastActive     string `json:"lastActive"`
	ActiveDuration string `json:"activeDuration"`
	IsOnline       bool   `json:"isOnline"`
}

type printerStatusDTO struct {
	ID              string `json:"id"`
	Resolution      string `json:"resolution"`
	Status          string `json:"status"`
	LastActive      string `json:"lastActive"`
	ActiveDuration  string `json:"activeDuration"`
	TotalPrint      int    `json:"totalPrint"`
	IsOnline        bool   `json:"isOnline"`
	PaperRemaining  int    `json:"paperRemaining"`
	PaperTotal      int    `json:"paperTotal"`
	RibbonRemaining int    `json:"ribbonRemaining"`
	PaperSize       string `json:"paperSize"`
	PaperType       string `json:"paperType"`
	IsReady         bool   `json:"isReady"`
}

type robotStatusDTO struct {
	ID             string `json:"id"`
	Status         string `json:"status"`
	LastActive     string `json:"lastActive"`
	ActiveDuration string `json:"activeDuration"`
	IsOnline       bool   `json:"isOnline"`
}

type devicesResponse struct {
	Camera  cameraStatusDTO  `json:"camera"`
	Printer printerStatusDTO `json:"printer"`
	Robot   robotStatusDTO   `json:"robot"`
}

const stampLayout = "02 Jan 2006, 15:04"

// deviceState melacak online/offline tiap device antar-poll. In-memory: reset
// saat backend restart, dan hanya ter-update saat endpoint /api/admin/devices
// dipanggil (mis. saat halaman Devices dibuka).
type deviceState struct {
	onlineSince time.Time // kapan device mulai online (untuk hitung durasi)
	lastSeen    time.Time // waktu terakhir device terlihat online
	wasOnline   bool
}

var (
	deviceStates   = map[string]*deviceState{}
	deviceStatesMu sync.Mutex
)

// trackDevice menerima status online device sekarang, lalu mengembalikan teks
// "Last Active" (waktu terakhir online) dan "Active Duration" (lama online
// berjalan — hanya terisi saat device online; offline → N/A).
func trackDevice(key string, online bool, now time.Time) (lastActive, activeDuration string) {
	deviceStatesMu.Lock()
	defer deviceStatesMu.Unlock()

	st := deviceStates[key]
	if st == nil {
		st = &deviceState{}
		deviceStates[key] = st
	}

	if online {
		if !st.wasOnline {
			st.onlineSince = now // transisi offline→online: mulai hitung durasi
		}
		st.wasOnline = true
		st.lastSeen = now
		return now.Format(stampLayout), formatActiveDuration(now.Sub(st.onlineSince))
	}

	st.wasOnline = false
	// Offline: Active Duration tidak berjalan → "Offline". Last Active = waktu
	// terakhir online; kalau belum pernah online sejak backend start → "Offline".
	if st.lastSeen.IsZero() {
		return "Offline", "Offline"
	}
	return st.lastSeen.Format(stampLayout), "Offline"
}

func formatActiveDuration(d time.Duration) string {
	if d < time.Minute {
		return "< 1 menit"
	}
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%d jam %d menit", h, m)
	}
	return fmt.Sprintf("%d menit", m)
}

// GET /api/admin/devices — tes koneksi nyata kamera, printer, robot.
func AdminGetDevices(w http.ResponseWriter, r *http.Request) {
	resp := devicesResponse{
		Camera:  probeCamera(),
		Printer: probePrinter(),
		Robot:   probeRobot(),
	}
	respondJSON(w, http.StatusOK, resp)
}

func probeCamera() cameraStatusDTO {
	// Hanya deteksi Canon (digiCamControl) — tanpa fallback builtin — supaya
	// "Online" benar-benar mencerminkan kamera fisik yang terhubung.
	cam, err := services.DetectCanonCamera()
	online := err == nil && cam != nil && cam.Connected
	lastActive, activeDur := trackDevice("camera", online, time.Now())

	dto := cameraStatusDTO{
		ID:             "Kamera",
		Resolution:     naValue,
		Status:         "Offline",
		LastActive:     lastActive,
		ActiveDuration: activeDur,
		IsOnline:       false,
	}
	if online {
		dto.ID = cam.CameraName
		dto.Status = "Active"
		dto.IsOnline = true
	}
	return dto
}

func probePrinter() printerStatusDTO {
	p := services.GetPrinterStatus()
	online := p.Found && p.Online
	lastActive, activeDur := trackDevice("printer", online, time.Now())

	// Konsumabel (kertas/ribbon/total print) tidak tersedia dari print spooler
	// OS generik → 0 + ditandai N/A di UI.
	dto := printerStatusDTO{
		ID:              naValue,
		Resolution:      naValue,
		Status:          "Offline",
		LastActive:      lastActive,
		ActiveDuration:  activeDur,
		TotalPrint:      0,
		IsOnline:        false,
		PaperRemaining:  0,
		PaperTotal:      0,
		RibbonRemaining: 0,
		PaperSize:       naValue,
		PaperType:       naValue,
		IsReady:         false,
	}
	if p.Found {
		dto.ID = p.Name
		if p.Online {
			dto.Status = "Online"
		} else {
			dto.Status = "Offline"
		}
		dto.IsOnline = p.Online
		dto.IsReady = p.Ready
	}
	return dto
}

func probeRobot() robotStatusDTO {
	res := services.PingRobot()
	online := res.Configured && res.Reachable
	lastActive, activeDur := trackDevice("robot", online, time.Now())

	dto := robotStatusDTO{
		ID:             "Robot",
		Status:         "Not configured",
		LastActive:     lastActive,
		ActiveDuration: activeDur,
		IsOnline:       false,
	}
	if !res.Configured {
		return dto
	}
	if host := robotHost(res.URL); host != "" {
		dto.ID = host
	}
	if res.Reachable {
		dto.Status = "Active"
		dto.IsOnline = true
	} else {
		dto.Status = "Offline"
	}
	return dto
}

// robotHost mengambil host dari URL robot untuk ditampilkan sebagai ID.
func robotHost(url string) string {
	s := url
	if i := strings.Index(s, "://"); i != -1 {
		s = s[i+3:]
	}
	if i := strings.IndexAny(s, "/?"); i != -1 {
		s = s[:i]
	}
	return s
}
