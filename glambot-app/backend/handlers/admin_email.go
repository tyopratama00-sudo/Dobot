package handlers

import (
	"context"
	"encoding/json"
	"html"
	"log"
	"net/http"
	"strings"
	"time"

	"photobooth/mailer"
	"photobooth/models"
)

// AdminEmailStatus GET /api/admin/email — apakah akun Gmail booth sudah diatur
// dan alamat pengirimnya. App Password tidak pernah dikirim.
func AdminEmailStatus(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"configured": mailer.Configured(),
		"sender":     mailer.SenderAddress(),
	})
}

// AdminSendTestEmail POST /api/admin/email/test {to} — kirim email uji singkat
// supaya admin bisa memastikan setelan Gmail jalan. Gagal kirim = 502 berisi
// teks error dari server SMTP.
func AdminSendTestEmail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		To string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	to := strings.TrimSpace(body.To)
	if !mailer.ValidAddress(to) {
		respondError(w, http.StatusBadRequest, "Alamat email tidak valid")
		return
	}
	m := mailer.Current()
	if m == nil {
		respondError(w, http.StatusConflict, "Email belum diatur: isi SMTP_USER dan SMTP_APP_PASSWORD di .env backend lalu restart")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	sender := mailer.SenderAddress()
	err := m.Send(ctx, mailer.Message{
		To:      mailer.Address{Email: to},
		Subject: "Email uji Glambot Photo Booth",
		Text: "Halo,\n\nIni email uji dari booth. Kalau email ini sampai, pengiriman email dari " +
			sender + " sudah berfungsi.\n",
		HTML: "<p>Halo,</p><p>Ini email uji dari booth. Kalau email ini sampai, pengiriman email dari <b>" +
			html.EscapeString(sender) + "</b> sudah berfungsi.</p>",
	})
	if err != nil {
		log.Printf("[email] test ke %s gagal: %v", to, err)
		respondError(w, http.StatusBadGateway, "Gagal mengirim email: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{"to": to}))
}
