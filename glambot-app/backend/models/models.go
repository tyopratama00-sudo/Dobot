package models

import (
	"encoding/json"
	"time"
)

// ─── Package ────────────────────────────────────────────────────────────────

type PackageInfo struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	Price        int    `json:"price"`
	DurationSecs int    `json:"duration_secs"`
	DurationMins int    `json:"duration_mins"`
	Description  string `json:"description"`
	ImageSrc     string `json:"image_src,omitempty"`
	IsPopular    bool   `json:"is_popular"`
	PrintCount   int    `json:"print_count"`
	// PrintUnitPrice harga per cetak ekstra (di luar print_count bawaan paket).
	PrintUnitPrice int `json:"print_unit_price"`
}

// ─── Session ─────────────────────────────────────────────────────────────────

type SessionStatus string

const (
	StatusPendingPayment SessionStatus = "pending_payment"
	StatusPaid           SessionStatus = "paid"
	StatusShooting       SessionStatus = "shooting"
	StatusCompleted      SessionStatus = "completed"
	StatusExpired        SessionStatus = "expired"
)

type Session struct {
	ID             string        `json:"id"`
	PackageID      int64         `json:"package_id"`
	PackageCode    string        `json:"package_code,omitempty"`
	DurationSecs   int           `json:"duration_secs"`
	PrintCount     int           `json:"print_count"`
	PrintUnitPrice int           `json:"print_unit_price"`
	Price          int           `json:"price"`
	Discount       int           `json:"discount"`
	FinalPrice     int           `json:"final_price"`
	Status         SessionStatus `json:"status"`
	FrameID        string        `json:"frame_id,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`
	ExpiresAt      time.Time     `json:"expires_at"`
	CompletedAt    *time.Time    `json:"completed_at,omitempty"`
}

// ─── Transaction ─────────────────────────────────────────────────────────────

type TransactionStatus string

const (
	TxPending TransactionStatus = "pending"
	TxPaid    TransactionStatus = "paid"
	TxFailed  TransactionStatus = "failed"
	TxExpired TransactionStatus = "expired"
)

type Transaction struct {
	ID              string            `json:"id"`
	SessionID       string            `json:"session_id"`
	MidtransOrderID string            `json:"midtrans_order_id"`
	Amount          int               `json:"amount"`
	Status          TransactionStatus `json:"status"`
	QRISUrl         string            `json:"qris_url,omitempty"`
	QRISRawString   string            `json:"qris_raw_string,omitempty"`
	PaidAt          *time.Time        `json:"paid_at,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
}

// ─── Photo ───────────────────────────────────────────────────────────────────

type PhotoType string

const (
	PhotoRaw PhotoType = "raw"
)

type Photo struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	FilePath    string    `json:"file_path"`
	FileName    string    `json:"file_name"`
	Type        PhotoType `json:"type"`
	Selected    bool      `json:"selected"`
	Position    *int      `json:"position,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	URL         string    `json:"url,omitempty"`
	DownloadURL string    `json:"download_url,omitempty"`
}

// ─── Voucher ─────────────────────────────────────────────────────────────────

type DiscountType string

const (
	DiscountPercent DiscountType = "percent"
)

type Voucher struct {
	Code          string       `json:"code"`
	Description   string       `json:"description"`
	DiscountType  DiscountType `json:"discount_type"`
	DiscountValue int          `json:"discount_value"`
	MinPrice      int          `json:"min_price"`
	MaxUses       int          `json:"max_uses"`
	UsedCount     int          `json:"used_count"`
	IsActive      bool         `json:"is_active"`
	ExpiresAt     *time.Time   `json:"expires_at,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
}

// ─── Frame ───────────────────────────────────────────────────────────────────

type Frame struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Category     string          `json:"category"`
	FilePath     string          `json:"file_path"`
	ThumbURL     string          `json:"thumb_url"`
	PhotoSlots   int             `json:"photo_slots"`
	CanvasWidth  int             `json:"canvas_width"`
	CanvasHeight int             `json:"canvas_height"`
	Slots        json.RawMessage `json:"slots"`
}

// ─── Request / Response DTOs ─────────────────────────────────────────────────

type CreateSessionRequest struct {
	PackageID  int64 `json:"packageId"`
	PrintCount int   `json:"printCount"`
}

type CreatePaymentRequest struct {
	SessionID   string `json:"session_id"`
	VoucherCode string `json:"voucher_code,omitempty"`
}

type CreatePaymentResponse struct {
	Transaction Transaction `json:"transaction"`
	Session     Session     `json:"session"`
}

type PaymentStatusResponse struct {
	Status    TransactionStatus `json:"status"`
	SessionID string            `json:"session_id"`
	Paid      bool              `json:"paid"`
}

type ApplyVoucherRequest struct {
	SessionID   string `json:"session_id"`
	VoucherCode string `json:"voucher_code"`
}

type ApplyVoucherResponse struct {
	Valid          bool     `json:"valid"`
	Message        string   `json:"message"`
	DiscountAmount int      `json:"discount_amount"`
	FinalPrice     int      `json:"final_price"`
	Voucher        *Voucher `json:"voucher,omitempty"`
}

// ─── Generic Response ─────────────────────────────────────────────────────────

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func SuccessResponse(data interface{}) APIResponse {
	return APIResponse{Success: true, Data: data}
}

func ErrorResponse(msg string) APIResponse {
	return APIResponse{Success: false, Error: msg}
}
