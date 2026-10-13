package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GET /api/package
func GetPackages(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, code, name, base_price, duration_secs, COALESCE(description, ''),
		       COALESCE(image_src, ''), is_popular, print_count, print_unit_price
		FROM packages
		WHERE is_active = 1
		ORDER BY sort_order ASC, code ASC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load packages")
		return
	}
	defer rows.Close()

	packages := make([]models.PackageInfo, 0)
	for rows.Next() {
		var pkg models.PackageInfo
		var isPopularInt int
		if err := rows.Scan(
			&pkg.ID, &pkg.Code, &pkg.Name, &pkg.Price, &pkg.DurationSecs,
			&pkg.Description, &pkg.ImageSrc, &isPopularInt, &pkg.PrintCount, &pkg.PrintUnitPrice,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to read packages")
			return
		}
		pkg.IsPopular = isPopularInt == 1
		pkg.DurationMins = pkg.DurationSecs / 60
		packages = append(packages, pkg)
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to read packages")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(packages))
}

// POST /api/session/create
func CreateSession(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.PackageID <= 0 {
		respondError(w, http.StatusBadRequest, "Invalid package id")
		return
	}

	var pkgInfo models.PackageInfo
	err := database.DB.QueryRow(`
		SELECT id, code, name, base_price, duration_secs, COALESCE(description, ''), print_unit_price
		FROM packages
		WHERE id = ? AND is_active = 1`, req.PackageID,
	).Scan(&pkgInfo.ID, &pkgInfo.Code, &pkgInfo.Name, &pkgInfo.Price, &pkgInfo.DurationSecs, &pkgInfo.Description, &pkgInfo.PrintUnitPrice)
	if err != nil {
		log.Printf("CreateSession package lookup failed: packageId=%d err=%v", req.PackageID, err)
		respondError(w, http.StatusBadRequest, "Invalid package id")
		return
	}

	printUnitPrice := pkgInfo.PrintUnitPrice

	printCount := req.PrintCount
	if printCount < 0 {
		respondError(w, http.StatusBadRequest, "Invalid print count")
		return
	}

	extraPrintCost := printCount * printUnitPrice
	finalPrice := pkgInfo.Price + extraPrintCost

	sessionID := uuid.New().String()
	now := time.Now()
	expiresAt := now.Add(time.Duration(config.App.PaymentExpiryMins) * time.Minute)

	_, err = database.DB.Exec(`
		INSERT INTO sessions
			(id, package_id, package_code, category, duration_secs, print_count, print_unit_price, price, discount, final_price, status, created_at, expires_at)
		VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending_payment', ?, ?)`,
		sessionID,
		pkgInfo.ID,
		pkgInfo.Code,
		pkgInfo.Code,
		pkgInfo.DurationSecs,
		printCount,
		printUnitPrice,
		pkgInfo.Price,
		finalPrice,
		now.UTC(),
		expiresAt.UTC(),
	)
	if err != nil {
		log.Printf("CreateSession insert failed: packageId=%d packageCode=%s printCount=%d finalPrice=%d err=%v", req.PackageID, pkgInfo.Code, printCount, finalPrice, err)
		respondError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	session := models.Session{
		ID:             sessionID,
		PackageID:      pkgInfo.ID,
		PackageCode:    pkgInfo.Code,
		DurationSecs:   pkgInfo.DurationSecs,
		PrintCount:     printCount,
		PrintUnitPrice: printUnitPrice,
		Price:          pkgInfo.Price,
		Discount:       0,
		FinalPrice:     finalPrice,
		Status:         models.StatusPendingPayment,
		CreatedAt:      now,
		ExpiresAt:      expiresAt,
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(session))
}

// GET /api/session/{sessionID}
func GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session not found")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(session))
}

// PATCH /api/session/{sessionID}/status
func UpdateSessionStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	var body struct {
		Status models.SessionStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validasi transisi status — cegah lompat ke 'shooting' tanpa lewat 'paid'
	// (mis. user akses /photo-session langsung tanpa bayar). Hanya transisi yang
	// masuk akal yang diizinkan; status target di luar enum ditolak.
	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}
	if !isAllowedStatusTransition(session.Status, body.Status) {
		respondError(w, http.StatusConflict, "Transisi status sesi tidak diizinkan")
		return
	}

	_, err = database.DB.Exec(
		`UPDATE sessions SET status = ? WHERE id = ?`,
		string(body.Status), sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update session")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"session_id": sessionID,
		"status":     string(body.Status),
	}))
}

// isAllowedStatusTransition membatasi perpindahan status sesi agar pembayaran
// tidak bisa dilewati. Kunci: 'shooting' hanya boleh dari 'paid'/'shooting'.
// 'expired' selalu boleh (timeout/cleanup). Status target tak dikenal → ditolak.
func isAllowedStatusTransition(cur, next models.SessionStatus) bool {
	if cur == next {
		return true
	}
	switch next {
	case models.StatusPaid:
		return cur == models.StatusPendingPayment
	case models.StatusShooting:
		return cur == models.StatusPaid
	case models.StatusCompleted:
		return cur == models.StatusShooting || cur == models.StatusPaid
	case models.StatusExpired:
		return true
	default:
		return false
	}
}

// ─── Shared helper, dipakai handler lain ─────────────────────────────────────

func GetSessionByID(id string) (*models.Session, error) {
	row := database.DB.QueryRow(`
		SELECT
			id, package_id, package_code, duration_secs, print_count, print_unit_price, price, discount, final_price,
			status, COALESCE(frame_id, ''), created_at, expires_at
		FROM sessions
		WHERE id = ?`, id)

	var s models.Session
	var frameID string
	err := row.Scan(
		&s.ID,
		&s.PackageID,
		&s.PackageCode,
		&s.DurationSecs,
		&s.PrintCount,
		&s.PrintUnitPrice,
		&s.Price,
		&s.Discount,
		&s.FinalPrice,
		&s.Status,
		&frameID,
		&s.CreatedAt,
		&s.ExpiresAt,
	)
	if err != nil {
		return nil, err
	}

	s.FrameID = frameID
	return &s, nil
}
