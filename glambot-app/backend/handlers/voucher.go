package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"photobooth/database"
	"photobooth/models"
	"strings"
	"time"

	"github.com/google/uuid"
)

func getSessionTotalPrice(session *models.Session) int {
	return session.Price + (session.PrintCount * session.PrintUnitPrice)
}

// POST /api/voucher/apply
func ApplyVoucher(w http.ResponseWriter, r *http.Request) {
	var req models.ApplyVoucherRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.VoucherCode = strings.ToUpper(strings.TrimSpace(req.VoucherCode))
	if req.VoucherCode == "" {
		respondError(w, http.StatusBadRequest, "Voucher code tidak boleh kosong")
		return
	}

	// Ambil sesi
	session, err := GetSessionByID(req.SessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	if session.Status != models.StatusPendingPayment {
		respondInvalidVoucher(w, "Voucher hanya bisa dipakai sebelum pembayaran")
		return
	}

	totalPrice := getSessionTotalPrice(session)

	// Cari voucher di DB
	var v models.Voucher
	var expiresAt *time.Time
	var isActiveInt int

	err = database.DB.QueryRow(`
		SELECT 
			code, COALESCE(description, ''), discount_type, discount_value,
			min_price, max_uses, used_count, is_active, expires_at
		FROM vouchers 
		WHERE code = ?`, req.VoucherCode,
	).Scan(
		&v.Code,
		&v.Description,
		&v.DiscountType,
		&v.DiscountValue,
		&v.MinPrice,
		&v.MaxUses,
		&v.UsedCount,
		&isActiveInt,
		&expiresAt,
	)

	if err != nil {
		respondInvalidVoucher(w, "Voucher tidak ditemukan")
		return
	}

	v.IsActive = isActiveInt == 1
	v.ExpiresAt = expiresAt

	// Validasi voucher
	if !v.IsActive {
		respondInvalidVoucher(w, "Voucher tidak aktif")
		return
	}

	if v.ExpiresAt != nil && time.Now().After(*v.ExpiresAt) {
		respondInvalidVoucher(w, "Voucher sudah kedaluwarsa")
		return
	}

	if v.UsedCount >= v.MaxUses {
		respondInvalidVoucher(w, "Voucher sudah mencapai batas penggunaan")
		return
	}

	if totalPrice < v.MinPrice {
		respondInvalidVoucher(w, fmt.Sprintf("Minimum pembelian Rp %s untuk voucher ini", formatRupiah(v.MinPrice)))
		return
	}

	// Hitung diskon
	discountAmount := 0
	if v.DiscountType == models.DiscountPercent {
		discountAmount = totalPrice * v.DiscountValue / 100
	} else {
		discountAmount = v.DiscountValue
	}

	// Pastikan diskon tidak melebihi harga
	if discountAmount > totalPrice {
		discountAmount = totalPrice
	}

	finalPrice := totalPrice - discountAmount

	tx, err := database.DB.Begin()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memulai transaksi voucher")
		return
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	var oldCode string
	err = tx.QueryRow(`
		SELECT voucher_code FROM voucher_usage WHERE session_id = ?`, req.SessionID,
	).Scan(&oldCode)
	if err != nil && err != sql.ErrNoRows {
		respondError(w, http.StatusInternalServerError, "Gagal membaca voucher sebelumnya")
		return
	}

	if oldCode != "" {
		if _, err := tx.Exec(`
			UPDATE vouchers
			SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END
			WHERE code = ?`, oldCode,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui penggunaan voucher lama")
			return
		}

		if _, err := tx.Exec(`
			DELETE FROM voucher_usage WHERE session_id = ?`, req.SessionID,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menghapus pemakaian voucher lama")
			return
		}
	}

	if _, err := tx.Exec(`
		UPDATE sessions
		SET discount = ?, final_price = ?
		WHERE id = ?`,
		discountAmount, finalPrice, req.SessionID,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan diskon")
		return
	}

	if _, err := tx.Exec(`
		INSERT INTO voucher_usage (id, voucher_code, session_id)
		VALUES (?, ?, ?)`,
		uuid.New().String(), v.Code, req.SessionID,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan penggunaan voucher")
		return
	}

	if _, err := tx.Exec(`
		UPDATE vouchers SET used_count = used_count + 1 WHERE code = ?`, v.Code,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memperbarui penggunaan voucher")
		return
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan transaksi voucher")
		return
	}

	rollback = false

	respondJSON(w, http.StatusOK, models.SuccessResponse(models.ApplyVoucherResponse{
		Valid:          true,
		Message:        fmt.Sprintf("Voucher berhasil! Hemat %s", formatDiscount(v)),
		DiscountAmount: discountAmount,
		FinalPrice:     finalPrice,
		Voucher:        &v,
	}))
}

// POST /api/voucher/remove
func RemoveVoucher(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	session, err := GetSessionByID(req.SessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	// Kembalikan used_count voucher
	var oldCode string
	err = database.DB.QueryRow(`
		SELECT voucher_code FROM voucher_usage WHERE session_id = ?`, req.SessionID,
	).Scan(&oldCode)
	if err != nil && err != sql.ErrNoRows {
		respondError(w, http.StatusInternalServerError, "Gagal membaca penggunaan voucher")
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memulai transaksi hapus voucher")
		return
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	if oldCode != "" {
		if _, err := tx.Exec(`
			UPDATE vouchers
			SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END
			WHERE code = ?`, oldCode,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui penggunaan voucher")
			return
		}

		if _, err := tx.Exec(`
			DELETE FROM voucher_usage WHERE session_id = ?`, req.SessionID,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menghapus penggunaan voucher")
			return
		}
	}

	// Reset diskon di sesi
	if _, err := tx.Exec(`
		UPDATE sessions SET discount = 0, final_price = ? WHERE id = ?`, getSessionTotalPrice(session), req.SessionID,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mereset diskon sesi")
		return
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan penghapusan voucher")
		return
	}

	rollback = false

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"session_id":     req.SessionID,
		"original_price": getSessionTotalPrice(session),
		"final_price":    getSessionTotalPrice(session),
		"discount":       0,
	}))
}

// ─── Helper ──────────────────────────────────────────────────────────────────

func formatDiscount(v models.Voucher) string {
	if v.DiscountType == models.DiscountPercent {
		return fmt.Sprintf("%d%%", v.DiscountValue)
	}
	return "Rp " + formatRupiah(v.DiscountValue)
}

func formatRupiah(n int) string {
	s := fmt.Sprintf("%d", n)
	result := ""
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result += "."
		}
		result += string(c)
	}
	return result
}

func respondInvalidVoucher(w http.ResponseWriter, message string) {
	respondJSON(w, http.StatusOK, models.SuccessResponse(models.ApplyVoucherResponse{
		Valid:   false,
		Message: message,
	}))
}
