package handlers

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"photobooth/database"
	"photobooth/services"
	"sync"
)

// Upload hasil sesi ke Cloudflare R2 (lewat layanan pay.photorobot.id). Titik
// upload-nya sama dengan Drive (drive.go); selama R2 aktif, upload Drive tidak
// dijalankan (lihat driveUploadsActive).

// backgroundUploads melacak kerja latar belakang hasil sesi (upload R2, GIF +
// finalisasi setelah compose). Dipakai tes untuk menunggu sampai semuanya
// selesai sebelum database ditutup.
var backgroundUploads sync.WaitGroup

// goBackground menjalankan fn di latar belakang dan mencatatnya di
// backgroundUploads.
func goBackground(fn func()) {
	backgroundUploads.Add(1)
	go func() {
		defer backgroundUploads.Done()
		fn()
	}()
}

// r2SessionLocks satu mutex per sesi: upload strip & Halaman Hasil dari compose
// yang beruntun (compose ulang) dijalankan bergiliran, supaya versi lama tidak
// mendarat terakhir dan menimpa versi baru.
var r2SessionLocks sync.Map

func lockR2Session(sessionID string) func() {
	m, _ := r2SessionLocks.LoadOrStore(sessionID, &sync.Mutex{})
	mu := m.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

// stripObjectName nama strip di folder sesi R2, mis. "strip.jpg".
func stripObjectName(ext string) string { return "strip" + ext }

// rawPhotoObject satu foto raw sesi beserta nama objeknya di R2.
type rawPhotoObject struct {
	ID       string
	RelPath  string
	Name     string // "foto-N.<ext>", N urut capture mulai 1
	Uploaded bool
}

// sessionRawPhotoObjects foto raw sesi urut capture. Urutan diikat id saat
// created_at kembar (jam Windows kasar), jadi setiap foto selalu mendapat N
// yang sama dan berbeda dari foto lain, baik saat upload maupun di Halaman Hasil.
func sessionRawPhotoObjects(sessionID string) ([]rawPhotoObject, error) {
	rows, err := database.DB.Query(`
		SELECT id, file_path, r2_uploaded FROM photos
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC, id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []rawPhotoObject
	for rows.Next() {
		var p rawPhotoObject
		if err := rows.Scan(&p.ID, &p.RelPath, &p.Uploaded); err != nil {
			return nil, err
		}
		p.Name = fmt.Sprintf("foto-%d%s", len(out)+1, filepath.Ext(p.RelPath))
		out = append(out, p)
	}
	return out, rows.Err()
}

// EnqueueRawPhotoUploadR2 mengunggah satu foto raw ke R2 secara non-blocking,
// segera setelah foto di-capture. No-op kalau R2 tidak aktif.
func EnqueueRawPhotoUploadR2(sessionID, photoID, absPath string) {
	if !services.IsR2Enabled() || sessionID == "" || photoID == "" {
		return
	}
	goBackground(func() { uploadRawPhotoToR2(sessionID, photoID, absPath) })
}

func uploadRawPhotoToR2(sessionID, photoID, absPath string) {
	if !fileExists(absPath) {
		return
	}
	photos, err := sessionRawPhotoObjects(sessionID)
	if err != nil {
		log.Printf("⚠️  r2 daftar foto gagal (%s): %v — akan dicoba lagi saat finalize", sessionID, err)
		return
	}
	var name string
	for _, p := range photos {
		if p.ID == photoID {
			name = p.Name
		}
	}
	if name == "" {
		return
	}

	ctx, cancel := services.R2Context()
	defer cancel()
	if _, err := services.UploadToR2(ctx, services.R2Key(sessionID, name), absPath, services.R2ContentType(name)); err != nil {
		log.Printf("⚠️  r2 upload foto gagal (%s, %s): %v — akan dicoba lagi saat finalize", sessionID, name, err)
		return
	}
	if _, err := database.DB.Exec(`UPDATE photos SET r2_uploaded = TRUE WHERE id = ?`, photoID); err != nil {
		log.Printf("⚠️  gagal tandai r2_uploaded (%s): %v", photoID, err)
	}
	log.Printf("☁️  r2 %s terkirim (%s)", name, sessionID)
}

// EnqueueFramedStripUploadR2 mengirim strip ke R2 segera setelah compose,
// lalu Halaman Hasil versi awal, lalu menyimpan link-nya: sejak itu QR booth
// siap, tanpa menunggu GIF.
func EnqueueFramedStripUploadR2(sessionID string) {
	if !services.IsR2Enabled() || sessionID == "" {
		return
	}
	goBackground(func() {
		unlock := lockR2Session(sessionID)
		defer unlock()

		// Strip terbaru dibaca ulang di dalam kunci: kalau sesi di-compose
		// ulang, putaran mana pun yang jalan terakhir mengunggah versi terbaru.
		rel, err := latestFramedStripRelPath(sessionID)
		if err != nil {
			return
		}
		abs, ok := safeStoragePath(rel)
		if !ok || !fileExists(abs) {
			return
		}

		ctx, cancel := services.R2Context()
		defer cancel()

		name := stripObjectName(filepath.Ext(abs))
		if _, err := services.UploadToR2(ctx, services.R2Key(sessionID, name), abs, services.R2ContentType(name)); err != nil {
			log.Printf("⚠️  r2 upload strip gagal (%s): %v — akan dicoba lagi saat finalize", sessionID, err)
			return
		}
		url, err := uploadResultPage(ctx, sessionID)
		if err != nil {
			log.Printf("⚠️  r2 halaman hasil gagal (%s): %v — akan dicoba lagi saat finalize", sessionID, err)
			return
		}
		if _, err := database.DB.Exec(`UPDATE sessions SET r2_url = ? WHERE id = ?`, url, sessionID); err != nil {
			log.Printf("⚠️  gagal simpan r2_url (%s): %v", sessionID, err)
			return
		}
		log.Printf("☁️  r2 strip + halaman hasil terkirim (%s)", sessionID)
	})
}

// uploadResultPage menyusun Halaman Hasil dari file sesi yang sudah ada di R2
// lalu mengunggahnya, dan mengembalikan URL publiknya.
func uploadResultPage(ctx context.Context, sessionID string) (string, error) {
	p, err := resultPageFor(sessionID)
	if err != nil {
		return "", err
	}
	page, err := renderResultPage(p)
	if err != nil {
		return "", err
	}
	return services.UploadBytesToR2(ctx, services.R2Key(sessionID, "index.html"), page, services.R2HTMLContentType)
}

// resultPageFor isi Halaman Hasil: strip terbaru dan foto raw yang sudah
// terunggah ke R2 (foto yang belum terunggah tidak dicantumkan supaya tidak
// ada tombol yang mengarah ke file yang belum ada).
func resultPageFor(sessionID string) (resultPage, error) {
	p := resultPage{BoothName: emailFotoBoothName(), GIFPending: true}
	if rel, err := latestFramedStripRelPath(sessionID); err == nil {
		p.Strip = stripObjectName(filepath.Ext(rel))
	}
	photos, err := sessionRawPhotoObjects(sessionID)
	if err != nil {
		return p, err
	}
	for _, ph := range photos {
		if ph.Uploaded {
			p.Photos = append(p.Photos, ph.Name)
		}
	}
	return p, nil
}

// sessionResultLink link Halaman Hasil sesi: halaman R2 kalau sesi punya,
// kalau tidak folder Drive-nya, kalau tidak ada keduanya kosong. Ditentukan
// per sesi, bukan dari konfigurasi yang sedang aktif, supaya sesi yang selesai
// sebelum R2 dinyalakan tetap memakai link Drive-nya.
func sessionResultLink(sessionID string) string {
	var r2, drive string
	_ = database.DB.QueryRow(`SELECT r2_url, drive_url FROM sessions WHERE id = ?`, sessionID).Scan(&r2, &drive)
	if r2 != "" {
		return r2
	}
	return drive
}
