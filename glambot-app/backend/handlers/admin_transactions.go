package handlers

import (
	"database/sql"
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"photobooth/database"

	"github.com/go-chi/chi/v5"
)

type txPackage struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
	Type string `json:"type"`
}

type txFrame struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
}

// txVoucher — info voucher yang dipakai sesi (dari voucher_usage + sessions.discount).
type txVoucher struct {
	Code     string `json:"code"`
	Discount int    `json:"discount"`
}

// transactionResponse — bentuk yang diharapkan frontend (transaction/api/types.ts).
type transactionResponse struct {
	ID              string     `json:"id"`
	SessionID       string     `json:"session_id"`
	MidtransOrderID string     `json:"midtrans_order_id"`
	Amount          int        `json:"amount"`
	Status          string     `json:"status"`
	QRISUrl         string     `json:"qris_url,omitempty"`
	QRISRawString   string     `json:"qris_raw_string,omitempty"`
	PaidAt          *string    `json:"paid_at,omitempty"`
	CreatedAt       string     `json:"created_at"`
	Voucher         *txVoucher `json:"voucher,omitempty"`
	Package         *txPackage `json:"package,omitempty"`
	Frame           *txFrame   `json:"frame,omitempty"`
}

// status paid (DB) ⇄ success (FE)
func txStatusToFE(db string) string {
	if db == "paid" {
		return "success"
	}
	return db
}

func txStatusToDB(fe string) string {
	if fe == "success" {
		return "paid"
	}
	return fe
}

// regular → digital, vip → digital+print
func packageCodeToType(code string) string {
	if code == "vip" {
		return "digital+print"
	}
	return "digital"
}

// Voucher diambil lewat correlated subquery (bukan JOIN) supaya SATU baris
// transaksi tetap satu baris — voucher_usage.session_id tidak unik, jadi JOIN
// bisa menggandakan baris & bikin list desync dengan COUNT(*) yang tak ikut join.
const txSelect = `t.id, t.session_id, t.midtrans_order_id, t.amount, t.status,
	COALESCE(t.qris_url, ''), COALESCE(t.qris_raw_string, ''), t.paid_at, t.created_at,
	p.id, p.code, p.name, f.id, f.name, f.category,
	s.expires_at, COALESCE(s.discount, 0),
	(SELECT vu.voucher_code FROM voucher_usage vu
	 WHERE vu.session_id = t.session_id
	 ORDER BY vu.used_at DESC LIMIT 1)
	FROM transactions t
	LEFT JOIN sessions s ON s.id = t.session_id
	LEFT JOIN packages p ON p.id = s.package_id
	LEFT JOIN frames   f ON f.id = s.frame_id`

func scanTransaction(s interface{ Scan(...any) error }) (transactionResponse, error) {
	var (
		t          transactionResponse
		dbStatus   string
		paidAt     sql.NullTime
		createdAt  time.Time
		pkgID      sql.NullInt64
		pkgCode    sql.NullString
		pkgName    sql.NullString
		frameID     sql.NullString
		frameName   sql.NullString
		frameCat    sql.NullString
		expiresAt   sql.NullTime
		discount    int
		voucherCode sql.NullString
	)
	err := s.Scan(&t.ID, &t.SessionID, &t.MidtransOrderID, &t.Amount, &dbStatus,
		&t.QRISUrl, &t.QRISRawString, &paidAt, &createdAt,
		&pkgID, &pkgCode, &pkgName, &frameID, &frameName, &frameCat,
		&expiresAt, &discount, &voucherCode)
	if err != nil {
		return t, err
	}
	// Transaksi pending milik sesi yang sudah lewat expires_at dianggap expired
	// secara real-time, tanpa tunggu cleanup job jalan.
	if dbStatus == "pending" && expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
		dbStatus = "expired"
	}
	t.Status = txStatusToFE(dbStatus)
	t.CreatedAt = createdAt.Format(time.RFC3339)
	if paidAt.Valid {
		s := paidAt.Time.Format(time.RFC3339)
		t.PaidAt = &s
	}
	if pkgID.Valid {
		t.Package = &txPackage{
			ID:   pkgID.Int64,
			Name: pkgName.String,
			Code: pkgCode.String,
			Type: packageCodeToType(pkgCode.String),
		}
	}
	if frameID.Valid && frameID.String != "" {
		t.Frame = &txFrame{ID: frameID.String, Name: frameName.String, Category: frameCat.String}
	}
	if voucherCode.Valid && voucherCode.String != "" {
		t.Voucher = &txVoucher{Code: voucherCode.String, Discount: discount}
	}
	return t, nil
}

// buildTxFilter membangun klausa WHERE bersama untuk list & export.
func buildTxFilter(r *http.Request) (string, []any) {
	where := []string{"1=1"}
	args := []any{}
	if s := queryParam(r, "search"); s != "" {
		where = append(where, "(t.id ILIKE ? OR t.midtrans_order_id ILIKE ? OR t.session_id ILIKE ?)")
		like := "%" + s + "%"
		args = append(args, like, like, like)
	}
	if st := queryParam(r, "status"); st != "" {
		// Filter pakai status EFEKTIF seperti yang ditampilkan (pending pada sesi
		// lewat expires_at = expired, lihat scanTransaction) supaya list, count,
		// dan badge konsisten. Butuh LEFT JOIN sessions s.
		switch txStatusToDB(st) {
		case "paid":
			where = append(where, "t.status = 'paid'")
		case "failed":
			where = append(where, "t.status = 'failed'")
		case "cancelled":
			where = append(where, "t.status = 'cancelled'")
		case "expired":
			where = append(where, "(t.status = 'expired' OR (t.status = 'pending' AND s.expires_at IS NOT NULL AND s.expires_at < NOW()))")
		case "pending":
			where = append(where, "(t.status = 'pending' AND (s.expires_at IS NULL OR s.expires_at >= NOW()))")
		default:
			where = append(where, "t.status = ?")
			args = append(args, txStatusToDB(st))
		}
	}
	if m := queryParam(r, "month"); m != "" {
		where = append(where, "EXTRACT(MONTH FROM t.created_at) = ?")
		args = append(args, m)
	}
	return strings.Join(where, " AND "), args
}

// GET /api/admin/transactions
func AdminListTransactions(w http.ResponseWriter, r *http.Request) {
	page, limit, offset := parsePaging(r)
	whereSQL, args := buildTxFilter(r)

	orderBy := "t.created_at DESC"
	switch r.URL.Query().Get("sortBy") {
	case "amount":
		orderBy = "t.amount " + sortDir(r)
	case "status":
		orderBy = "t.status " + sortDir(r)
	case "createdAt":
		orderBy = "t.created_at " + sortDir(r)
	}

	var total int
	if err := database.DB.QueryRow(
		`SELECT COUNT(*) FROM transactions t
		 LEFT JOIN sessions s ON s.id = t.session_id WHERE `+whereSQL, args...,
	).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghitung transaksi")
		return
	}

	rows, err := database.DB.Query(
		`SELECT `+txSelect+` WHERE `+whereSQL+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
		append(args, limit, offset)...,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat transaksi")
		return
	}
	defer rows.Close()

	list := make([]transactionResponse, 0)
	for rows.Next() {
		t, err := scanTransaction(rows)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca transaksi")
			return
		}
		list = append(list, t)
	}

	respondJSON(w, http.StatusOK, adminListResponse{Data: list, Meta: buildMeta(total, page, limit)})
}

// GET /api/admin/transactions/stats
func AdminTransactionStats(w http.ResponseWriter, r *http.Request) {
	stats := struct {
		Total               int     `json:"total"`
		TotalChangePct      float64 `json:"totalChangePct"`
		Revenue             int     `json:"revenue"`
		RevenueChangePct    float64 `json:"revenueChangePct"`
		Successful          int     `json:"successful"`
		SuccessfulChangePct float64 `json:"successfulChangePct"`
		Failed              int     `json:"failed"`
		FailedChangePct     float64 `json:"failedChangePct"`
	}{}

	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM transactions`).Scan(&stats.Total)
	var revenue sql.NullInt64
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status = 'paid'`).Scan(&revenue)
	stats.Revenue = int(revenue.Int64)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM transactions WHERE status = 'paid'`).Scan(&stats.Successful)
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM transactions WHERE status = 'failed'`).Scan(&stats.Failed)

	// % perubahan hari ini vs kemarin — pakai pctChange bersama (admin_dashboard.go).
	count := func(cond string) (today, yest float64) {
		_ = database.DB.QueryRow(`SELECT COUNT(*) FROM transactions WHERE created_at::date = NOW()::date AND ` + cond).Scan(&today)
		_ = database.DB.QueryRow(`SELECT COUNT(*) FROM transactions WHERE created_at::date = (NOW() - INTERVAL '1 day')::date AND ` + cond).Scan(&yest)
		return
	}

	tT, tY := count("1=1")
	stats.TotalChangePct = pctChange(tT, tY)
	sT, sY := count("status = 'paid'")
	stats.SuccessfulChangePct = pctChange(sT, sY)
	fT, fY := count("status = 'failed'")
	stats.FailedChangePct = pctChange(fT, fY)

	var revT, revY float64
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status = 'paid' AND paid_at::date = NOW()::date`).Scan(&revT)
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status = 'paid' AND paid_at::date = (NOW() - INTERVAL '1 day')::date`).Scan(&revY)
	stats.RevenueChangePct = pctChange(revT, revY)

	respondJSON(w, http.StatusOK, stats)
}

// GET /api/admin/transactions/{id}
func AdminGetTransaction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	row := database.DB.QueryRow(`SELECT `+txSelect+` WHERE t.id = ?`, id)
	t, err := scanTransaction(row)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Transaksi tidak ditemukan")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat transaksi")
		return
	}
	respondJSON(w, http.StatusOK, t)
}

// GET /api/admin/transactions/export  → CSV
func AdminExportTransactions(w http.ResponseWriter, r *http.Request) {
	whereSQL, args := buildTxFilter(r)
	rows, err := database.DB.Query(
		`SELECT `+txSelect+` WHERE `+whereSQL+` ORDER BY t.created_at DESC`, args...,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengekspor transaksi")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="transactions.csv"`)

	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{"ID", "Order ID", "Session ID", "Package", "Frame", "Amount", "Status", "Paid At", "Created At"})

	for rows.Next() {
		t, err := scanTransaction(rows)
		if err != nil {
			return
		}
		pkgName, frameName, paidAt := "", "", ""
		if t.Package != nil {
			pkgName = t.Package.Name
		}
		if t.Frame != nil {
			frameName = t.Frame.Name
		}
		if t.PaidAt != nil {
			paidAt = *t.PaidAt
		}
		_ = cw.Write([]string{
			t.ID, t.MidtransOrderID, t.SessionID, pkgName, frameName,
			strconv.Itoa(t.Amount), t.Status, paidAt, t.CreatedAt,
		})
	}
}
