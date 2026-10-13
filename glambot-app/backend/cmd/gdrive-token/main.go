// Command gdrive-token: ambil OAuth2 refresh token Google Drive, jalankan sekali
// dari folder backend (`go run ./cmd/gdrive-token`). Prasyarat di Cloud Console:
// OAuth Client ID "Web application", redirect URI http://localhost:8090/callback,
// GOOGLE_CLIENT_ID/SECRET terisi di .env, akun ditambahkan sebagai Test user.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"photobooth/config"

	"golang.org/x/oauth2"
)

const redirectURL = "http://localhost:8090/callback"

func main() {
	config.Load()

	if config.App.GoogleClientID == "" || config.App.GoogleClientSecret == "" {
		fmt.Println("❌ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diisi di backend/.env")
		os.Exit(1)
	}

	conf := &oauth2.Config{
		ClientID:     config.App.GoogleClientID,
		ClientSecret: config.App.GoogleClientSecret,
		RedirectURL:  redirectURL,
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://accounts.google.com/o/oauth2/auth",
			TokenURL: "https://oauth2.googleapis.com/token",
		},
		Scopes: []string{"https://www.googleapis.com/auth/drive.file"},
	}

	// AccessTypeOffline + prompt=consent WAJIB supaya Google mengembalikan
	// refresh token (kalau tidak, hanya access token sekali pakai).
	authURL := conf.AuthCodeURL("glambot-state",
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
	)

	codeCh := make(chan string, 1)
	srv := &http.Server{Addr: ":8090"}
	http.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "tidak ada code di callback", http.StatusBadRequest)
			return
		}
		fmt.Fprintln(w, "✅ Berhasil! Kembali ke terminal — jendela ini boleh ditutup.")
		codeCh <- code
	})

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("❌ Gagal jalankan server callback: %v\n", err)
			os.Exit(1)
		}
	}()

	fmt.Println("──────────────────────────────────────────────────────────")
	fmt.Println("Buka URL berikut di browser, login, lalu setujui akses:")
	fmt.Println()
	fmt.Println(authURL)
	fmt.Println()
	fmt.Println("Menunggu consent di " + redirectURL + " ...")
	fmt.Println("──────────────────────────────────────────────────────────")

	var code string
	select {
	case code = <-codeCh:
	case <-time.After(5 * time.Minute):
		fmt.Println("❌ Timeout menunggu consent (5 menit).")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tok, err := conf.Exchange(ctx, code)
	if err != nil {
		fmt.Printf("❌ Gagal menukar code jadi token: %v\n", err)
		os.Exit(1)
	}
	if tok.RefreshToken == "" {
		fmt.Println("❌ Tidak ada refresh token di respons. Pastikan kamu memakai")
		fmt.Println("   prompt=consent dan akun belum pernah meng-grant sebelumnya")
		fmt.Println("   (cabut akses lama di https://myaccount.google.com/permissions).")
		os.Exit(1)
	}

	_ = srv.Shutdown(ctx)

	fmt.Println()
	fmt.Println("✅ Selesai! Tempel baris ini ke backend/.env :")
	fmt.Println()
	fmt.Printf("GOOGLE_REFRESH_TOKEN=%s\n", tok.RefreshToken)
	fmt.Println()
}
