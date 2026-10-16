package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"photobooth/database"
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
	DriveURL    string  `json:"drive_url"`
	CreatedAt   string  `json:"created_at"`
	CompletedAt *string `json:"completed_at,omitempty"`
}

const sessionSelect = `s.id, COALESCE(p.name, s.package_code), s.price, s.discount, s.final_price,
	s.print_count, s.status, COALESCE(f.name, ''),
	(SELECT COUNT(*) FROM photos ph WHERE ph.session_id = s.id AND ph.type = 'raw'),
	COALESCE(s.drive_url, ''), s.created_at, s.completed_at
	FROM sessions s
	LEFT JOIN packages p ON p.id = s.package_id
	LEFT JOIN frames f ON f.id = s.frame_id`

func scanSession(row interface{ Scan(...any) error }) (adminSession, error) {
	var (
		s         adminSession
		created   time.Time
		completed sql.NullTime
	)
	err := row.Scan(&s.ID, &s.Package, &s.Price, &s.Discount, &s.FinalPrice, &s.PrintCount,
		&s.Status, &s.Frame, &s.Photos, &s.DriveURL, &created, &completed)
	s.CreatedAt = created.Format(time.RFC3339)
	if completed.Valid {
		c := completed.Time.Format(time.RFC3339)
		s.CompletedAt = &c
	}
	return s, err
}

// GET /api/admin/sessions?search&status&from&to&page&limit
func AdminListSessions(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)
	where, args := []string{"1=1"}, []any{}
	if q := queryParam(r, "search"); q != "" {
		where = append(where, "s.id ILIKE ?")
		args = append(args, "%"+q+"%")
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

// GET /api/admin/sessions/{id} → sesi + foto + transaksi
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

	respondJSON(w, http.StatusOK, map[string]any{"session": s, "photos": photos, "transactions": txs})
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
