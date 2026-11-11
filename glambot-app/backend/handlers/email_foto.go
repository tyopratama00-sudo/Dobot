package handlers

import (
	"context"
	"database/sql"
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
	"photobooth/models"
	"photobooth/services"
)

// Email Foto: setiap sesi yang punya Registrasi mendapat satu catatan di
// email_deliveries. Dispatcher (RunEmailFotoDispatch, dijalankan tiap menit
// oleh StartEmailFotoJob) mengirimnya begitu foto siap, mencoba ulang
// kegagalan sementara sampai sesi kedaluwarsa, dan tidak pernah mengirim
// setelah foto sesi dihapus.
//
// Penguncian: setiap penulis memakai urutan yang sama, baris sessions dulu
// baru email_deliveries (registrasi, Hapus data registrasi, Kirim ulang,
// cleanup). Dispatcher hanya mengunci baris email_deliveries, selama
// memeriksa dan mengirim, lalu membaca ulang data sesi di bawah kunci itu.
// Jadi hapus atau ganti email yang sudah commit lebih dulu selalu menang,
// dan yang datang selagi email sedang dikirim menunggu sampai kirim selesai.

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
	emailFotoQuiet = 10 * time.Minute
	// Booth mengirim heartbeat berisi sesi yang sedang tampil tiap 10 detik
	// (POST /api/session/{id}/heartbeat → sessions.last_seen_at). Sesi yang
	// masih disebut dalam 2 menit terakhir masih berjalan (pelanggan mungkin
	// sedang diam di layar frame/pilih foto/edit), jadi aturan "tanpa strip"
	// belum boleh dipakai: strip masih bisa datang.
	emailFotoBoothActive = 2 * time.Minute
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

// ErrNoRegistration: sesi tidak punya Registrasi (tidak pernah registrasi,
// atau datanya sudah dihapus admin), jadi tidak ada yang bisa dikirimi.
var ErrNoRegistration = errors.New("sesi tidak punya registrasi")

// sqlRunner bagian dari database.DB / transaksi yang dipakai di sini.
type sqlRunner interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	QueryRow(query string, args ...interface{}) *sql.Row
}

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

// queueEmailFoto dipanggil setiap Registrasi disimpan (di dalam transaksinya).
// Membuat catatan pending untuk sesi baru. Alamat yang berubah selagi pending
// hanya mengganti penerima; alamat yang berubah setelah terkirim (atau
// gagal/dilewati) mengantre pengiriman baru ke alamat itu. Alamat yang sama
// tidak mengubah apa pun.
func queueEmailFoto(q sqlRunner, sessionID, email string) error {
	_, err := q.Exec(`
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
// registrasi sesi. Pemanggil memvalidasi email (mailer.ValidAddress). Hanya
// untuk sesi yang punya Registrasi yang belum dihapus; status dan
// kedaluwarsa diperiksa di bawah kunci baris sesi.
// Error: sql.ErrNoRows (sesi tidak ada), ErrNoRegistration,
// ErrEmailFotoPhotosGone.
func ResendEmailFoto(sessionID, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var status models.SessionStatus
	var expires time.Time
	var registeredAt, deletedAt *time.Time
	var current string
	if err := tx.QueryRow(`
		SELECT status, expires_at, registered_at, registration_deleted_at, registration_email
		FROM sessions WHERE id = ? FOR UPDATE`, sessionID,
	).Scan(&status, &expires, &registeredAt, &deletedAt, &current); err != nil {
		return err
	}
	if status == models.StatusExpired || !expires.After(time.Now()) {
		return ErrEmailFotoPhotosGone
	}
	if registeredAt == nil || deletedAt != nil {
		return ErrNoRegistration
	}
	if email == "" {
		email = current
	}
	if email == "" {
		return ErrNoRegistration
	}

	if _, err := tx.Exec(`UPDATE sessions SET registration_email = ? WHERE id = ?`, email, sessionID); err != nil {
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

// DeleteSessionRegistration (Hapus data registrasi admin), satu transaksi:
// nama, email dan nomor WhatsApp dikosongkan, sesi ditandai registration_deleted_at, alamat
// penerima Email Foto dikosongkan dan pengiriman yang masih pending dihentikan
// (skipped, "data dihapus"). Status yang sudah final tetap tercatat. Baris
// sesi, foto, dan transaksi tetap ada. sql.ErrNoRows kalau sesi tidak ada.
func DeleteSessionRegistration(sessionID string) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	if err := tx.QueryRow(`
		UPDATE sessions SET registration_name = '', registration_email = '', registration_whatsapp = '',
			registration_deleted_at = COALESCE(registration_deleted_at, NOW())
		WHERE id = ? RETURNING id`, sessionID,
	).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		UPDATE email_deliveries SET
			recipient = '',
			last_error = CASE WHEN status = 'pending' THEN ? ELSE last_error END,
			status = CASE WHEN status = 'pending' THEN 'skipped' ELSE status END,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE session_id = ?`, reasonDataDeleted, sessionID); err != nil {
		return err
	}
	return tx.Commit()
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

// pendingEmailFoto satu pengiriman yang jatuh tempo beserta data sesinya,
// dibaca di bawah kunci baris pengirimannya.
type pendingEmailFoto struct {
	SessionID, Recipient, LastError string
	Attempts                        int
	SessionStatus                   models.SessionStatus
	Name                            string
	ExpiresAt                       time.Time
	CompletedAt, RegisteredAt       *time.Time
	LastSeenAt                      *time.Time
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
	for _, id := range due {
		dispatchEmailFoto(m, booth, now, id)
	}
}

// dueEmailFoto id sesi yang pengirimannya pending dan jatuh tempo. Datanya
// dibaca ulang di bawah kunci oleh dispatchEmailFoto.
func dueEmailFoto(now time.Time) ([]string, error) {
	rows, err := database.DB.Query(`
		SELECT session_id FROM email_deliveries
		WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
		ORDER BY created_at
		LIMIT ?`, now, emailFotoBatch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// lockEmailFoto mengunci baris pengiriman sesi (masih pending dan jatuh
// tempo) lalu membaca data sesinya yang terbaru. sql.ErrNoRows kalau
// pengiriman sudah tidak pending (mis. data registrasi baru saja dihapus).
func lockEmailFoto(tx *database.TxWrapper, sessionID string, now time.Time) (pendingEmailFoto, error) {
	p := pendingEmailFoto{SessionID: sessionID}
	if err := tx.QueryRow(`
		SELECT recipient, last_error, attempts FROM email_deliveries
		WHERE session_id = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
		FOR UPDATE`, sessionID, now,
	).Scan(&p.Recipient, &p.LastError, &p.Attempts); err != nil {
		return p, err
	}
	err := tx.QueryRow(`
		SELECT status, registration_name, expires_at, completed_at, registered_at, last_seen_at,
		       drive_url, drive_synced
		FROM sessions WHERE id = ?`, sessionID,
	).Scan(&p.SessionStatus, &p.Name, &p.ExpiresAt, &p.CompletedAt, &p.RegisteredAt, &p.LastSeenAt,
		&p.DriveURL, &p.DriveSynced)
	return p, err
}

func dispatchEmailFoto(m mailer.Mailer, booth string, now time.Time, sessionID string) {
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("⚠️  email foto: gagal mulai transaksi (%s): %v", sessionID, err)
		return
	}
	defer tx.Rollback()
	p, err := lockEmailFoto(tx, sessionID, now)
	if errors.Is(err, sql.ErrNoRows) {
		return // sudah diputuskan di tempat lain sejak daftar dibaca
	}
	if err != nil {
		log.Printf("⚠️  email foto: gagal baca pengiriman (%s): %v", sessionID, err)
		return
	}
	commit := func() {
		if err := tx.Commit(); err != nil {
			log.Printf("⚠️  gagal simpan status email foto (%s): %v", sessionID, err)
		}
	}

	// Foto sesi dihapus saat kedaluwarsa: setelah itu tidak ada yang dikirim.
	if p.SessionStatus == models.StatusExpired || !now.Before(p.ExpiresAt) {
		reason := p.LastError
		if reason == "" {
			reason = reasonPhotosGone
		}
		finishEmailFoto(tx, sessionID, EmailFotoFailed, reason)
		commit()
		return
	}
	if p.Recipient == "" {
		finishEmailFoto(tx, sessionID, EmailFotoSkipped, reasonDataDeleted)
		commit()
		return
	}

	content, strip, ready := emailFotoReadiness(now, p)
	if !ready {
		return
	}
	if content == "" {
		finishEmailFoto(tx, sessionID, EmailFotoSkipped, reasonNoPhotos)
		commit()
		return
	}

	msg := emailFotoMessage(booth, p, content, now)
	if strip != nil {
		msg.Attachments = []mailer.Attachment{*strip}
	}
	ctx, cancel := context.WithTimeout(context.Background(), emailFotoSendTimeout)
	err = m.Send(ctx, msg)
	cancel()

	attempts := p.Attempts + 1
	switch {
	case err == nil:
		_, err = tx.Exec(`
			UPDATE email_deliveries SET status = ?, content = ?, attempts = ?, sent_at = ?,
				next_attempt_at = NULL, last_error = '', updated_at = NOW()
			WHERE session_id = ?`, EmailFotoSent, content, attempts, now, sessionID)
		log.Printf("📧 email foto terkirim (%s, %s)", sessionID, content)
	case mailer.IsPermanent(err):
		_, err = tx.Exec(`
			UPDATE email_deliveries SET status = ?, attempts = ?, last_error = ?,
				next_attempt_at = NULL, updated_at = NOW()
			WHERE session_id = ?`, EmailFotoFailed, attempts, err.Error(), sessionID)
		log.Printf("⚠️  email foto ditolak (%s)", sessionID)
	default:
		next := now.Add(emailFotoRetryDelay(attempts))
		_, err = tx.Exec(`
			UPDATE email_deliveries SET attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = NOW()
			WHERE session_id = ?`, attempts, err.Error(), next, sessionID)
		log.Printf("⚠️  email foto gagal (%s), dicoba lagi %s", sessionID, next.Format("15:04"))
	}
	if err != nil {
		log.Printf("⚠️  gagal simpan status email foto (%s): %v", sessionID, err)
		return
	}
	commit()
}

func emailFotoRetryDelay(attempts int) time.Duration {
	if attempts > len(emailFotoRetryDelays) {
		attempts = len(emailFotoRetryDelays)
	}
	return emailFotoRetryDelays[attempts-1]
}

func finishEmailFoto(q sqlRunner, sessionID, status, reason string) {
	if _, err := q.Exec(`
		UPDATE email_deliveries SET status = ?, last_error = ?, next_attempt_at = NULL, updated_at = NOW()
		WHERE session_id = ? AND status = ?`, status, reason, sessionID, EmailFotoPending); err != nil {
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

	// Tanpa strip: aturan ini hanya untuk sesi yang berhenti di tengah jalan.
	// Selama booth masih menampilkan sesi (heartbeat baru), strip masih bisa
	// datang.
	if p.LastSeenAt != nil && now.Before(p.LastSeenAt.Add(emailFotoBoothActive)) {
		return "", nil, false
	}
	// Lalu tunggu sampai 10 menit tanpa foto baru, dihitung dari registrasi
	// kalau belum ada foto sama sekali.
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
