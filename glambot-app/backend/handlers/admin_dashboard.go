package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"photobooth/database"
)

type kpiPoint struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

type kpiCard struct {
	Key         string     `json:"key"`
	Title       string     `json:"title"`
	Value       string     `json:"value"`
	ChangePct   float64    `json:"change_pct"`
	ChangeLabel string     `json:"change_label"`
	Trend       []kpiPoint `json:"trend"`
}

type salesPoint struct {
	Month    string `json:"month"`
	Current  int    `json:"current"`
	Previous int    `json:"previous"`
}

type salesReport struct {
	Total int          `json:"total"`
	Delta float64      `json:"delta"`
	Data  []salesPoint `json:"data"`
}

type recentOrder struct {
	ID      string `json:"id"`
	Package string `json:"package"`
	Amount  int    `json:"amount"`
	Date    string `json:"date"`
	Status  string `json:"status"`
}

type topListItem struct {
	Name  string `json:"name"`
	Used  int    `json:"used"`
	Trend string `json:"trend"`
}

type dashboardSummary struct {
	Kpis         []kpiCard     `json:"kpis"`
	SalesReport  salesReport   `json:"sales_report"`
	RecentOrders []recentOrder `json:"recent_orders"`
	TopFrames    []topListItem `json:"top_frames"`
	TopProducts  []topListItem `json:"top_products"`
}

func pctChange(today, prev float64) float64 {
	if prev == 0 {
		if today == 0 {
			return 0
		}
		return 100
	}
	return (today - prev) / prev * 100
}

// GET /api/admin/dashboard/summary
func GetDashboardSummary(w http.ResponseWriter, r *http.Request) {
	summary := dashboardSummary{
		Kpis:         buildKpis(),
		SalesReport:  buildSalesReport(),
		RecentOrders: buildRecentOrders(),
		TopFrames:    buildTopFrames(),
		TopProducts:  buildTopProducts(),
	}
	respondJSON(w, http.StatusOK, summary)
}

func buildKpis() []kpiCard {
	// Revenue bulan ini vs bulan lalu
	var revThis, revLast float64
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions
		WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', NOW())`).Scan(&revThis)
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM transactions
		WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', NOW() - INTERVAL '1 month')`).Scan(&revLast)

	// Customers = pelanggan BERBAYAR (sesi yang punya transaksi 'paid'), bukan
	// semua sesi — supaya tidak terinflasi oleh sesi batal/belum bayar. Dihitung
	// per bulan berdasarkan paid_at, konsisten dengan Total Revenue.
	var custThis, custLast float64
	_ = database.DB.QueryRow(`SELECT COUNT(DISTINCT session_id) FROM transactions
		WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', NOW())`).Scan(&custThis)
	_ = database.DB.QueryRow(`SELECT COUNT(DISTINCT session_id) FROM transactions
		WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', NOW() - INTERVAL '1 month')`).Scan(&custLast)

	// Voucher dipakai (total)
	var voucherUsed float64
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(used_count),0) FROM vouchers`).Scan(&voucherUsed)

	// Frame aktif
	var framesActive float64
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM frames WHERE is_active = 1`).Scan(&framesActive)

	revenueTrend := dailyTrend(`SELECT paid_at::date AS d, COALESCE(SUM(amount),0)
		FROM transactions
		WHERE status='paid' AND paid_at::date >= (NOW() - INTERVAL '6 days')::date
		GROUP BY d`)
	customerTrend := dailyTrend(`SELECT paid_at::date AS d, COUNT(DISTINCT session_id)
		FROM transactions
		WHERE status='paid' AND paid_at::date >= (NOW() - INTERVAL '6 days')::date
		GROUP BY d`)

	return []kpiCard{
		{Key: "revenue", Title: "Total Revenue", Value: "Rp" + formatRupiah(int(revThis)),
			ChangePct: pctChange(revThis, revLast), ChangeLabel: "vs last month", Trend: revenueTrend},
		{Key: "customers", Title: "Customers", Value: strconv.Itoa(int(custThis)),
			ChangePct: pctChange(custThis, custLast), ChangeLabel: "vs last month", Trend: customerTrend},
		{Key: "voucher", Title: "Voucher Used", Value: strconv.Itoa(int(voucherUsed)),
			ChangePct: 0, ChangeLabel: "total", Trend: []kpiPoint{}},
		{Key: "frames", Title: "Active Frames", Value: strconv.Itoa(int(framesActive)),
			ChangePct: 0, ChangeLabel: "active", Trend: []kpiPoint{}},
	}
}

// dailyTrend mengelompokkan satu query (kolom: tanggal, nilai) ke 7 hari
// terakhir. Hari tanpa data otomatis bernilai 0.
func dailyTrend(query string) []kpiPoint {
	counts := map[string]int{}
	if rows, err := database.DB.Query(query); err == nil {
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var v int
			if rows.Scan(&d, &v) == nil {
				counts[d.Format("2006-01-02")] = v
			}
		}
	}

	points := make([]kpiPoint, 0, 7)
	now := time.Now()
	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		points = append(points, kpiPoint{
			Label: day.Format("Mon"),
			Value: counts[day.Format("2006-01-02")],
		})
	}
	return points
}

func buildSalesReport() salesReport {
	months := []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

	// Satu query mengisi tahun ini (current) & tahun lalu (previous) sekaligus.
	cur := make([]int, 12)
	prev := make([]int, 12)
	rows, err := database.DB.Query(`
		SELECT EXTRACT(MONTH FROM paid_at)::int AS m,
		       COALESCE(SUM(amount) FILTER (WHERE EXTRACT(YEAR FROM paid_at) = EXTRACT(YEAR FROM NOW())), 0)     AS cur,
		       COALESCE(SUM(amount) FILTER (WHERE EXTRACT(YEAR FROM paid_at) = EXTRACT(YEAR FROM NOW()) - 1), 0) AS prev
		FROM transactions
		WHERE status='paid' AND paid_at IS NOT NULL
		  AND EXTRACT(YEAR FROM paid_at) IN (EXTRACT(YEAR FROM NOW()), EXTRACT(YEAR FROM NOW()) - 1)
		GROUP BY m`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var m, c, p int
			if rows.Scan(&m, &c, &p) == nil && m >= 1 && m <= 12 {
				cur[m-1] = c
				prev[m-1] = p
			}
		}
	}

	data := make([]salesPoint, 0, 12)
	totalCurrent, totalPrev := 0, 0
	for i := 0; i < 12; i++ {
		data = append(data, salesPoint{Month: months[i], Current: cur[i], Previous: prev[i]})
		totalCurrent += cur[i]
		totalPrev += prev[i]
	}

	return salesReport{Total: totalCurrent, Delta: pctChange(float64(totalCurrent), float64(totalPrev)), Data: data}
}

func buildRecentOrders() []recentOrder {
	rows, err := database.DB.Query(`SELECT t.id, COALESCE(p.name, ''), t.amount, t.status,
		COALESCE(s.status, ''), s.expires_at, t.created_at
		FROM transactions t
		LEFT JOIN sessions s ON s.id = t.session_id
		LEFT JOIN packages p ON p.id = s.package_id
		ORDER BY t.created_at DESC LIMIT 5`)
	if err != nil {
		return []recentOrder{}
	}
	defer rows.Close()

	orders := make([]recentOrder, 0, 5)
	for rows.Next() {
		var (
			o           recentOrder
			pkgName     string
			txStatus    string
			sessStatus  string
			expiresAt   sql.NullTime
			createdAt   time.Time
		)
		if err := rows.Scan(&o.ID, &pkgName, &o.Amount, &txStatus, &sessStatus, &expiresAt, &createdAt); err != nil {
			continue
		}
		o.Package = pkgName
		o.Date = createdAt.Format("2006-01-02")

		sessExpired := sessStatus == "expired" || (expiresAt.Valid && expiresAt.Time.Before(time.Now()))
		switch txStatus {
		case "paid":
			o.Status = "completed"
		case "failed":
			o.Status = "error"
		case "expired":
			o.Status = "cancel"
		default: // pending
			if sessExpired {
				o.Status = "cancel"
			} else {
				o.Status = "pending"
			}
		}
		orders = append(orders, o)
	}
	return orders
}

// "by Sales" → hanya hitung sesi yang BERBAYAR (punya transaksi 'paid'). Pakai
// LEFT JOIN supaya sesi yang frame/paketnya sudah dihapus tetap ikut terhitung
// (fallback nama via COALESCE), bukan hilang seperti pada INNER JOIN.
func buildTopFrames() []topListItem {
	return topList(`SELECT COALESCE(f.name, s.frame_id), COUNT(*) AS used
		FROM sessions s
		LEFT JOIN frames f ON f.id = s.frame_id
		WHERE s.frame_id IS NOT NULL AND s.frame_id <> ''
		  AND EXISTS (SELECT 1 FROM transactions t WHERE t.session_id = s.id AND t.status = 'paid')
		GROUP BY f.name, s.frame_id ORDER BY used DESC LIMIT 5`)
}

func buildTopProducts() []topListItem {
	return topList(`SELECT COALESCE(p.name, 'Unknown'), COUNT(*) AS used
		FROM sessions s
		LEFT JOIN packages p ON p.id = s.package_id
		WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.session_id = s.id AND t.status = 'paid')
		GROUP BY p.name ORDER BY used DESC LIMIT 5`)
}

func topList(query string) []topListItem {
	rows, err := database.DB.Query(query)
	if err != nil {
		return []topListItem{}
	}
	defer rows.Close()

	items := make([]topListItem, 0, 5)
	for rows.Next() {
		var (
			name sql.NullString
			used int
		)
		if err := rows.Scan(&name, &used); err != nil {
			continue
		}
		items = append(items, topListItem{Name: name.String, Used: used, Trend: "up"})
	}
	return items
}
