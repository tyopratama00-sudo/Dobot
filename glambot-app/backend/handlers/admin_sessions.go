package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"photobooth/database"
	"photobooth/models"
	"photobooth/services"

	"github.com/go-chi/chi/v5"
)

type adminSession struct {
	ID          string  `json:"id"`
	Package     string  `json:"package"`
	Price       int     `json:"price"`
	Discount    int     `json:"discount"`
	FinalPrice  int     `json:"final_price"`
	PrintCount  int     `json:"print_count"`
	Status      string  `json:"status"`
	Frame       string  `json:"frame"`
	Photos      int     `json:"photos"`
	ResultURL   string  `json:"result_url"` // link Halaman Hasil: R2, lalu Drive
	CreatedAt   string  `json:"created_at"`
	CompletedAt *string `json:"completed_at,omitempty"`
	// Registrasi melekat pada sesi (ADR 0001); kosong bila belum registrasi.
	RegistrationName  string `json:"registration_name"`
	RegistrationEmail string `json:"registration_email"`
	// Nomor WhatsApp ternormalisasi (mis. 6281234567890), kosong bila tidak diisi.
	RegistrationWhatsApp string  `json:"registration_whatsapp"`
	RegisteredAt         *string `json:"registered_at"`
	// Terisi bila admin menghapus data registrasi (nama, email, WhatsApp sudah kosong).
	RegistrationDeletedAt *string `json:"registration_deleted_at"`
	expiresAt             time.Time
}

// sessionSelect: kolom link memakai aturan pickResultLink (R2, lalu Drive).
const sessionSelect = `s.id, COALESCE(p.name, s.package_code), s.price, s.discount, s.final_price,
	s.print_count, s.status, COALESCE(f.name, ''),
	(SELECT COUNT(*) FROM photos ph WHERE ph.session_id = s.id AND ph.type = 'raw'),
	COALESCE(NULLIF(s.r2_url, ''), s.drive_url, ''), s.created_at, s.completed_at,
	s.registration_name, s.registration_email, s.registration_whatsapp, s.registered_at, s.registration_deleted_at, s.expires_at
	FROM sessions s
	LEFT JOIN packages p ON p.id = s.package_id
	LEFT JOIN frames f ON f.id = s.frame_id`

func scanSession(row interface{ Scan(...any) error }) (adminSession, error) {
	var (
		s         adminSession
		created   time.Time
		completed sql.NullTime
		reg       sql.NullTime
		regDel    sql.NullTime
	)
	err := row.Scan(&s.ID, &s.Package, &s.Price, &s.Discount, &s.FinalPrice, &s.PrintCount,
		&s.Status, &s.Frame, &s.Photos, &s.ResultURL, &created, &completed,
		&s.RegistrationName, &s.RegistrationEmail, &s.RegistrationWhatsApp, &reg, &regDel, &s.expiresAt)
	s.CreatedAt = created.Format(time.RFC3339)
	if completed.Valid {
		c := completed.Time.Format(time.RFC3339)
		s.CompletedAt = &c
	}
	if reg.Valid {
		at := reg.Time.Format(time.RFC3339)
		s.RegisteredAt = &at
	}
	if regDel.Valid {
		at := regDel.Time.Format(time.RFC3339)
		s.RegistrationDeletedAt = &at
	}
	return s, err
}

// whatsappSearchDigits mengubah kata pencarian yang mirip nomor telepon
// (mis. "0812-3456", "+62 812") ke bentuk tersimpan: digit saja, + dibuang,
// 0 di depan menjadi 62. ok=false bila kata itu bukan nomor (min. 4 digit).
func whatsappSearchDigits(q string) (string, bool) {
	n := strings.TrimPrefix(whatsappStrip.Replace(q), "+")
	if len(n) < 4 {
		return "", false
	}
	for _, c := range n {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	if n[0] == '0' {
		n = "62" + n[1:]
	}
	return n, true
}

// likeEscaper membuat %, _ dan \ pada kata pencarian dicocokkan apa adanya oleh ILIKE.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// GET /api/admin/sessions?search&status&from&to&page&limit
func AdminListSessions(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)
	where, args := []string{"1=1"}, []any{}
	if q := queryParam(r, "search"); q != "" {
		// Cocok sebagian (tanpa beda huruf besar/kecil) pada id sesi, nama, atau email registrasi.
		cond := "s.id ILIKE ? OR s.registration_name ILIKE ? OR s.registration_email ILIKE ?"
		like := "%" + likeEscaper.Replace(q) + "%"
		args = append(args, like, like, like)
		// Kata yang berupa nomor telepon juga dicari pada nomor WhatsApp.
		if digits, ok := whatsappSearchDigits(q); ok {
			cond += " OR s.registration_whatsapp LIKE ?"
			args = append(args, "%"+digits+"%")
		}
		where = append(where, "("+cond+")")
	}
	if st := queryParam(r, "status"); st != "" {
		where = append(where, "s.status = ?")
		args = append(args, st)
	}
	where, args = dateRange(r, "s.created_at", where, args)
	whereSQL := strings.Join(where, " AND ")

	var total int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM sessions s WHERE `+whereSQL, args...).Scan(&total); err != nil {
		respondInternal(w, "count sessions", err)
		return
	}
	rows, err := database.DB.Query(`SELECT `+sessionSelect+` WHERE `+whereSQL+` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
		append(args, limit, offset)...)
	if err != nil {
		respondInternal(w, "list sessions", err)
		return
	}
	defer rows.Close()
	list := make([]adminSession, 0)
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			respondInternal(w, "scan session", err)
			return
		}
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, adminListResponse{Data: list, Meta: buildMeta(total, page, limit)})
}

// sessionRegistration adalah bagian "Registrasi & Email Foto" pada detail sesi.
type sessionRegistration struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	WhatsApp     string `json:"whatsapp"`
	RegisteredAt string `json:"registered_at"`
	// Waktu "Hapus data registrasi"; null bila datanya masih ada.
	DeletedAt *string `json:"deleted_at"`
	// WhatsAppLink = link wa.me dengan pesan siap kirim untuk tombol
	// "Kirim via WhatsApp"; null bila tidak bisa, dengan alasannya di
	// WhatsAppLinkReason.
	WhatsAppLink       *string `json:"whatsapp_link"`
	WhatsAppLinkReason string  `json:"whatsapp_link_reason"`
}

// registrationOf mengembalikan nil bila sesi belum registrasi.
func registrationOf(s adminSession, now time.Time) *sessionRegistration {
	if s.RegisteredAt == nil {
		return nil
	}
	reg := &sessionRegistration{Name: s.RegistrationName, Email: s.RegistrationEmail,
		WhatsApp: s.RegistrationWhatsApp, RegisteredAt: *s.RegisteredAt, DeletedAt: s.RegistrationDeletedAt}
	switch {
	case s.RegistrationWhatsApp == "":
		reg.WhatsAppLinkReason = "Belum ada nomor WhatsApp"
	case s.Status == string(models.StatusExpired) || !s.expiresAt.After(now):
		reg.WhatsAppLinkReason = "Sesi sudah kedaluwarsa, foto sudah dihapus"
	case s.ResultURL == "":
		reg.WhatsAppLinkReason = "Link Halaman Hasil belum tersedia"
	default:
		link := whatsappLink(s.RegistrationWhatsApp, s.RegistrationName, emailFotoBoothName(), s.ResultURL, s.expiresAt)
		reg.WhatsAppLink = &link
	}
	return reg
}

// whatsappLink menyusun link wa.me berisi pesan siap kirim. Spasi ditulis
// %20 (bukan +) supaya WhatsApp menampilkannya apa adanya.
func whatsappLink(number, name, booth, resultURL string, expires time.Time) string {
	if name == "" {
		name = "kamu"
	}
	msg := fmt.Sprintf("Halo %s, ini foto kamu dari %s 📸 %s Link berlaku sampai %s.",
		name, booth, resultURL, indonesianTime(expires))
	return "https://wa.me/" + number + "?text=" + strings.ReplaceAll(url.QueryEscape(msg), "+", "%20")
}

// GET /api/admin/sessions/{id} → sesi + foto + transaksi + registrasi (null bila belum ada)
func AdminGetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s, err := scanSession(database.DB.QueryRow(`SELECT `+sessionSelect+` WHERE s.id = ?`, id))
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Sesi tidak ditemukan")
		return
	}
	if err != nil {
		respondInternal(w, "get session", err)
		return
	}

	type photo struct {
		ID       string `json:"id"`
		Type     string `json:"type"`
		URL      string `json:"url"`
		Selected bool   `json:"selected"`
	}
	photos := make([]photo, 0)
	rows, err := database.DB.Query(`SELECT id, type, file_path, selected FROM photos WHERE session_id = ? ORDER BY type DESC, created_at`, id)
	if err != nil {
		respondInternal(w, "session photos", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var (
			p   photo
			fp  string
			sel int
		)
		if err := rows.Scan(&p.ID, &p.Type, &fp, &sel); err != nil {
			respondInternal(w, "scan photo", err)
			return
		}
		p.URL = "/storage/" + strings.TrimPrefix(strings.TrimPrefix(fp, "/"), "storage/")
		p.Selected = sel == 1
		photos = append(photos, p)
	}

	txs := make([]transactionResponse, 0)
	txRows, err := database.DB.Query(`SELECT `+txSelect+` WHERE t.session_id = ? ORDER BY t.created_at DESC`, id)
	if err != nil {
		respondInternal(w, "session transactions", err)
		return
	}
	defer txRows.Close()
	for txRows.Next() {
		t, err := scanTransaction(txRows)
		if err != nil {
			respondInternal(w, "scan transaction", err)
			return
		}
		txs = append(txs, t)
	}

	emailFoto, err := emailFotoOf(id)
	if err != nil {
		respondInternal(w, "session email foto", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"session": s, "photos": photos, "transactions": txs,
		"registration": registrationOf(s, time.Now()), "email_foto": emailFoto,
	})
}

// POST /api/admin/sessions/{id}/reprint {copies} — cetak ulang strip framed terbaru.
func AdminReprintSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Copies int `json:"copies"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Copies < 1 || body.Copies > 10 {
		body.Copies = 1
	}
	rel, err := latestFramedStripRelPath(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusNotFound, "Strip foto belum tersedia untuk sesi ini")
		return
	}
	full, ok := safeStoragePath(rel)
	if !ok {
		respondError(w, http.StatusBadRequest, "Path strip tidak valid")
		return
	}
	if err := services.PrintFile(full, body.Copies); err != nil {
		respondError(w, http.StatusServiceUnavailable, fmt.Sprintf("Gagal mencetak: %v", err))
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true, "copies": body.Copies})
}
