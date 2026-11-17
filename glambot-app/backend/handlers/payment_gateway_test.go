package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
)

// fakePayGateway meniru pay.photorobot.id: order disimpan di memori dan bisa
// ditandai lunas lewat pay(), seperti /mock/pay di mock gateway.
type fakePayGateway struct {
	mu     sync.Mutex
	orders map[string]string
	srv    *httptest.Server
}

func startFakePayGateway(t *testing.T) *fakePayGateway {
	t.Helper()
	g := &fakePayGateway{orders: map[string]string{}}
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/qris":
			var req struct {
				OrderID string `json:"order_id"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			g.orders[req.OrderID] = "pending"
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"qris_url":"","qris_raw":"QR-` + req.OrderID + `"}`))
		case r.Method == http.MethodGet && len(parts) == 3:
			w.Write([]byte(`{"status":"` + g.orders[parts[2]] + `"}`))
		case r.Method == http.MethodPost && len(parts) == 4 && parts[3] == "expire":
			if g.orders[parts[2]] == "paid" {
				w.WriteHeader(http.StatusBadGateway)
				w.Write([]byte(`{"error":"midtrans_error"}`))
				return
			}
			g.orders[parts[2]] = "expired"
			w.Write([]byte(`{"status":"expired"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(g.srv.Close)
	config.App.PaymentGatewayURL = g.srv.URL
	config.App.PaymentGatewayToken = "tok-rahasia"
	config.App.SessionExpiryHours = 72
	return g
}

func (g *fakePayGateway) pay(orderID string) {
	g.mu.Lock()
	g.orders[orderID] = "paid"
	g.mu.Unlock()
}

func (g *fakePayGateway) status(orderID string) string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.orders[orderID]
}

// openPayment membuat sesi berbayar dan QRIS-nya, mengembalikan sesi & order ID.
func openPayment(t *testing.T) (models.Session, string) {
	t.Helper()
	s := createVipSession(t, 1)
	w := httptest.NewRecorder()
	CreatePayment(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"session_id":"`+s.ID+`"}`)))
	if w.Code != http.StatusCreated {
		t.Fatalf("create payment: %d %s", w.Code, w.Body)
	}
	var res struct {
		Data models.CreatePaymentResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return s, res.Data.Transaction.MidtransOrderID
}

func txAndSessionStatus(t *testing.T, orderID string) (tx, session string) {
	t.Helper()
	if err := database.DB.QueryRow(`
		SELECT t.status, s.status FROM transactions t JOIN sessions s ON s.id = t.session_id
		WHERE t.midtrans_order_id = ?`, orderID).Scan(&tx, &session); err != nil {
		t.Fatal(err)
	}
	return
}

func expireSession(t *testing.T, sessionID string) {
	t.Helper()
	if _, err := database.DB.Exec(`UPDATE sessions SET status = 'expired' WHERE id = ?`, sessionID); err != nil {
		t.Fatal(err)
	}
}

func TestCreatePaymentGoesThroughGateway(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	_, orderID := openPayment(t)
	if !strings.HasPrefix(orderID, "BOOTH-") || len(orderID) != len("BOOTH-")+8 {
		t.Errorf("format order ID berubah: %q", orderID)
	}
	if g.status(orderID) != "pending" {
		t.Errorf("order tidak sampai ke gateway: %q", g.status(orderID))
	}
}

func TestLeavingPaymentScreenClosesQR(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	s, orderID := openPayment(t)

	expireSession(t, s.ID)
	expirePendingPayments(s.ID)

	if g.status(orderID) != "expired" {
		t.Errorf("QR di gateway masih %q", g.status(orderID))
	}
	if tx, _ := txAndSessionStatus(t, orderID); tx != "expired" {
		t.Errorf("transaksi = %q, mau expired", tx)
	}
}

func TestPaidAtLastSecondRestoresSessionOnLeave(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	s, orderID := openPayment(t)

	g.pay(orderID)
	expireSession(t, s.ID)
	expirePendingPayments(s.ID)

	if tx, sess := txAndSessionStatus(t, orderID); tx != "paid" || sess != "paid" {
		t.Errorf("transaksi = %q, sesi = %q; mau paid/paid", tx, sess)
	}
}

func TestReconcileFindsPaymentAfterBoothGaveUp(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	s, orderID := openPayment(t)

	expireSession(t, s.ID) // booth menyerah, QR belum sempat ditutup
	g.pay(orderID)
	reconcilePendingPayments()

	if tx, sess := txAndSessionStatus(t, orderID); tx != "paid" || sess != "paid" {
		t.Errorf("transaksi = %q, sesi = %q; mau paid/paid", tx, sess)
	}
}

func TestReconcileMarksExpiredOrders(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	_, orderID := openPayment(t)

	g.mu.Lock()
	g.orders[orderID] = "expired"
	g.mu.Unlock()
	reconcilePendingPayments()

	if tx, _ := txAndSessionStatus(t, orderID); tx != "expired" {
		t.Errorf("transaksi = %q, mau expired", tx)
	}
}

func TestGatewayDownShowsGenericMessage(t *testing.T) {
	isolatedDB(t)
	g := startFakePayGateway(t)
	s := createVipSession(t, 1)
	g.srv.Close()

	w := httptest.NewRecorder()
	CreatePayment(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"session_id":"`+s.ID+`"}`)))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Gagal membuat pembayaran. Coba lagi.") {
		t.Errorf("pesan = %s", body)
	}
	for _, leak := range []string{"127.0.0.1", "gateway", "tok-rahasia"} {
		if strings.Contains(body, leak) {
			t.Errorf("detail %q bocor ke booth: %s", leak, body)
		}
	}
}
