package services

import (
	"context"
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"time"
)

// StartCleanupJob jalankan goroutine cleanup otomatis setiap N jam
func StartCleanupJob() {
	interval := time.Duration(config.App.CleanupIntervalHours) * time.Hour
	log.Printf("🧹 Cleanup job aktif (interval: setiap %d jam)", config.App.CleanupIntervalHours)

	go func() {
		// Jalankan sekali saat pertama kali start
		runCleanup()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			runCleanup()
		}
	}()
}

func runCleanup() {
	log.Println("🧹 Menjalankan cleanup sesi yang sudah expired...")

	// Tandai pending transactions milik sesi yang sudah expired sebagai 'expired'
	// sebelum cleanup per-sesi, supaya status transaksi konsisten dengan sesi
	// (tidak tersisa sebagai 'pending' untuk sesi yang sudah ditinggalkan).
	if _, err := database.DB.Exec(`
		UPDATE transactions SET status = 'expired'
		WHERE status = 'pending'
		AND session_id IN (
			SELECT id FROM sessions
			WHERE expires_at < NOW() AND status != 'expired'
		)
	`); err != nil {
		log.Printf("⚠️ Gagal expire transaksi pending untuk sesi expired: %v", err)
	}

	rows, err := database.DB.Query(`
		SELECT id FROM sessions
		WHERE expires_at < NOW()
		AND status != 'expired'
	`)
	if err != nil {
		log.Printf("❌ Cleanup query gagal: %v", err)
		return
	}
	defer rows.Close()

	var expiredIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			log.Printf("❌ Cleanup scan gagal: %v", err)
			return
		}
		expiredIDs = append(expiredIDs, id)
	}

	if err := rows.Err(); err != nil {
		log.Printf("❌ Cleanup rows error: %v", err)
		return
	}

	if len(expiredIDs) == 0 {
		log.Println("✅ Tidak ada sesi expired")
		return
	}

	deleted := 0
	for _, sessionID := range expiredIDs {
		if err := cleanupSession(sessionID); err != nil {
			log.Printf("❌ Gagal hapus sesi %s: %v", sessionID, err)
			continue
		}
		deleted++
	}

	log.Printf("✅ Cleanup selesai: %d sesi dihapus", deleted)
}

func cleanupSession(sessionID string) error {
	// Ambil folder Drive (kalau ada) sebelum menyentuh disk/DB, supaya kita tahu
	// folder mana yang harus dihapus dari storage Drive.
	var driveFolderID string
	if err := database.DB.QueryRow(
		`SELECT drive_folder_id FROM sessions WHERE id = ?`, sessionID,
	).Scan(&driveFolderID); err != nil && err != sql.ErrNoRows {
		log.Printf("⚠️ Gagal baca drive_folder_id sesi %s: %v", sessionID, err)
	}

	// Hapus semua file foto dari disk
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID)
	if err := os.RemoveAll(sessionDir); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Hapus folder sesi di Google Drive. Kegagalan tidak membatalkan cleanup
	// (file lokal & DB tetap dibersihkan) — hanya di-log; folder Drive yatim
	// bisa dihapus manual bila perlu.
	if driveFolderID != "" && IsDriveEnabled() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := DeleteDriveFolder(ctx, driveFolderID); err != nil {
			log.Printf("⚠️ Gagal hapus folder Drive sesi %s (%s): %v", sessionID, driveFolderID, err)
		} else {
			log.Printf("🗑️  Folder Drive sesi %s dihapus (%s)", sessionID, driveFolderID)
		}
		cancel()
	}

	// Bersihkan DB dalam satu transaksi. `transactions` & `sessions` SENGAJA
	// tidak dihapus (catatan keuangan; sesi cuma ditandai 'expired'). Yang
	// dihapus hanya `photos` (file sudah dibuang di atas) dan `voucher_usage`
	// — tak memengaruhi nominal, dan bikin voucher tetap bisa dihapus admin.
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM voucher_usage WHERE session_id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM photos WHERE session_id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`UPDATE sessions SET status = 'expired' WHERE id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Commit(); err != nil {
		tx.Rollback()
		return err
	}

	// Lepaskan state in-memory (mutex GIF, status burst) supaya peta-peta
	// di package services tidak terus bertumbuh seiring waktu.
	ForgetGifSession(sessionID)
	ForgetBurstSession(sessionID)
	ForgetDriveSession(sessionID)

	log.Printf("🗑️  Sesi %s berhasil dihapus", sessionID)
	return nil
}
