package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"photobooth/config"
	"strings"
	"time"
)

var gatewayHTTP = &http.Client{Timeout: 30 * time.Second}

// PaymentGatewayEnabled true kalau pembayaran lewat layanan pay.photorobot.id.
// Dengan ini kiosk tidak perlu MIDTRANS_SERVER_KEY sama sekali.
func PaymentGatewayEnabled() bool {
	return config.App != nil && config.App.PaymentGatewayURL != ""
}

// gatewayDo memanggil layanan dengan token booth. Token tidak pernah ditulis ke
// log atau dikirim ke frontend.
func gatewayDo(method, path string, payload, out interface{}) error {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, strings.TrimRight(config.App.PaymentGatewayURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+config.App.PaymentGatewayToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := gatewayHTTP.Do(req)
	if err != nil {
		return fmt.Errorf("gateway tidak bisa dihubungi: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("gateway %d: %s", resp.StatusCode, e.Error)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func gatewayCreateQRIS(orderID string, amount int, sessionID string) (*QRISResult, error) {
	var out struct {
		QRISUrl string `json:"qris_url"`
		QRISRaw string `json:"qris_raw"`
	}
	err := gatewayDo(http.MethodPost, "/v1/qris", map[string]interface{}{
		"order_id":       orderID,
		"amount":         amount,
		"session_id":     sessionID,
		"expiry_minutes": config.App.PaymentExpiryMins,
	}, &out)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat QRIS: %w", err)
	}
	return &QRISResult{QRISUrl: out.QRISUrl, QRISRaw: out.QRISRaw}, nil
}

func gatewayCheckStatus(orderID string) (string, error) {
	var out struct {
		Status string `json:"status"`
	}
	if err := gatewayDo(http.MethodGet, "/v1/qris/"+url.PathEscape(orderID), nil, &out); err != nil {
		return "", fmt.Errorf("gagal cek transaksi: %w", err)
	}
	return out.Status, nil
}

func gatewayExpire(orderID string) error {
	var out struct {
		Status string `json:"status"`
	}
	if err := gatewayDo(http.MethodPost, "/v1/qris/"+url.PathEscape(orderID)+"/expire", nil, &out); err != nil {
		return fmt.Errorf("gagal menutup QR: %w", err)
	}
	return nil
}
