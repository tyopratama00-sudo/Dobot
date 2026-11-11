package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
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

// whatsappStrip membuang pemisah yang lazim diketik pada nomor telepon.
var whatsappStrip = strings.NewReplacer(" ", "", "-", "", ".", "", "(", "", ")", "")

// NormalizeWhatsApp mengubah nomor WhatsApp ke bentuk wa.me (kode negara +
// nomor, digit saja): spasi, -, ., ( ) dibuang, + di depan dibuang, 0 di depan
// menjadi 62. Hasil harus 10-15 digit dan tidak diawali 0. ok=false bila tidak
// valid. Booth memakai aturan yang sama (whatsapp.ts).
func NormalizeWhatsApp(s string) (string, bool) {
	n := strings.TrimPrefix(whatsappStrip.Replace(s), "+")
	if strings.HasPrefix(n, "0") {
		n = "62" + n[1:]
	}
	if len(n) < 10 || len(n) > 15 || n[0] == '0' {
		return "", false
	}
	for _, c := range n {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	return n, true
}

// SaveSessionRegistration PUT /api/session/{sessionID}/registration {name, email, whatsapp?}
// — simpan atau ubah Registrasi pelanggan pada sesi (ADR 0001: per sesi, bukan
// akun). Boleh sejak sesi lunas sampai sesi kedaluwarsa; dipanggil lagi untuk
// mengubah nama/email. registered_at = waktu registrasi pertama. Setelah admin
// menghapus data registrasi, sesi tidak bisa diregistrasi lagi (403).
// whatsapp opsional: "" mengosongkan nomor, field tidak dikirim (atau null)
// mempertahankan nomor yang tersimpan. Booth selalu mengirimnya.
func SaveSessionRegistration(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	var body struct {
		Name     string  `json:"name"`
		Email    string  `json:"email"`
		WhatsApp *string `json:"whatsapp"`
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
	// nil = pertahankan nomor tersimpan; "" = kosongkan.
	var whatsapp *string
	if body.WhatsApp != nil {
		wa := ""
		if strings.TrimSpace(*body.WhatsApp) != "" {
			n, ok := NormalizeWhatsApp(*body.WhatsApp)
			if !ok {
				respondError(w, http.StatusBadRequest, "Nomor WhatsApp tidak valid")
				return
			}
			wa = n
		}
		whatsapp = &wa
	}

	at, saved, err := storeRegistration(sessionID, name, email, whatsapp)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	case errors.Is(err, errSessionEnded):
		respondError(w, http.StatusGone, "Sesi sudah berakhir")
		return
	case errors.Is(err, errSessionUnpaid):
		respondError(w, http.StatusConflict, "Sesi belum dibayar")
		return
	case errors.Is(err, errRegistrationDeleted):
		respondError(w, http.StatusForbidden, "Data registrasi sesi ini sudah dihapus petugas, jadi email tidak bisa diubah lagi.")
		return
	case err != nil:
		respondInternal(w, "save registration", err)
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]any{
		"session_id":    sessionID,
		"name":          name,
		"email":         email,
		"whatsapp":      saved,
		"registered_at": at,
	}))
}

var (
	errSessionUnpaid       = errors.New("sesi belum dibayar")
	errSessionEnded        = errors.New("sesi sudah berakhir")
	errRegistrationDeleted = errors.New("registrasi sudah dihapus")
)

// storeRegistration menyimpan registrasi dan mengantre Email Foto dalam satu
// transaksi, dengan baris sesi dikunci supaya Hapus data registrasi yang
// berjalan bersamaan tidak bisa tertimpa. whatsapp nil = pertahankan nomor
// tersimpan. Mengembalikan registered_at dan nomor WhatsApp yang tersimpan.
func storeRegistration(sessionID, name, email string, whatsapp *string) (at time.Time, saved string, err error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return at, saved, err
	}
	defer tx.Rollback()

	var status models.SessionStatus
	var expires time.Time
	var deletedAt *time.Time
	if err := tx.QueryRow(`
		SELECT status, expires_at, registration_deleted_at FROM sessions WHERE id = ? FOR UPDATE`, sessionID,
	).Scan(&status, &expires, &deletedAt); err != nil {
		return at, saved, err
	}
	switch {
	case status == models.StatusExpired || !expires.After(time.Now()):
		return at, saved, errSessionEnded
	case status == models.StatusPendingPayment:
		return at, saved, errSessionUnpaid
	case deletedAt != nil:
		return at, saved, errRegistrationDeleted
	}

	if err := tx.QueryRow(`
		UPDATE sessions
		SET registration_name = ?, registration_email = ?,
			registration_whatsapp = COALESCE(?::text, registration_whatsapp),
			registered_at = COALESCE(registered_at, NOW())
		WHERE id = ?
		RETURNING registered_at, registration_whatsapp`, name, email, whatsapp, sessionID,
	).Scan(&at, &saved); err != nil {
		return at, saved, err
	}
	if err := queueEmailFoto(tx, sessionID, email); err != nil {
		return at, saved, err
	}
	return at, saved, tx.Commit()
}

// SessionHeartbeat POST /api/session/{sessionID}/heartbeat — booth masih
// menampilkan sesi ini (dikirim tiap 10 detik selama sesi berjalan).
// Dispatcher Email Foto memakai last_seen_at untuk tahu sesi tanpa strip
// belum berhenti.
func SessionHeartbeat(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	res, err := database.DB.Exec(`UPDATE sessions SET last_seen_at = NOW() WHERE id = ?`, sessionID)
	if err != nil {
		respondInternal(w, "session heartbeat", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]any{"ok": true}))
}
