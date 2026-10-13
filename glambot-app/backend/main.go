package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"photobooth/config"
	"photobooth/database"
	"photobooth/handlers"
	"photobooth/routes"
	"photobooth/services"
	"syscall"
	"time"
)

func main() {
	// ─── 1. Load config dari .env ─────────────────────────────────────────────
	config.Load()
	log.Printf("🚀 Starting Photobooth API [%s]", config.App.AppEnv)

	// ─── 2. Pastikan folder storage ada ──────────────────────────────────────
	dirs := []string{
		config.App.StoragePath,
		config.App.StoragePath + "/frames",
		config.App.StoragePath + "/sessions",
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("❌ Gagal membuat direktori %s: %v", dir, err)
		}
	}
	log.Printf("📁 Storage path: %s", config.App.StoragePath)

	// ─── 3. Init PostgreSQL database ──────────────────────────────────────────
	if err := database.Init(config.App.DatabaseURL); err != nil {
		log.Fatalf("❌ Gagal init database: %v", err)
	}
	defer database.Close()

	// Seed akun admin default kalau tabel admins masih kosong
	handlers.EnsureDefaultAdmin()

	// ─── 4. Init Midtrans ─────────────────────────────────────────────────────
	if config.App.MidtransServerKey == "" {
		log.Println("⚠️  MIDTRANS_SERVER_KEY belum diset, fitur pembayaran tidak aktif")
	} else {
		services.InitMidtrans()
		log.Printf("💳 Midtrans aktif [%s]", config.App.MidtransEnv)
	}

	// ─── 4.5. Init Camera System (Canon via digiCamControl) ──────────────────
	if status, _ := services.CheckCamera(); status.Connected {
		log.Printf("📷 Camera: %s", status.CameraName)
	} else {
		log.Printf("⚠️  Canon camera tidak terdeteksi (cek digiCamControl)")
	}

	// ─── 5. Jalankan job background (cleanup + penyusul upload Drive) ─────────
	services.StartCleanupJob()
	handlers.StartDriveRetryJob()

	// ─── 6. Setup router ──────────────────────────────────────────────────────
	handler := routes.Setup(config.App.StoragePath)

	// ─── 7. Buat HTTP server ──────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + config.App.AppPort,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ─── 8. Jalankan server di goroutine ─────────────────────────────────────
	go func() {
		log.Printf("✅ Server berjalan di http://localhost:%s", config.App.AppPort)
		log.Printf("📡 Webhook URL: http://localhost:%s/api/payment/webhook", config.App.AppPort)
		log.Println("─────────────────────────────────────────")
		log.Println("  GET  /health")
		log.Println("  GET  /api/package")
		log.Println("  POST /api/session")
		log.Println("  GET  /api/session/{sessionID}")
		log.Println("  POST /api/payment/create")
		log.Println("  GET  /api/payment/status/{orderID}")
		log.Println("  POST /api/payment/webhook")
		log.Println("  POST /api/voucher/apply")
		log.Println("  POST /api/voucher/remove")
		log.Println("  GET  /api/frames")
		log.Println("  POST /api/photo/upload")
		log.Println("  POST /api/photo/compose")
		log.Println("  GET  /api/photo/session/{sessionID}")
		log.Println("  GET  /api/photo/session/{sessionID}/framed")
		log.Println("  GET  /api/photo/download/{photoID}")
		log.Println("─────────────────────────────────────────")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Server error: %v", err)
		}
	}()

	// ─── 9. Graceful shutdown ─────────────────────────────────────────────────
	// Tunggu sinyal OS (Ctrl+C atau kill)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("⏳ Mematikan server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("❌ Gagal shutdown: %v", err)
	}

	log.Println("✅ Server berhenti dengan bersih")
}
