package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"photobooth/auth"
	"photobooth/config"
	"photobooth/database"
)

// EnsureDefaultAdmin meng-seed satu akun admin default kalau tabel masih kosong.
// Dipanggil dari main.go setelah database.Init.
func EnsureDefaultAdmin() {
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM admins`).Scan(&count); err != nil {
		log.Printf("⚠️  Gagal cek tabel admins: %v", err)
		return
	}
	if count > 0 {
		return
	}

	email := strings.TrimSpace(strings.ToLower(config.App.AdminEmail))
	hash, err := auth.HashPassword(config.App.AdminPassword)
	if err != nil {
		log.Printf("⚠️  Gagal hash password admin default: %v", err)
		return
	}
	if _, err := database.DB.Exec(
		`INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)`,
		email, hash, "Admin",
	); err != nil {
		log.Printf("⚠️  Gagal seed admin default: %v", err)
		return
	}
	log.Printf("👤 Admin default dibuat: %s (ganti password via ADMIN_PASSWORD)", email)
}

type adminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type adminInfo struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

type adminLoginResponse struct {
	Token string    `json:"token"`
	Admin adminInfo `json:"admin"`
}

// POST /api/admin/login
func AdminLogin(w http.ResponseWriter, r *http.Request) {
	var req adminLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Format request tidak valid")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "Email dan password wajib diisi")
		return
	}

	var (
		id   int64
		hash string
		name string
	)
	err := database.DB.QueryRow(
		`SELECT id, password_hash, name FROM admins WHERE email = ?`, req.Email,
	).Scan(&id, &hash, &name)
	if err == sql.ErrNoRows || (err == nil && !auth.VerifyPassword(hash, req.Password)) {
		respondError(w, http.StatusUnauthorized, "Email atau password salah")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memproses login")
		return
	}

	token, err := auth.GenerateToken(id, req.Email)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat token")
		return
	}

	respondJSON(w, http.StatusOK, adminLoginResponse{
		Token: token,
		Admin: adminInfo{Email: req.Email, Name: name},
	})
}
