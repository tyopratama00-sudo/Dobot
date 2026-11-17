package config

import (
	"bufio"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Default dev — TIDAK boleh dipakai di production (lihat pengecekan di Load).
const (
	defaultJWTSecret     = "glambot-dev-secret-change-me"
	defaultAdminPassword = "admin123"
)

type Config struct {
	mu                   sync.RWMutex
	AppPort              string
	AppEnv               string
	DatabaseURL          string
	MidtransServerKey    string
	MidtransEnv          string
	StoragePath          string
	DigiCamBaseURL       string
	DigiCamCaptureDir    string
	PaymentExpiryMins    int
	SessionExpiryHours   int
	CleanupIntervalHours int
	FrontendURL          string
	RobotAPIURL          string
	RobotEnabled         bool
	CurrentPreset        int
	AutoCaptureAt        time.Time

	// ─── Admin / Auth ────────────────────────────────────────────────────────
	JWTSecret     string // secret untuk menandatangani token admin (HMAC-SHA256)
	AdminEmail    string // kredensial admin default yang di-seed saat startup
	AdminPassword string

	// Google Drive — refresh token dari cmd/gdrive-token. FolderID opsional:
	// induk folder per-sesi (kosong = root My Drive).
	GoogleClientID      string
	GoogleClientSecret  string
	GoogleRefreshToken  string
	GoogleDriveFolderID string

	// Gmail SMTP untuk email booth (Email Foto, email uji). Dianggap aktif
	// hanya kalau SMTPUser & SMTPAppPassword terisi — lihat mailer.Configured.
	SMTPUser        string // alamat Gmail booth, juga alamat pengirim
	SMTPAppPassword string // App Password Google (butuh 2-step verification)
	SMTPHost        string
	SMTPPort        int
	SMTPFromName    string // nama tampilan pengirim (opsional)

	// Layanan pembayaran & upload milik owner (pay.photorobot.id). Kalau URL
	// terisi, QRIS lewat layanan ini dan MIDTRANS_SERVER_KEY tidak dipakai.
	// Token hanya dibaca dari .env — jangan ditulis ke log atau frontend.
	PaymentGatewayURL   string
	PaymentGatewayToken string
	R2UploadEnabled     bool
}

var App *Config

func Load() {
	if !loadEnvFile(".env") {
		loadEnvFile("backend/.env")
	}

	App = &Config{
		AppPort:              getEnv("APP_PORT", "8080"),
		AppEnv:               getEnv("APP_ENV", "development"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/photobooth?sslmode=disable"),
		MidtransServerKey:    getEnv("MIDTRANS_SERVER_KEY", ""),
		MidtransEnv:          getEnv("MIDTRANS_ENV", "sandbox"),
		StoragePath:          getEnv("STORAGE_PATH", "./storage"),
		DigiCamBaseURL:       getEnv("DIGICAM_BASE_URL", "http://localhost:5513/api"),
		DigiCamCaptureDir:    getEnv("DIGICAM_CAPTURE_DIR", ""),
		PaymentExpiryMins:    getEnvInt("PAYMENT_EXPIRY_MINS", 2),
		SessionExpiryHours:   getEnvInt("SESSION_EXPIRY_HOURS", 72),
		CleanupIntervalHours: getEnvInt("CLEANUP_INTERVAL_HOURS", 24),
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:3000"),
		RobotAPIURL:          getEnv("ROBOT_API_URL", ""),
		RobotEnabled:         getEnv("ROBOT_ENABLED", "false") == "true",
		JWTSecret:            getEnv("JWT_SECRET", defaultJWTSecret),
		AdminEmail:           getEnv("ADMIN_EMAIL", "admin@glambot.com"),
		AdminPassword:        getEnv("ADMIN_PASSWORD", defaultAdminPassword),
		GoogleClientID:       getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRefreshToken:   getEnv("GOOGLE_REFRESH_TOKEN", ""),
		GoogleDriveFolderID:  getEnv("GOOGLE_DRIVE_FOLDER_ID", ""),
		SMTPUser:             getEnv("SMTP_USER", ""),
		SMTPAppPassword:      getEnv("SMTP_APP_PASSWORD", ""),
		SMTPHost:             getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:             getEnvInt("SMTP_PORT", 587),
		SMTPFromName:         getEnv("SMTP_FROM_NAME", ""),
		PaymentGatewayURL:    getEnv("PAYMENT_GATEWAY_URL", ""),
		PaymentGatewayToken:  getEnv("PAYMENT_GATEWAY_TOKEN", ""),
		R2UploadEnabled:      getEnv("R2_UPLOAD_ENABLED", "false") == "true",
	}

	// Hardening: tolak start di production kalau secret/password masih default.
	if App.AppEnv == "production" {
		if App.JWTSecret == defaultJWTSecret || App.AdminPassword == defaultAdminPassword {
			log.Fatal("FATAL: JWT_SECRET / ADMIN_PASSWORD masih nilai default di production — set env yang aman sebelum menjalankan backend.")
		}
	} else if App.JWTSecret == defaultJWTSecret {
		log.Println("⚠️  JWT_SECRET memakai default dev — wajib diganti sebelum deploy ke production.")
	}
}

func (c *Config) SetRobotEnabled(enabled bool) {
	if c == nil {
		return
	}

	c.mu.Lock()
	c.RobotEnabled = enabled
	c.mu.Unlock()
}

func (c *Config) GetRobotEnabled() bool {
	if c == nil {
		return false
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.RobotEnabled
}

func (c *Config) SetCurrentPreset(currentPreset int) {
	if c == nil {
		return
	}

	c.mu.Lock()
	c.CurrentPreset = currentPreset
	c.mu.Unlock()
}

func (c *Config) GetCurrentPreset() int {
	if c == nil {
		return 0
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.CurrentPreset
}

func (c *Config) SetAutoCaptureAt(autoCaptureAt time.Time) {
	if c == nil {
		return
	}

	c.mu.Lock()
	c.AutoCaptureAt = autoCaptureAt
	c.mu.Unlock()
}

func (c *Config) GetAutoCaptureAt() time.Time {
	if c == nil {
		return time.Time{}
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.AutoCaptureAt
}

func (c *Config) ResetRobotState() {
	if c == nil {
		return
	}

	c.mu.Lock()
	c.CurrentPreset = 0
	c.AutoCaptureAt = time.Time{}
	c.mu.Unlock()
}

func loadEnvFile(filename string) bool {
	f, err := os.Open(filename)
	if err != nil {
		return false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}

	return true
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
