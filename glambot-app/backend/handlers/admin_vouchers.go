package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"photobooth/database"

	"github.com/go-chi/chi/v5"
)

// voucherResponse — bentuk yang diharapkan frontend (voucher/api/types.ts).
// discount_type dikeluarkan sebagai "percentage"|"fixed" (DB simpan "percent"|"fixed").
type voucherResponse struct {
	Code          string  `json:"code"`
	Description   string  `json:"description"`
	DiscountType  string  `json:"discount_type"`
	DiscountValue int     `json:"discount_value"`
	MinPrice      int     `json:"min_price"`
	MaxUses       int     `json:"max_uses"`
	UsedCount     int     `json:"used_count"`
	IsActive      bool    `json:"is_active"`
	ExpiresAt     *string `json:"expires_at,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

// percent (DB) ⇄ percentage (FE)
func discountTypeToFE(db string) string {
	if db == "percent" {
		return "percentage"
	}
	return "fixed"
}

func discountTypeToDB(fe string) string {
	if fe == "percentage" || fe == "percent" {
		return "percent"
	}
	return "fixed"
}

func scanVoucher(s interface{ Scan(...any) error }) (voucherResponse, error) {
	var (
		v         voucherResponse
		dbType    string
		isActive  int
		expiresAt sql.NullTime
		createdAt time.Time
	)
	err := s.Scan(&v.Code, &v.Description, &dbType, &v.DiscountValue, &v.MinPrice,
		&v.MaxUses, &v.UsedCount, &isActive, &expiresAt, &createdAt)
	if err != nil {
		return v, err
	}
	v.DiscountType = discountTypeToFE(dbType)
	v.IsActive = isActive == 1
	v.CreatedAt = createdAt.Format(time.RFC3339)
	if expiresAt.Valid {
		s := expiresAt.Time.Format(time.RFC3339)
		v.ExpiresAt = &s
	}
	return v, nil
}

const voucherSelectCols = `code, description, discount_type, discount_value,
	min_price, max_uses, used_count, is_active, expires_at, created_at`

// GET /api/admin/vouchers
func AdminListVouchers(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)

	where := []string{"1=1"}
	args := []any{}
	if s := queryParam(r, "search"); s != "" {
		where = append(where, "(code ILIKE ? OR description ILIKE ?)")
		like := "%" + s + "%"
		args = append(args, like, like)
	}
	switch queryParam(r, "status") {
	case "active":
		where = append(where, "is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())")
	case "inactive":
		where = append(where, "is_active = 0")
	case "expired":
		where = append(where, "expires_at IS NOT NULL AND expires_at < NOW()")
	}
	if dt := queryParam(r, "discountType"); dt != "" {
		where = append(where, "discount_type = ?")
		args = append(args, discountTypeToDB(dt))
	}
	if m := queryParam(r, "month"); m != "" {
		where = append(where, "EXTRACT(MONTH FROM expires_at) = ?")
		args = append(args, m)
	}
	whereSQL := strings.Join(where, " AND ")

	orderBy := "created_at DESC"
	switch r.URL.Query().Get("sortBy") {
	case "code":
		orderBy = "code " + sortDir(r)
	case "createdAt":
		orderBy = "created_at " + sortDir(r)
	case "discountValue":
		orderBy = "discount_value " + sortDir(r)
	case "usedCount":
		orderBy = "used_count " + sortDir(r)
	}

	var total int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE `+whereSQL, args...).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghitung vouchers")
		return
	}

	rows, err := database.DB.Query(
		`SELECT `+voucherSelectCols+` FROM vouchers WHERE `+whereSQL+
			` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
		append(args, limit, offset)...,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat vouchers")
		return
	}
	defer rows.Close()

	list := make([]voucherResponse, 0)
	for rows.Next() {
		v, err := scanVoucher(rows)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca vouchers")
			return
		}
		list = append(list, v)
	}

	respondJSON(w, http.StatusOK, adminListResponse{Data: list, Meta: buildMeta(total, page, limit)})
}

// GET /api/admin/vouchers/stats
func AdminVoucherStats(w http.ResponseWriter, r *http.Request) {
	stats := struct {
		Total     int `json:"total"`
		Active    int `json:"active"`
		Inactive  int `json:"inactive"`
		Expired   int `json:"expired"`
		TotalUsed int `json:"totalUsed"`
	}{}
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers`).Scan(&stats.Total)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())`).Scan(&stats.Active)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE is_active = 0`).Scan(&stats.Inactive)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM vouchers WHERE expires_at IS NOT NULL AND expires_at < NOW()`).Scan(&stats.Expired)
	var used sql.NullInt64
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(used_count),0) FROM vouchers`).Scan(&used)
	stats.TotalUsed = int(used.Int64)
	respondJSON(w, http.StatusOK, stats)
}

// GET /api/admin/vouchers/{id}   (id = code)
func AdminGetVoucher(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "id")
	row := database.DB.QueryRow(`SELECT `+voucherSelectCols+` FROM vouchers WHERE code = ?`, code)
	v, err := scanVoucher(row)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Voucher tidak ditemukan")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat voucher")
		return
	}
	respondJSON(w, http.StatusOK, v)
}

func loadVoucherByCode(w http.ResponseWriter, code string) {
	row := database.DB.QueryRow(`SELECT `+voucherSelectCols+` FROM vouchers WHERE code = ?`, code)
	v, err := scanVoucher(row)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat voucher")
		return
	}
	respondJSON(w, http.StatusOK, v)
}

type voucherWriteRequest struct {
	Code          *string `json:"code"`
	Description   *string `json:"description"`
	DiscountType  *string `json:"discountType"`
	DiscountValue *int    `json:"discountValue"`
	MinPrice      *int    `json:"minPrice"`
	MaxUses       *int    `json:"maxUses"`
	IsActive      *bool   `json:"isActive"`
	ExpiresAt     *string `json:"expiresAt"`
}

// POST /api/admin/vouchers   (JSON)
func AdminCreateVoucher(w http.ResponseWriter, r *http.Request) {
	var req voucherWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Format request tidak valid")
		return
	}
	if req.Code == nil || strings.TrimSpace(*req.Code) == "" {
		respondError(w, http.StatusBadRequest, "code wajib diisi")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(*req.Code))

	discountType := "percent"
	if req.DiscountType != nil {
		discountType = discountTypeToDB(*req.DiscountType)
	}
	description := ""
	if req.Description != nil {
		description = *req.Description
	}
	discountValue := 0
	if req.DiscountValue != nil {
		discountValue = *req.DiscountValue
	}
	minPrice := 0
	if req.MinPrice != nil {
		minPrice = *req.MinPrice
	}
	maxUses := 1
	if req.MaxUses != nil {
		maxUses = *req.MaxUses
	}
	isActive := 1
	if req.IsActive != nil {
		isActive = boolToInt(*req.IsActive)
	}
	var expiresAt any
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		expiresAt = *req.ExpiresAt
	}

	_, err := database.DB.Exec(
		`INSERT INTO vouchers (code, description, discount_type, discount_value,
			min_price, max_uses, is_active, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		code, description, discountType, discountValue, minPrice, maxUses, isActive, expiresAt,
	)
	if err != nil {
		respondInternal(w, "create voucher", err)
		return
	}
	loadVoucherByCode(w, code)
}

// PATCH /api/admin/vouchers/{id}   (JSON, partial; id = code)
func AdminUpdateVoucher(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "id")
	var req voucherWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Format request tidak valid")
		return
	}

	sets := []string{}
	args := []any{}
	if req.Description != nil {
		sets = append(sets, "description = ?")
		args = append(args, *req.Description)
	}
	if req.DiscountType != nil {
		sets = append(sets, "discount_type = ?")
		args = append(args, discountTypeToDB(*req.DiscountType))
	}
	if req.DiscountValue != nil {
		sets = append(sets, "discount_value = ?")
		args = append(args, *req.DiscountValue)
	}
	if req.MinPrice != nil {
		sets = append(sets, "min_price = ?")
		args = append(args, *req.MinPrice)
	}
	if req.MaxUses != nil {
		sets = append(sets, "max_uses = ?")
		args = append(args, *req.MaxUses)
	}
	if req.IsActive != nil {
		sets = append(sets, "is_active = ?")
		args = append(args, boolToInt(*req.IsActive))
	}
	if req.ExpiresAt != nil {
		if *req.ExpiresAt == "" {
			sets = append(sets, "expires_at = NULL")
		} else {
			sets = append(sets, "expires_at = ?")
			args = append(args, *req.ExpiresAt)
		}
	}

	if len(sets) > 0 {
		query := "UPDATE vouchers SET " + strings.Join(sets, ", ") + " WHERE code = ?"
		args = append(args, code)
		if _, err := database.DB.Exec(query, args...); err != nil {
			respondInternal(w, "update voucher", err)
			return
		}
	}
	loadVoucherByCode(w, code)
}

// DELETE /api/admin/vouchers/{id}   (id = code)
func AdminDeleteVoucher(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "id")
	if _, err := database.DB.Exec(`DELETE FROM vouchers WHERE code = ?`, code); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghapus voucher")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}
