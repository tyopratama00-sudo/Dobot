package handlers

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log"
	"math"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"photobooth/database"
	"photobooth/mailer"
	"photobooth/services"
)

// Email Foto: setiap sesi yang punya Registrasi mendapat satu catatan di
// email_deliveries. Dispatcher (RunEmailFotoDispatch, dijalankan tiap menit
// oleh StartEmailFotoJob) mengirimnya begitu foto siap, mencoba ulang
// kegagalan sementara sampai sesi kedaluwarsa, dan tidak pernah mengirim
// setelah foto sesi dihapus.

// Status catatan pengiriman.
const (
	EmailFotoPending = "pending"
	EmailFotoSent    = "sent"
	EmailFotoFailed  = "failed"
	EmailFotoSkipped = "skipped"
)

// Isi yang terkirim.
const (
	EmailFotoLinkStrip = "link_strip"
	EmailFotoStripOnly = "strip"
	EmailFotoLinkOnly  = "link"
)

const (
	emailFotoInterval = time.Minute
	// Tunggu Drive sesudah sesi selesai (atau sesudah foto terakhir untuk sesi
	// tanpa strip) sebelum mengirim tanpa link / menyerah soal foto.
	emailFotoQuiet       = 10 * time.Minute
	emailFotoBatch       = 20
	emailFotoSendTimeout = 90 * time.Second
	defaultBoothName     = "Glambot Photo Booth"

	reasonNoPhotos    = "tidak ada foto"
	reasonDataDeleted = "data dihapus"
	reasonPhotosGone  = "sesi kedaluwarsa, foto sudah dihapus"
)

// Jeda percobaan ulang setelah gagal ke-1, ke-2, ke-3; sesudahnya tiap jam.
var emailFotoRetryDelays = []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour}

// ErrEmailFotoPhotosGone: foto sesi sudah (atau segera) dihapus, email tidak
// bisa dikirim lagi.
var ErrEmailFotoPhotosGone = errors.New("foto sesi sudah dihapus")

// ErrNoRegistration: sesi tidak punya alamat email untuk dikirimi.
var ErrNoRegistration = errors.New("sesi tidak punya registrasi")

// EmailFotoDelivery catatan pengiriman Email Foto satu sesi.
type EmailFotoDelivery struct {
	SessionID     string     `json:"session_id"`
	Recipient     string     `json:"recipient"`
	Status        string     `json:"status"`
	Content       string     `json:"content"`
	Attempts      int        `json:"attempts"`
	NextAttemptAt *time.Time `json:"next_attempt_at"`
	LastError     string     `json:"last_error"`
	SentAt        *time.Time `json:"sent_at"`
}

// GetEmailFotoDelivery catatan pengiriman sesi; sql.ErrNoRows kalau sesi tidak
// punya catatan (tidak pernah registrasi).
func GetEmailFotoDelivery(sessionID string) (EmailFotoDelivery, error) {
	var d EmailFotoDelivery
	err := database.DB.QueryRow(`
		SELECT session_id, recipient, status, content, attempts, next_attempt_at, last_error, sent_at
		FROM email_deliveries WHERE session_id = ?`, sessionID,
	).Scan(&d.SessionID, &d.Recipient, &d.Status, &d.Content, &d.Attempts, &d.NextAttemptAt, &d.LastError, &d.SentAt)
	return d, err
}

// QueueEmailFoto dipanggil setiap Registrasi disimpan. Membuat catatan pending
// untuk sesi baru. Alamat yang berubah selagi pending hanya mengganti penerima;
// alamat yang berubah setelah terkirim (atau gagal/dilewati) mengantre
// pengiriman baru ke alamat itu. Alamat yang sama tidak mengubah apa pun.
func QueueEmailFoto(sessionID, email string) error {
	_, err := database.DB.Exec(`
		INSERT INTO email_deliveries (session_id, recipient) VALUES (?, ?)
		ON CONFLICT (session_id) DO UPDATE SET
			recipient = EXCLUDED.recipient,
			status = 'pending',
			content = CASE WHEN email_deliveries.status = 'pending' THEN email_deliveries.content ELSE '' END,
			attempts = CASE WHEN email_deliveries.status = 'pending' THEN email_deliveries.attempts ELSE 0 END,
			next_attempt_at = CASE WHEN email_deliveries.status = 'pending' THEN email_deliveries.next_attempt_at ELSE NULL END,
			last_error = CASE WHEN email_deliveries.status = 'pending' THEN email_deliveries.last_error ELSE '' END,
			sent_at = CASE WHEN email_deliveries.status = 'pending' THEN email_deliveries.sent_at ELSE NULL END,
			updated_at = NOW()
		WHERE email_deliveries.recipient <> EXCLUDED.recipient`, sessionID, email)
	return err
}

// ResendEmailFoto (Kirim ulang admin) mengembalikan pengiriman ke pending
// dengan percobaan dari nol. email kosong = kirim ke alamat registrasi yang
// ada; email terisi = alamat yang diperbaiki, sekaligus mengganti email
// registrasi sesi. Pemanggil memvalidasi email (mailer.ValidAddress).
// Error: sql.ErrNoRows (sesi tidak ada), ErrNoRegistration,
// ErrEmailFotoPhotosGone.
func ResendEmailFoto(sessionID, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	var status, current string
	var expires time.Time
	if err := database.DB.QueryRow(
		`SELECT status, expires_at, registration_email FROM sessions WHERE id = ?`, sessionID,
	).Scan(&status, &expires, &current); err != nil {
		return err
	}
	if status == "expired" || !expires.After(time.Now()) {
		return ErrEmailFotoPhotosGone
	}
	if email == "" {
		email = current
	}
	if email == "" {
		return ErrNoRegistration
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`
		UPDATE sessions SET registration_email = ?, registered_at = COALESCE(registered_at, NOW())
		WHERE id = ?`, email, sessionID); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		INSERT INTO email_deliveries (session_id, recipient) VALUES (?, ?)
		ON CONFLICT (session_id) DO UPDATE SET
			recipient = EXCLUDED.recipient, status = 'pending', content = '',
			attempts = 0, next_attempt_at = NULL, last_error = '', sent_at = NULL,
			updated_at = NOW()`, sessionID, email); err != nil {
		return err
	}
	return tx.Commit()
}

// ForgetEmailFotoRecipient dipanggil saat data registrasi dihapus: alamat
// penerima dikosongkan dan pengiriman yang masih pending dihentikan
// (skipped, "data dihapus"). Status yang sudah final tetap tercatat.
func ForgetEmailFotoRecipient(sessionID string) error {
	_, err := database.DB.Exec(`
		UPDATE email_deliveries SET
			recipient = '',
			last_error = CASE WHEN status = 'pending' THEN ? ELSE last_error END,
			status = CASE WHEN status = 'pending' THEN 'skipped' ELSE status END,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE session_id = ?`, reasonDataDeleted, sessionID)
	return err
}

// StartEmailFotoJob menjalankan dispatcher Email Foto tiap menit.
func StartEmailFotoJob() {
	log.Printf("📧 Email Foto job aktif (cek tiap %s)", emailFotoInterval)
	go func() {
		ticker := time.NewTicker(emailFotoInterval)
		defer ticker.Stop()
		for range ticker.C {
			RunEmailFotoDispatch(time.Now())
		}
	}()
}

// pendingEmailFoto satu pengiriman yang jatuh tempo beserta data sesinya.
type pendingEmailFoto struct {
	SessionID, Recipient, LastError string
	Attempts                        int
	SessionStatus, Name             string
	ExpiresAt                       time.Time
	CompletedAt, RegisteredAt       *time.Time
	DriveURL                        string
	DriveSynced                     bool
}

// RunEmailFotoDispatch satu putaran dispatcher pada waktu now: memproses
// setiap pengiriman pending yang jatuh tempo memakai mailer.Current(). Tanpa
// mailer (email belum diatur) tidak ada yang berubah.
func RunEmailFotoDispatch(now time.Time) {
	m := mailer.Current()
	if m == nil {
		return
	}
	due, err := dueEmailFoto(now)
	if err != nil {
		log.Printf("⚠️  email foto query gagal: %v", err)
		return
	}
	if len(due) == 0 {
		return
	}
	booth := emailFotoBoothName()
	for _, p := range due {
		dispatchEmailFoto(m, booth, now, p)
	}
}

func dueEmailFoto(now time.Time) ([]pendingEmailFoto, error) {
	rows, err := database.DB.Query(`
		SELECT d.session_id, d.recipient, d.last_error, d.attempts,
		       s.status, s.registration_name, s.expires_at, s.completed_at, s.registered_at,
		       s.drive_url, s.drive_synced
		FROM email_deliveries d JOIN sessions s ON s.id = d.session_id
		WHERE d.status = 'pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
		ORDER BY d.created_at
		LIMIT ?`, now, emailFotoBatch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []pendingEmailFoto
	for rows.Next() {
		var p pendingEmailFoto
		if err := rows.Scan(&p.SessionID, &p.Recipient, &p.LastError, &p.Attempts,
			&p.SessionStatus, &p.Name, &p.ExpiresAt, &p.CompletedAt, &p.RegisteredAt,
			&p.DriveURL, &p.DriveSynced); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func dispatchEmailFoto(m mailer.Mailer, booth string, now time.Time, p pendingEmailFoto) {
	// Foto sesi dihapus saat kedaluwarsa: setelah itu tidak ada yang dikirim.
	if p.SessionStatus == "expired" || !now.Before(p.ExpiresAt) {
		reason := p.LastError
		if reason == "" {
			reason = reasonPhotosGone
		}
		finishEmailFoto(p.SessionID, EmailFotoFailed, reason)
		return
	}
	if p.Recipient == "" {
		finishEmailFoto(p.SessionID, EmailFotoSkipped, reasonDataDeleted)
		return
	}

	content, strip, ready := emailFotoReadiness(now, p)
	if !ready {
		return
	}
	if content == "" {
		finishEmailFoto(p.SessionID, EmailFotoSkipped, reasonNoPhotos)
		return
	}

	msg := emailFotoMessage(booth, p, content, now)
	if strip != nil {
		msg.Attachments = []mailer.Attachment{*strip}
	}
	ctx, cancel := context.WithTimeout(context.Background(), emailFotoSendTimeout)
	err := m.Send(ctx, msg)
	cancel()

	attempts := p.Attempts + 1
	switch {
	case err == nil:
		_, err = database.DB.Exec(`
			UPDATE email_deliveries SET status = 'sent', content = ?, attempts = ?, sent_at = ?,
				next_attempt_at = NULL, last_error = '', updated_at = NOW()
			WHERE session_id = ? AND status = 'pending'`, content, attempts, now, p.SessionID)
		log.Printf("📧 email foto terkirim (%s, %s)", p.SessionID, content)
	case mailer.IsPermanent(err):
		_, err = database.DB.Exec(`
			UPDATE email_deliveries SET status = 'failed', attempts = ?, last_error = ?,
				next_attempt_at = NULL, updated_at = NOW()
			WHERE session_id = ? AND status = 'pending'`, attempts, err.Error(), p.SessionID)
		log.Printf("⚠️  email foto ditolak (%s)", p.SessionID)
	default:
		next := now.Add(emailFotoRetryDelay(attempts))
		_, err = database.DB.Exec(`
			UPDATE email_deliveries SET attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = NOW()
			WHERE session_id = ? AND status = 'pending'`, attempts, err.Error(), next, p.SessionID)
		log.Printf("⚠️  email foto gagal (%s), dicoba lagi %s", p.SessionID, next.Format("15:04"))
	}
	if err != nil {
		log.Printf("⚠️  gagal simpan status email foto (%s): %v", p.SessionID, err)
	}
}

func emailFotoRetryDelay(attempts int) time.Duration {
	if attempts > len(emailFotoRetryDelays) {
		attempts = len(emailFotoRetryDelays)
	}
	return emailFotoRetryDelays[attempts-1]
}

func finishEmailFoto(sessionID, status, reason string) {
	if _, err := database.DB.Exec(`
		UPDATE email_deliveries SET status = ?, last_error = ?, next_attempt_at = NULL, updated_at = NOW()
		WHERE session_id = ? AND status = 'pending'`, status, reason, sessionID); err != nil {
		log.Printf("⚠️  gagal simpan status email foto (%s): %v", sessionID, err)
	}
}

// emailFotoReadiness menerapkan aturan kesiapan. ready=false: tunggu putaran
// berikutnya. ready=true dengan content kosong: tidak ada foto untuk dikirim.
func emailFotoReadiness(now time.Time, p pendingEmailFoto) (content string, strip *mailer.Attachment, ready bool) {
	driveOn := services.IsDriveEnabled()
	link := driveOn && p.DriveURL != ""

	if strip = emailFotoStrip(p.SessionID); strip != nil {
		switch {
		case link && p.DriveSynced:
			return EmailFotoLinkStrip, strip, true
		case p.CompletedAt != nil && !now.Before(p.CompletedAt.Add(emailFotoQuiet)):
			return EmailFotoStripOnly, strip, true
		}
		return "", nil, false
	}

	// Tanpa strip: tunggu sampai 10 menit tanpa foto baru (sesi berhenti di
	// tengah jalan), dihitung dari registrasi kalau belum ada foto sama sekali.
	var raws int
	var lastRaw *time.Time
	if err := database.DB.QueryRow(`
		SELECT COUNT(*), MAX(created_at) FROM photos WHERE session_id = ? AND type = 'raw'`, p.SessionID,
	).Scan(&raws, &lastRaw); err != nil {
		log.Printf("⚠️  email foto: gagal baca foto (%s): %v", p.SessionID, err)
		return "", nil, false
	}
	last := p.RegisteredAt
	if lastRaw != nil && (last == nil || lastRaw.After(*last)) {
		last = lastRaw
	}
	if last != nil && now.Before(last.Add(emailFotoQuiet)) {
		return "", nil, false
	}
	if raws > 0 && link {
		return EmailFotoLinkOnly, nil, true
	}
	return "", nil, true
}

// emailFotoStrip strip final terbaru sebagai lampiran, nil kalau belum ada.
func emailFotoStrip(sessionID string) *mailer.Attachment {
	rel, err := latestFramedStripRelPath(sessionID)
	if err != nil {
		return nil
	}
	abs, ok := safeStoragePath(rel)
	if !ok {
		return nil
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return nil
	}
	ext := strings.ToLower(filepath.Ext(abs))
	return &mailer.Attachment{Filename: "strip-foto" + ext, ContentType: imageContentType(ext), Data: data}
}

func imageContentType(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	}
	return mime.TypeByExtension(ext)
}

// emailFotoBoothName nama booth dari brand label admin, atau nama bawaan.
func emailFotoBoothName() string {
	stored, _ := readAppSettings("brand_label")
	if name := strings.TrimSpace(stored["brand_label"]); name != "" {
		return name
	}
	return defaultBoothName
}

var (
	indonesianMonths = []string{"Januari", "Februari", "Maret", "April", "Mei", "Juni",
		"Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	indonesianDays = []string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}
)

// indonesianTime mis. "Jumat, 13 November 2026 pukul 10.00".
func indonesianTime(t time.Time) string {
	t = t.Local()
	return fmt.Sprintf("%s, %d %s %d pukul %02d.%02d",
		indonesianDays[t.Weekday()], t.Day(), indonesianMonths[t.Month()-1], t.Year(), t.Hour(), t.Minute())
}

// linkLifetime lama link masih tersedia, mis. "sekitar 3 hari".
func linkLifetime(now, expires time.Time) string {
	days := int(math.Round(expires.Sub(now).Hours() / 24))
	if days < 1 {
		return "kurang dari sehari lagi"
	}
	return fmt.Sprintf("sekitar %d hari", days)
}

// emailFotoMessage menyusun Email Foto (bahasa Indonesia, teks tetap).
func emailFotoMessage(booth string, p pendingEmailFoto, content string, now time.Time) mailer.Message {
	name := p.Name
	if name == "" {
		name = "kamu"
	}
	withLink := content == EmailFotoLinkStrip || content == EmailFotoLinkOnly
	withStrip := content == EmailFotoLinkStrip || content == EmailFotoStripOnly

	// Paragraf berupa teks biasa; link ditandai supaya versi HTML bisa
	// menjadikannya tautan.
	type para struct{ text, link string }
	paras := []para{{text: fmt.Sprintf("Terima kasih sudah berfoto di %s!", booth)}}
	if withLink {
		paras = append(paras,
			para{text: "Semua foto dan GIF dari sesimu bisa diunduh di link berikut:", link: p.DriveURL},
			para{text: fmt.Sprintf("Link ini tersedia %s, sampai %s. Unduh fotomu sebelum waktu itu ya.",
				linkLifetime(now, p.ExpiresAt), indonesianTime(p.ExpiresAt))})
	} else {
		paras = append(paras, para{text: "Link folder foto sesimu tidak tersedia, jadi strip foto finalmu kami lampirkan di email ini."})
	}
	if withLink && withStrip {
		paras = append(paras, para{text: "Strip foto finalmu juga kami lampirkan di email ini."})
	}
	paras = append(paras, para{text: "Sampai jumpa lagi!"})

	var text, htm strings.Builder
	fmt.Fprintf(&text, "Halo %s,\n\n", name)
	fmt.Fprintf(&htm, "<p>Halo %s,</p>\n", html.EscapeString(name))
	for _, pr := range paras {
		text.WriteString(pr.text + "\n")
		if pr.link != "" {
			text.WriteString(pr.link + "\n")
		}
		text.WriteString("\n")
		htm.WriteString("<p>" + html.EscapeString(pr.text))
		if pr.link != "" {
			l := html.EscapeString(pr.link)
			fmt.Fprintf(&htm, `<br><a href="%s">%s</a>`, l, l)
		}
		htm.WriteString("</p>\n")
	}
	text.WriteString(booth + "\n")
	htm.WriteString("<p>" + html.EscapeString(booth) + "</p>\n")

	return mailer.Message{
		To:       mailer.Address{Email: p.Recipient, Name: p.Name},
		FromName: booth,
		Subject:  fmt.Sprintf("Foto kamu dari %s 📸", booth),
		Text:     text.String(),
		HTML:     htm.String(),
	}
}
