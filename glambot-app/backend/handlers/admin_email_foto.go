package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"photobooth/database"
	"photobooth/mailer"
	"photobooth/models"

	"github.com/go-chi/chi/v5"
)

// sessionEmailFoto status Email Foto pada detail sesi admin.
type sessionEmailFoto struct {
	Status        string  `json:"status"`
	Recipient     string  `json:"recipient"`
	Content       string  `json:"content"`
	Attempts      int     `json:"attempts"`
	Reason        string  `json:"reason"`
	SentAt        *string `json:"sent_at"`
	NextAttemptAt *string `json:"next_attempt_at"`
}

func rfc3339(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

// emailFotoOf catatan Email Foto sesi untuk detail admin; nil bila sesi tidak
// punya catatan (tidak pernah registrasi).
func emailFotoOf(sessionID string) (*sessionEmailFoto, error) {
	d, err := GetEmailFotoDelivery(sessionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sessionEmailFoto{
		Status: d.Status, Recipient: d.Recipient, Content: d.Content, Attempts: d.Attempts,
		Reason: d.LastError, SentAt: rfc3339(d.SentAt), NextAttemptAt: rfc3339(d.NextAttemptAt),
	}, nil
}

// POST /api/admin/sessions/{id}/email-foto/resend {email?} — Kirim ulang.
// email kosong = alamat registrasi yang ada; terisi = alamat yang diperbaiki,
// sekaligus mengganti email registrasi.
func AdminResendEmailFoto(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email != "" && (len(email) > maxRegistrationEmail || !mailer.ValidAddress(email)) {
		respondError(w, http.StatusBadRequest, "Alamat email tidak valid")
		return
	}
	switch err := ResendEmailFoto(id, email); {
	case errors.Is(err, sql.ErrNoRows):
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	case errors.Is(err, ErrNoRegistration):
		respondError(w, http.StatusConflict, "Sesi tidak punya email registrasi; isi alamat email")
		return
	case errors.Is(err, ErrEmailFotoPhotosGone):
		respondError(w, http.StatusGone, "Foto sesi sudah dihapus, email tidak bisa dikirim lagi")
		return
	case err != nil:
		respondInternal(w, "resend email foto", err)
		return
	}
	ef, err := emailFotoOf(id)
	if err != nil {
		respondInternal(w, "email foto status", err)
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]any{"email_foto": ef}))
}

// DELETE /api/admin/sessions/{id}/registration — Hapus data registrasi:
// nama, email dan nomor WhatsApp dikosongkan, Email Foto yang belum terkirim dihentikan.
// Baris sesi, foto, dan transaksi tetap ada.
func AdminDeleteRegistration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var exists bool
	if err := database.DB.QueryRow(`SELECT EXISTS (SELECT 1 FROM sessions WHERE id = ?)`, id).Scan(&exists); err != nil {
		respondInternal(w, "find session", err)
		return
	}
	if !exists {
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	}
	// Hentikan pengiriman dulu supaya dispatcher tidak sempat memakai alamatnya.
	if err := ForgetEmailFotoRecipient(id); err != nil {
		respondInternal(w, "forget email foto", err)
		return
	}
	if _, err := database.DB.Exec(`UPDATE sessions SET registration_name = '', registration_email = '', registration_whatsapp = '' WHERE id = ?`, id); err != nil {
		respondInternal(w, "delete registration", err)
		return
	}
	ef, err := emailFotoOf(id)
	if err != nil {
		respondInternal(w, "email foto status", err)
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]any{"email_foto": ef}))
}
