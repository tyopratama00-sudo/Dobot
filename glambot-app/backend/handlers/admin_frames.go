package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"photobooth/database"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// frameResponse — bentuk yang diharapkan frontend (frame/api/types.ts).
type frameResponse struct {
	ID           string          `json:"id"`
	FrameCode    string          `json:"frame_code"`
	Name         string          `json:"name"`
	Category     string          `json:"category"`
	Description  string          `json:"description"`
	FilePath     string          `json:"file_path"`
	ThumbURL     string          `json:"thumb_url"`
	PhotoSlots   int             `json:"photo_slots"`
	CanvasWidth  int             `json:"canvas_width"`
	CanvasHeight int             `json:"canvas_height"`
	Slots        json.RawMessage `json:"slots"`
	Status       string          `json:"status"`
	UsedCount    int             `json:"used_count"`
	UsedToday    int             `json:"used_today"`
	FileSize     string          `json:"file_size"`
	DateCreated  string          `json:"date_created"`
	LastModified string          `json:"last_modified"`
	LastUsed     string          `json:"last_used"`
}

// ensureSlotIDs memberi id unik & stabil (berbasis posisi) ke tiap slot —
// editor foto mem-key foto per slot id, kalau id hilang semua slot menumpuk
// jadi satu. Return JSON ternormalisasi + jumlah slot.
func ensureSlotIDs(slotsJSON []byte) ([]byte, int) {
	var slots []map[string]any
	if err := json.Unmarshal(slotsJSON, &slots); err != nil || len(slots) == 0 {
		return slotsJSON, len(slots)
	}
	seen := make(map[string]bool, len(slots))
	for i := range slots {
		id, _ := slots[i]["id"].(string)
		if id == "" || seen[id] {
			id = "slot-" + strconv.Itoa(i+1)
			for seen[id] {
				id = "slot-" + strconv.Itoa(i+1) + "-" + uuid.NewString()[:4]
			}
			slots[i]["id"] = id
		}
		seen[id] = true
	}
	out, err := json.Marshal(slots)
	if err != nil {
		return slotsJSON, len(slots)
	}
	return out, len(slots)
}

const frameSelectCols = `f.id, f.frame_code, f.name, f.category, f.description,
	f.file_path, f.thumb_url, f.photo_slots, f.canvas_width, f.canvas_height,
	f.slots, f.is_active, f.file_size, f.created_at, f.updated_at,
	COALESCE(agg.used_count, 0) AS used_count,
	COALESCE(agg.used_today, 0) AS used_today,
	agg.last_used AS last_used`

// frameFromJoin: agregat pemakaian dihitung SEKALI via LEFT JOIN (bukan 3
// subquery correlated per baris) — jauh lebih murah saat tabel sessions besar.
const frameFromJoin = `FROM frames f
	LEFT JOIN (
		SELECT frame_id,
			COUNT(*) AS used_count,
			COUNT(*) FILTER (WHERE created_at::date = NOW()::date) AS used_today,
			MAX(created_at) AS last_used
		FROM sessions
		WHERE frame_id IS NOT NULL AND frame_id <> ''
		GROUP BY frame_id
	) agg ON agg.frame_id = f.id`

func scanFrame(s interface{ Scan(...any) error }) (frameResponse, error) {
	var (
		f          frameResponse
		isActive   int
		slotsBytes []byte
		created    time.Time
		modified   time.Time
		lastUsed   sql.NullTime
	)
	err := s.Scan(&f.ID, &f.FrameCode, &f.Name, &f.Category, &f.Description,
		&f.FilePath, &f.ThumbURL, &f.PhotoSlots, &f.CanvasWidth, &f.CanvasHeight,
		&slotsBytes, &isActive, &f.FileSize, &created, &modified,
		&f.UsedCount, &f.UsedToday, &lastUsed)
	if err != nil {
		return f, err
	}
	if len(slotsBytes) > 0 {
		f.Slots = slotsBytes
	} else {
		f.Slots = json.RawMessage("[]")
	}
	if isActive == 1 {
		f.Status = "active"
	} else {
		f.Status = "inactive"
	}
	f.DateCreated = created.Format(time.RFC3339)
	f.LastModified = modified.Format(time.RFC3339)
	if lastUsed.Valid {
		f.LastUsed = lastUsed.Time.Format(time.RFC3339)
	}
	return f, nil
}

// GET /api/admin/frames
func AdminListFrames(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)

	where := []string{"1=1"}
	args := []any{}
	if s := queryParam(r, "search"); s != "" {
		where = append(where, "(f.name ILIKE ? OR f.frame_code ILIKE ? OR f.category ILIKE ?)")
		like := "%" + s + "%"
		args = append(args, like, like, like)
	}
	if st := queryParam(r, "status"); st != "" {
		where = append(where, "f.is_active = ?")
		args = append(args, boolToInt(st == "active"))
	}
	if cat := queryParam(r, "category"); cat != "" {
		where = append(where, "f.category = ?")
		args = append(args, cat)
	}
	whereSQL := strings.Join(where, " AND ")

	orderBy := "f.sort_order ASC, f.id ASC"
	switch r.URL.Query().Get("sortBy") {
	case "name":
		orderBy = "f.name " + sortDir(r)
	case "category":
		orderBy = "f.category " + sortDir(r)
	case "usedCount":
		orderBy = "used_count " + sortDir(r)
	case "lastUsed":
		orderBy = "last_used " + sortDir(r) + " NULLS LAST"
	}

	var total int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM frames f WHERE `+whereSQL, args...).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghitung frames")
		return
	}

	rows, err := database.DB.Query(
		`SELECT `+frameSelectCols+` `+frameFromJoin+` WHERE `+whereSQL+
			` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
		append(args, limit, offset)...,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat frames")
		return
	}
	defer rows.Close()

	list := make([]frameResponse, 0)
	for rows.Next() {
		f, err := scanFrame(rows)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca frames")
			return
		}
		list = append(list, f)
	}

	respondJSON(w, http.StatusOK, adminListResponse{Data: list, Meta: buildMeta(total, page, limit)})
}

// GET /api/admin/frames/stats
func AdminFrameStats(w http.ResponseWriter, r *http.Request) {
	stats := struct {
		Total     int `json:"total"`
		Active    int `json:"active"`
		Inactive  int `json:"inactive"`
		UsedToday int `json:"usedToday"`
	}{}
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM frames`).Scan(&stats.Total)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM frames WHERE is_active = 1`).Scan(&stats.Active)
	stats.Inactive = stats.Total - stats.Active
	_ = database.DB.QueryRow(
		`SELECT COUNT(*) FROM sessions WHERE frame_id IS NOT NULL AND frame_id <> '' AND created_at::date = NOW()::date`,
	).Scan(&stats.UsedToday)
	respondJSON(w, http.StatusOK, stats)
}

// fetchFrameByID memuat satu frame — dipakai bersama oleh GET detail dan
// load-after-write (create/update) agar query SELECT+scan tidak diduplikasi.
func fetchFrameByID(id string) (frameResponse, error) {
	row := database.DB.QueryRow(`SELECT `+frameSelectCols+` `+frameFromJoin+` WHERE f.id = ?`, id)
	return scanFrame(row)
}

// GET /api/admin/frames/{id}
func AdminGetFrame(w http.ResponseWriter, r *http.Request) {
	f, err := fetchFrameByID(chi.URLParam(r, "id"))
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Frame tidak ditemukan")
		return
	}
	if err != nil {
		respondInternal(w, "get frame", err)
		return
	}
	respondJSON(w, http.StatusOK, f)
}

func loadFrameByID(w http.ResponseWriter, id string) {
	f, err := fetchFrameByID(id)
	if err != nil {
		respondInternal(w, "load frame", err)
		return
	}
	respondJSON(w, http.StatusOK, f)
}

// POST /api/admin/frames  (multipart/form-data)
func AdminCreateFrame(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		respondError(w, http.StatusBadRequest, "name wajib diisi")
		return
	}
	category := strings.TrimSpace(r.FormValue("category"))
	if category == "" {
		category = "Personal"
	}
	status := r.FormValue("status")
	canvasW, _ := strconv.Atoi(r.FormValue("canvas_width"))
	if canvasW <= 0 {
		canvasW = 464
	}
	canvasH, _ := strconv.Atoi(r.FormValue("canvas_height"))
	if canvasH <= 0 {
		canvasH = 696
	}
	photoSlots, _ := strconv.Atoi(r.FormValue("photo_slots"))
	slotsJSON := strings.TrimSpace(r.FormValue("slots"))
	if slotsJSON == "" {
		slotsJSON = "[]"
	}
	if !json.Valid([]byte(slotsJSON)) {
		respondError(w, http.StatusBadRequest, "Format slots tidak valid")
		return
	}
	normSlots, slotCount := ensureSlotIDs([]byte(slotsJSON))
	slotsJSON = string(normSlots)
	photoSlots = slotCount

	id := "frame-" + uuid.NewString()[:8]
	filePath, thumbURL, fileSize := "", "", ""
	if file, header, err := r.FormFile("file"); err == nil {
		path, size, uErr := saveUpload(file, header, "frames")
		if uErr != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan file frame")
			return
		}
		filePath, thumbURL, fileSize = path, path, humanSize(size)
	}

	_, err := database.DB.Exec(
		`INSERT INTO frames (id, name, file_path, thumb_url, photo_slots, canvas_width,
			canvas_height, slots, is_active, frame_code, category, description, file_size)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
		id, name, filePath, thumbURL, photoSlots, canvasW, canvasH, slotsJSON,
		boolToInt(status != "inactive"), id, category, r.FormValue("description"), fileSize,
	)
	if err != nil {
		respondInternal(w, "create frame", err)
		return
	}

	loadFrameByID(w, id)
}

// PATCH /api/admin/frames/{id}  (multipart/form-data, partial)
func AdminUpdateFrame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sets := []string{}
	args := []any{}
	addSet := func(expr string, val any) {
		sets = append(sets, expr)
		args = append(args, val)
	}

	if v := r.FormValue("name"); v != "" {
		addSet("name = ?", v)
	}
	if v := r.FormValue("category"); v != "" {
		addSet("category = ?", v)
	}
	if _, ok := r.MultipartForm.Value["description"]; ok {
		addSet("description = ?", r.FormValue("description"))
	}
	if v := r.FormValue("status"); v != "" {
		addSet("is_active = ?", boolToInt(v != "inactive"))
	}
	if v := r.FormValue("canvas_width"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			addSet("canvas_width = ?", n)
		}
	}
	if v := r.FormValue("canvas_height"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			addSet("canvas_height = ?", n)
		}
	}
	if v := strings.TrimSpace(r.FormValue("slots")); v != "" {
		if !json.Valid([]byte(v)) {
			respondError(w, http.StatusBadRequest, "Format slots tidak valid")
			return
		}
		normSlots, slotCount := ensureSlotIDs([]byte(v))
		addSet("slots = ?::jsonb", string(normSlots))
		addSet("photo_slots = ?", slotCount)
	}
	if file, header, err := r.FormFile("file"); err == nil {
		path, size, uErr := saveUpload(file, header, "frames")
		if uErr != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan file frame")
			return
		}
		addSet("file_path = ?", path)
		addSet("thumb_url = ?", path)
		addSet("file_size = ?", humanSize(size))
	}

	if len(sets) > 0 {
		sets = append(sets, "updated_at = NOW()")
		query := "UPDATE frames SET " + strings.Join(sets, ", ") + " WHERE id = ?"
		args = append(args, id)
		if _, err := database.DB.Exec(query, args...); err != nil {
			respondInternal(w, "update frame", err)
			return
		}
	}

	loadFrameByID(w, id)
}

// DELETE /api/admin/frames/{id}
func AdminDeleteFrame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := database.DB.Exec(`DELETE FROM frames WHERE id = ?`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghapus frame")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}
