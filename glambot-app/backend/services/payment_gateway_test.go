package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"photobooth/config"
	"strings"
	"testing"
)

// fakeGateway meniru pay.photorobot.id dan mengarahkan config ke sana.
func fakeGateway(t *testing.T, h http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(h)
	prev := config.App
	config.App = &config.Config{PaymentGatewayURL: srv.URL + "/", PaymentGatewayToken: "tok-rahasia", PaymentExpiryMins: 2}
	t.Cleanup(func() { srv.Close(); config.App = prev })
}

func TestGatewayCreateQRIS(t *testing.T) {
	fakeGateway(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/qris" {
			t.Errorf("request salah: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer tok-rahasia" {
			t.Errorf("Authorization = %q", got)
		}
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		if body["order_id"] != "BOOTH-1a2b3c4d" || body["amount"] != float64(35000) ||
			body["session_id"] != "sess-1" || body["expiry_minutes"] != float64(2) {
			t.Errorf("body salah: %v", body)
		}
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"qris_url":"https://qr/x","qris_raw":"000201"}`))
	})

	res, err := CreateQRISPayment("BOOTH-1a2b3c4d", 35000, "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if res.QRISUrl != "https://qr/x" || res.QRISRaw != "000201" {
		t.Errorf("hasil salah: %+v", res)
	}
}

func TestGatewayCheckStatusAndExpire(t *testing.T) {
	fakeGateway(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /v1/qris/BOOTH-1a2b3c4d":
			w.Write([]byte(`{"status":"paid"}`))
		case "POST /v1/qris/BOOTH-1a2b3c4d/expire":
			w.Write([]byte(`{"status":"expired"}`))
		default:
			t.Errorf("request tak terduga: %s %s", r.Method, r.URL.Path)
		}
	})

	if st, err := CheckPaymentStatus("BOOTH-1a2b3c4d"); err != nil || st != "paid" {
		t.Errorf("status = %q, err = %v", st, err)
	}
	if err := ExpireQRISPayment("BOOTH-1a2b3c4d"); err != nil {
		t.Errorf("expire: %v", err)
	}
}

func TestGatewayErrorCarriesCodeNotToken(t *testing.T) {
	fakeGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"midtrans_error"}`))
	})

	err := ExpireQRISPayment("BOOTH-1a2b3c4d")
	if err == nil || !strings.Contains(err.Error(), "gateway 502: midtrans_error") {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(err.Error(), "tok-rahasia") {
		t.Errorf("token bocor ke pesan error: %v", err)
	}
}
