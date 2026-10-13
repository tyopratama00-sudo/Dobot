package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"photobooth/database"

	"github.com/go-chi/chi/v5"
)

// packageResponse — bentuk yang diharapkan frontend (packages/api/types.ts).
type packageResponse struct {
	ID             int64  `json:"id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	Price          int    `json:"price"`
	DurationSecs   int    `json:"duration_secs"`
	DurationMins   int    `json:"duration_mins"`
	Description    string `json:"description"`
	ImageSrc       string `json:"image_src"`
	IsPopular      bool   `json:"is_popular"`
	PrintCount     int    `json:"print_count"`
	PrintUnitPrice int    `json:"print_unit_price"`
	Status         string `json:"status"`
}

const packageSelectCols = `id, code, name, description, base_price, duration_secs,
	print_count, print_unit_price, COALESCE(image_src, ''), is_popular, COALESCE(status, 'active')`

func scanPackage(s interface{ Scan(...any) error }) (packageResponse, error) {
	var (
		p         packageResponse
		isPopular int
	)
	err := s.Scan(&p.ID, &p.Code, &p.Name, &p.Description, &p.Price,
		&p.DurationSecs, &p.PrintCount, &p.PrintUnitPrice, &p.ImageSrc, &isPopular, &p.Status)
	if err != nil {
		return p, err
	}
	p.IsPopular = isPopular == 1
	p.DurationMins = p.DurationSecs / 60
	return p, nil
}

// GET /api/admin/packages
func AdminListPackages(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)

	where := []string{"1=1"}
	args := []any{}
	if s := queryParam(r, "search"); s != "" {
		where = append(where, "(name ILIKE ? OR code ILIKE ? OR description ILIKE ?)")
		like := "%" + s + "%"
		args = append(args, like, like, like)
	}
	if st := queryParam(r, "status"); st != "" {
		where = append(where, "status = ?")
		args = append(args, st)
	}
	if code := queryParam(r, "code"); code != "" {
		where = append(where, "code = ?")
		args = append(args, code)
	}
	whereSQL := strings.Join(where, " AND ")

	orderBy := "sort_order ASC, id ASC"
	switch r.URL.Query().Get("sortBy") {
	case "name":
		orderBy = "name " + sortDir(r)
	case "price":
		orderBy = "base_price " + sortDir(r)
	case "duration":
		orderBy = "duration_secs " + sortDir(r)
	}

	var total int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM packages WHERE `+whereSQL, args...).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghitung packages")
		return
	}

	rows, err := database.DB.Query(
		`SELECT `+packageSelectCols+` FROM packages WHERE `+whereSQL+
			` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
		append(args, limit, offset)...,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat packages")
		return
	}
	defer rows.Close()

	list := make([]packageResponse, 0)
	for rows.Next() {
		p, err := scanPackage(rows)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca packages")
			return
		}
		list = append(list, p)
	}

	respondJSON(w, http.StatusOK, adminListResponse{Data: list, Meta: buildMeta(total, page, limit)})
}

// GET /api/admin/packages/stats
func AdminPackageStats(w http.ResponseWriter, r *http.Request) {
	stats := struct {
		Active       int `json:"active"`
		Inactive     int `json:"inactive"`
		SoldToday    int `json:"soldToday"`
		RevenueToday int `json:"revenueToday"`
	}{}

	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM packages WHERE status = 'active'`).Scan(&stats.Active)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM packages WHERE status <> 'active'`).Scan(&stats.Inactive)

	var revenue sql.NullInt64
	_ = database.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(amount),0) FROM transactions
		 WHERE status = 'paid' AND paid_at::date = NOW()::date`,
	).Scan(&stats.SoldToday, &revenue)
	stats.RevenueToday = int(revenue.Int64)

	respondJSON(w, http.StatusOK, stats)
}

// GET /api/admin/packages/{id}
func AdminGetPackage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	row := database.DB.QueryRow(`SELECT `+packageSelectCols+` FROM packages WHERE id = ?`, id)
	p, err := scanPackage(row)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Package tidak ditemukan")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat package")
		return
	}
	respondJSON(w, http.StatusOK, p)
}

// POST /api/admin/packages  (multipart/form-data)
func AdminCreatePackage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	code := strings.TrimSpace(r.FormValue("code"))
	name := strings.TrimSpace(r.FormValue("name"))
	if code == "" || name == "" {
		respondError(w, http.StatusBadRequest, "code dan name wajib diisi")
		return
	}
	price, _ := strconv.Atoi(r.FormValue("price"))
	durationSecs, _ := strconv.Atoi(r.FormValue("duration_secs"))
	if durationSecs < 60 {
		durationSecs = 60
	}
	printCount, _ := strconv.Atoi(r.FormValue("print_count"))
	if printCount <= 0 {
		printCount = 3
	}
	printUnitPrice, _ := strconv.Atoi(r.FormValue("print_unit_price"))
	if printUnitPrice < 0 {
		printUnitPrice = 0
	}
	status := strings.TrimSpace(r.FormValue("status"))
	if status == "" {
		status = "active"
	}
	isPopular := r.FormValue("is_popular") == "true"

	imageSrc := ""
	if file, header, err := r.FormFile("image"); err == nil {
		path, _, uErr := saveUpload(file, header, "packages")
		if uErr != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan gambar")
			return
		}
		imageSrc = path
	}

	var id int64
	err := database.DB.QueryRow(
		`INSERT INTO packages (code, name, description, base_price, duration_secs,
			print_count, print_unit_price, image_src, is_popular, is_active, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		code, name, r.FormValue("description"), price, durationSecs,
		printCount, printUnitPrice, imageSrc, boolToInt(isPopular), boolToInt(status == "active"), status,
	).Scan(&id)
	if err != nil {
		respondInternal(w, "create package", err)
		return
	}

	row := database.DB.QueryRow(`SELECT `+packageSelectCols+` FROM packages WHERE id = ?`, id)
	p, _ := scanPackage(row)
	respondJSON(w, http.StatusCreated, p)
}

// PATCH /api/admin/packages/{id}  (multipart/form-data, partial)
func AdminUpdatePackage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sets := []string{}
	args := []any{}
	addSet := func(col string, val any) {
		sets = append(sets, col+" = ?")
		args = append(args, val)
	}

	if v := r.FormValue("name"); v != "" {
		addSet("name", v)
	}
	if _, ok := r.MultipartForm.Value["description"]; ok {
		addSet("description", r.FormValue("description"))
	}
	if v := r.FormValue("price"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			addSet("base_price", n)
		}
	}
	if v := r.FormValue("duration_secs"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 60 {
			addSet("duration_secs", n)
		}
	}
	if v := r.FormValue("code"); v != "" {
		addSet("code", v)
	}
	if v := r.FormValue("status"); v != "" {
		addSet("status", v)
		addSet("is_active", boolToInt(v == "active"))
	}
	if v := r.FormValue("is_popular"); v != "" {
		addSet("is_popular", boolToInt(v == "true"))
	}
	if v := r.FormValue("print_count"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			addSet("print_count", n)
		}
	}
	if v := r.FormValue("print_unit_price"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			addSet("print_unit_price", n)
		}
	}
	if file, header, err := r.FormFile("image"); err == nil {
		path, _, uErr := saveUpload(file, header, "packages")
		if uErr != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan gambar")
			return
		}
		addSet("image_src", path)
	}

	if len(sets) > 0 {
		sets = append(sets, "updated_at = NOW()") // literal, tanpa argumen
		query := "UPDATE packages SET " + strings.Join(sets, ", ") + " WHERE id = ?"
		args = append(args, id)
		if _, err := database.DB.Exec(query, args...); err != nil {
			respondInternal(w, "update package", err)
			return
		}
	}

	row := database.DB.QueryRow(`SELECT `+packageSelectCols+` FROM packages WHERE id = ?`, id)
	p, err := scanPackage(row)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Package tidak ditemukan")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat package")
		return
	}
	respondJSON(w, http.StatusOK, p)
}

// DELETE /api/admin/packages/{id}
func AdminDeletePackage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := database.DB.Exec(`DELETE FROM packages WHERE id = ?`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghapus package")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}
