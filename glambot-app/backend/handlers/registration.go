package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"photobooth/database"
	"photobooth/mailer"
	"photobooth/models"
)

const (
	maxRegistrationName  = 80
	maxRegistrationEmail = 254
)

// SaveSessionRegistration PUT /api/session/{sessionID}/registration {name, email}
// — simpan atau ubah Registrasi pelanggan pada sesi (ADR 0001: per sesi, bukan
// akun). Boleh sejak sesi lunas sampai sesi kedaluwarsa; dipanggil lagi untuk
// mengubah nama/email. registered_at = waktu registrasi pertama.
func SaveSessionRegistration(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	var body struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	name := strings.Join(strings.Fields(body.Name), " ")
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if name == "" || len([]rune(name)) > maxRegistrationName {
		respondError(w, http.StatusBadRequest, "Nama wajib diisi (maks 80 karakter)")
		return
	}
	if len(email) > maxRegistrationEmail || !mailer.ValidAddress(email) {
		respondError(w, http.StatusBadRequest, "Alamat email tidak valid")
		return
	}

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	}
	switch {
	case session.Status == models.StatusExpired || !session.ExpiresAt.After(time.Now()):
		respondError(w, http.StatusGone, "Sesi sudah berakhir")
		return
	case session.Status == models.StatusPendingPayment:
		respondError(w, http.StatusConflict, "Sesi belum dibayar")
		return
	}

	var at time.Time
	if err := database.DB.QueryRow(`
		UPDATE sessions
		SET registration_name = ?, registration_email = ?, registered_at = COALESCE(registered_at, NOW())
		WHERE id = ?
		RETURNING registered_at`, name, email, sessionID,
	).Scan(&at); err != nil {
		respondInternal(w, "save registration", err)
		return
	}
	if err := QueueEmailFoto(sessionID, email); err != nil {
		respondInternal(w, "queue email foto", err)
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]any{
		"session_id":    sessionID,
		"name":          name,
		"email":         email,
		"registered_at": at,
	}))
}
