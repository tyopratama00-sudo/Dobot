package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"photobooth/services"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lib/pq"
)

// GET /api/payment/config — expose only whether safe development payment is enabled.
func GetPaymentConfig(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]bool{
		"test_payment_enabled": config.App != nil && config.App.AppEnv == "development",
	}))
}

// POST /api/payment/test — mark session and its pending transaction paid for local testing.
// This route is deliberately unavailable outside APP_ENV=development.
func TestPayment(w http.ResponseWriter, r *http.Request) {
	if config.App == nil || config.App.AppEnv != "development" {
		respondError(w, http.StatusNotFound, "Not found")
		return
	}
	var req models.CreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}
	session, err := GetSessionByID(req.SessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session not found")
		return
	}
	if session.Status == models.StatusPaid || session.Status == models.StatusShooting {
		respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{"paid": true, "session_id": session.ID}))
		return
	}
	if session.Status != models.StatusPendingPayment {
		respondError(w, http.StatusConflict, "Session tidak menunggu pembayaran")
		return
	}
	var txID string
	err = database.DB.QueryRow(`SELECT id FROM transactions WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, session.ID).Scan(&txID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Transaksi pending tidak ditemukan. Buat QR baru.")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membaca transaksi")
		return
	}
	tx, err := database.DB.Begin()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memproses pembayaran testing")
		return
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	if _, err = tx.Exec(`UPDATE transactions SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ? AND status = 'pending'`, now, txID); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memperbarui transaksi")
		return
	}
	if _, err = tx.Exec(`UPDATE sessions SET status = 'paid', expires_at = ? WHERE id = ? AND status = 'pending_payment'`, now.Add(time.Duration(config.App.SessionExpiryHours)*time.Hour), session.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memperbarui sesi")
		return
	}
	if err = tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan pembayaran testing")
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{"paid": true, "session_id": session.ID, "test": true}))
}

// POST /api/payment/create
func CreatePayment(w http.ResponseWriter, r *http.Request) {
	var req models.CreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	session, err := GetSessionByID(req.SessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session not found")
		return
	}

	if session.Status != models.StatusPendingPayment {
		respondError(w, http.StatusBadRequest, "Session tidak dalam status menunggu pembayaran")
		return
	}

	// Voucher 100%: tidak perlu buat QR Midtrans, langsung tandai lunas.
	if session.FinalPrice <= 0 {
		freeTx, err := createOrGetFreePaidTransaction(session)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memproses pembayaran gratis")
			return
		}

		session.Status = models.StatusPaid
		session.FinalPrice = 0

		respondJSON(w, http.StatusOK, models.SuccessResponse(models.CreatePaymentResponse{
			Transaction: *freeTx,
			Session:     *session,
		}))
		return
	}

	// Cek transaksi pending yang sudah ada
	var existingID string
	var existingAmount int
	err = database.DB.QueryRow(`
		SELECT id, amount FROM transactions
		WHERE session_id = ? AND status = 'pending'`,
		req.SessionID,
	).Scan(&existingID, &existingAmount)

	if err == nil && existingID != "" {
		// ── PENTING: cek apakah harga sudah berubah (ada voucher) ──
		if existingAmount == session.FinalPrice {
			// Harga sama → return transaksi lama
			tx, err := getTransactionByID(existingID)
			if err == nil {
				respondJSON(w, http.StatusOK, models.SuccessResponse(models.CreatePaymentResponse{
					Transaction: *tx,
					Session:     *session,
				}))
				return
			}
		}

		// Harga berbeda (voucher diapply) → hapus transaksi lama
		// agar bisa buat QRIS baru dengan harga yang benar
		if _, err := database.DB.Exec(`
			DELETE FROM transactions WHERE id = ?`, existingID,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui transaksi pembayaran")
			return
		}
	}

	// Buat order ID unik untuk Midtrans
	txID := uuid.New().String()
	orderID := fmt.Sprintf("BOOTH-%s", txID[:8])

	// Buat QRIS di Midtrans dengan harga FINAL (setelah diskon)
	qrisResult, err := services.CreateQRISPayment(orderID, session.FinalPrice, session.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat pembayaran: "+err.Error())
		return
	}

	// Simpan transaksi baru ke DB
	now := time.Now()
	_, err = database.DB.Exec(`
		INSERT INTO transactions
			(id, session_id, midtrans_order_id, amount, status, qris_url, qris_raw_string, created_at)
		VALUES
			(?, ?, ?, ?, 'pending', ?, ?, ?)`,
		txID,
		req.SessionID,
		orderID,
		session.FinalPrice,
		qrisResult.QRISUrl,
		qrisResult.QRISRaw,
		now.UTC(),
	)
	if err != nil {
		// Request lain sudah bikin 'pending' duluan (ditolak partial unique
		// index) → pakai transaksi itu, jangan bikin baris kedua.
		if isUniqueViolation(err) {
			if existing, gerr := getPendingTransactionBySession(req.SessionID); gerr == nil {
				respondJSON(w, http.StatusOK, models.SuccessResponse(models.CreatePaymentResponse{
					Transaction: *existing,
					Session:     *session,
				}))
				return
			}
		}
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan transaksi")
		return
	}

	tx := models.Transaction{
		ID:              txID,
		SessionID:       req.SessionID,
		MidtransOrderID: orderID,
		Amount:          session.FinalPrice,
		Status:          models.TxPending,
		QRISUrl:         qrisResult.QRISUrl,
		QRISRawString:   qrisResult.QRISRaw,
		CreatedAt:       now,
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(models.CreatePaymentResponse{
		Transaction: tx,
		Session:     *session,
	}))
}

// GET /api/payment/status/{orderID}
// Dipanggil polling dari frontend setiap 3 detik
func GetPaymentStatus(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderID")

	var txID, sessionID string
	var txStatus models.TransactionStatus
	err := database.DB.QueryRow(`
		SELECT id, session_id, status 
		FROM transactions
		WHERE midtrans_order_id = ?`, orderID,
	).Scan(&txID, &sessionID, &txStatus)

	if err != nil {
		respondError(w, http.StatusNotFound, "Transaksi tidak ditemukan")
		return
	}

	// Kalau sudah paid di DB, langsung return tanpa tanya Midtrans lagi
	if txStatus == models.TxPaid {
		respondJSON(w, http.StatusOK, models.SuccessResponse(models.PaymentStatusResponse{
			Status:    models.TxPaid,
			SessionID: sessionID,
			Paid:      true,
		}))
		return
	}

	// Tanya status terbaru ke Midtrans
	midtransStatus, err := services.CheckPaymentStatus(orderID)
	if err != nil {
		respondJSON(w, http.StatusOK, models.SuccessResponse(models.PaymentStatusResponse{
			Status:    txStatus,
			SessionID: sessionID,
			Paid:      false,
		}))
		return
	}

	if midtransStatus == "paid" {
		if _, err := markTransactionPaid(orderID); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui status pembayaran")
			return
		}

		respondJSON(w, http.StatusOK, models.SuccessResponse(models.PaymentStatusResponse{
			Status:    models.TxPaid,
			SessionID: sessionID,
			Paid:      true,
		}))
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(models.PaymentStatusResponse{
		Status:    models.TransactionStatus(midtransStatus),
		SessionID: sessionID,
		Paid:      false,
	}))
}

// POST /api/payment/webhook
// Midtrans POST ke sini setiap ada update status pembayaran
func PaymentWebhook(w http.ResponseWriter, r *http.Request) {
	var notif struct {
		OrderID           string `json:"order_id"`
		TransactionStatus string `json:"transaction_status"`
		FraudStatus       string `json:"fraud_status"`
		StatusCode        string `json:"status_code"`
		GrossAmount       string `json:"gross_amount"`
		SignatureKey      string `json:"signature_key"`
	}

	if err := json.NewDecoder(r.Body).Decode(&notif); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if notif.OrderID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if !services.VerifyMidtransSignature(notif.OrderID, notif.StatusCode, notif.GrossAmount, notif.SignatureKey) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var newStatus models.TransactionStatus
	isPaid := false

	switch notif.TransactionStatus {
	case "capture":
		if notif.FraudStatus == "accept" {
			newStatus = models.TxPaid
			isPaid = true
		} else {
			newStatus = models.TxFailed
		}
	case "settlement":
		newStatus = models.TxPaid
		isPaid = true
	case "cancel", "deny":
		newStatus = models.TxFailed
	case "expire":
		newStatus = models.TxExpired
	case "pending":
		newStatus = models.TxPending
	}

	if newStatus == "" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if isPaid {
		if _, err := markTransactionPaid(notif.OrderID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	} else {
		if _, err := database.DB.Exec(`
			UPDATE transactions SET status = ? WHERE midtrans_order_id = ?`,
			string(newStatus), notif.OrderID,
		); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ─── Helper ──────────────────────────────────────────────────────────────────

// isUniqueViolation true kalau err adalah pelanggaran unique constraint Postgres
// (SQLSTATE 23505), mis. dari partial unique index 1-pending-per-sesi.
func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

// getPendingTransactionBySession ambil transaksi 'pending' milik sesi (kalau ada).
func getPendingTransactionBySession(sessionID string) (*models.Transaction, error) {
	var id string
	if err := database.DB.QueryRow(`
		SELECT id FROM transactions
		WHERE session_id = ? AND status = 'pending'
		ORDER BY created_at DESC
		LIMIT 1`, sessionID,
	).Scan(&id); err != nil {
		return nil, err
	}
	return getTransactionByID(id)
}

func getTransactionByID(id string) (*models.Transaction, error) {
	row := database.DB.QueryRow(`
		SELECT 
			id, session_id, midtrans_order_id, amount, status,
			COALESCE(qris_url, ''), COALESCE(qris_raw_string, ''),
			created_at
		FROM transactions 
		WHERE id = ?`, id)

	var tx models.Transaction
	err := row.Scan(
		&tx.ID,
		&tx.SessionID,
		&tx.MidtransOrderID,
		&tx.Amount,
		&tx.Status,
		&tx.QRISUrl,
		&tx.QRISRawString,
		&tx.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &tx, nil
}

// markTransactionPaid update status transaksi dan sesi ke paid,
// lalu aktifkan robot via goroutine (non-blocking).
func markTransactionPaid(orderID string) (string, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return "", err
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	var sessionID string
	if err := tx.QueryRow(`
		SELECT session_id FROM transactions
		WHERE midtrans_order_id = ?`, orderID,
	).Scan(&sessionID); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("transaksi tidak ditemukan")
		}
		return "", err
	}

	now := time.Now().UTC()
	if _, err := tx.Exec(`
		UPDATE transactions
		SET status = 'paid', paid_at = COALESCE(paid_at, ?)
		WHERE midtrans_order_id = ?`,
		now, orderID,
	); err != nil {
		return "", err
	}

	// Perpanjang masa berlaku sesi saat lunas: dari payment window (beberapa
	// menit) menjadi retensi penuh (SESSION_EXPIRY_HOURS) supaya foto & link
	// download tidak ikut ke-cleanup tak lama setelah bayar.
	sessionExpiresAt := now.Add(time.Duration(config.App.SessionExpiryHours) * time.Hour)
	// Hanya naik ke 'paid' dari state pra-shooting — webhook Midtrans bisa
	// dobel/telat dan jangan sampai mereset sesi 'shooting'/'completed'.
	// 'expired' tetap ikut supaya bayar yang lolos telat masih memulihkan sesi.
	if _, err := tx.Exec(`
		UPDATE sessions SET status = 'paid', expires_at = ?
		WHERE id = ? AND status IN ('pending_payment', 'expired')`, sessionExpiresAt, sessionID,
	); err != nil {
		return "", err
	}

	// Batalkan transaksi pending lain milik sesi yang sama (duplikat dari
	// retry/buka-ulang/race) supaya tidak menggantung sebagai "Pending" di admin
	// padahal sesinya sudah lunas. Hanya yang masih 'pending' yang disentuh.
	if _, err := tx.Exec(`
		UPDATE transactions SET status = 'expired'
		WHERE session_id = ? AND status = 'pending' AND midtrans_order_id <> ?`,
		sessionID, orderID,
	); err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}
	rollback = false

	// Robot enable dipindah ke frontend (tombol "Got it, Let's Go!" di
	// instruction page) supaya hanya 1 kali fire dan user-controlled.

	return sessionID, nil
}

func createOrGetFreePaidTransaction(session *models.Session) (*models.Transaction, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, err
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	var existing models.Transaction
	err = tx.QueryRow(`
		SELECT id, session_id, midtrans_order_id, amount, status,
		       COALESCE(qris_url, ''), COALESCE(qris_raw_string, ''),
		       created_at, paid_at
		FROM transactions
		WHERE session_id = ? AND status = 'paid'
		ORDER BY created_at DESC
		LIMIT 1`,
		session.ID,
	).Scan(
		&existing.ID,
		&existing.SessionID,
		&existing.MidtransOrderID,
		&existing.Amount,
		&existing.Status,
		&existing.QRISUrl,
		&existing.QRISRawString,
		&existing.CreatedAt,
		&existing.PaidAt,
	)

	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	if err == sql.ErrNoRows {
		if _, err := tx.Exec(`DELETE FROM transactions WHERE session_id = ? AND status = 'pending'`, session.ID); err != nil {
			return nil, err
		}

		now := time.Now().UTC()
		txID := uuid.New().String()
		orderID := fmt.Sprintf("FREE-%s", txID[:8])

		if _, err := tx.Exec(`
			INSERT INTO transactions
				(id, session_id, midtrans_order_id, amount, status, paid_at, created_at)
			VALUES
				(?, ?, ?, 0, 'paid', ?, ?)`,
			txID, session.ID, orderID, now, now,
		); err != nil {
			return nil, err
		}

		existing = models.Transaction{
			ID:              txID,
			SessionID:       session.ID,
			MidtransOrderID: orderID,
			Amount:          0,
			Status:          models.TxPaid,
			PaidAt:          &now,
			CreatedAt:       now,
		}
	}

	// Perpanjang masa berlaku sesi ke retensi penuh saat lunas (lihat catatan
	// di markPaid) supaya hasil sesi tidak ke-cleanup tak lama setelah bayar.
	sessionExpiresAt := time.Now().UTC().Add(time.Duration(config.App.SessionExpiryHours) * time.Hour)
	if _, err := tx.Exec(`UPDATE sessions SET status = 'paid', final_price = 0, expires_at = ? WHERE id = ?`, sessionExpiresAt, session.ID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	rollback = false

	// Robot enable dipindah ke frontend (tombol "Got it, Let's Go!").

	return &existing, nil
}
