package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"photobooth/database"
	"photobooth/services"
	"sync"
	"time"
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

	if err := uploadFileToR2(sessionID, name, absPath); err != nil {
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
// siap, tanpa menunggu GIF. Channel yang dikembalikan tertutup setelah selesai
// (langsung, kalau R2 tidak aktif): finalisasi compose yang sama menunggunya,
// supaya Halaman Hasil versi awal tidak pernah menimpa versi akhir.
func EnqueueFramedStripUploadR2(sessionID string) <-chan struct{} {
	done := make(chan struct{})
	if !services.IsR2Enabled() || sessionID == "" {
		close(done)
		return done
	}
	goBackground(func() {
		defer close(done)
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

		name := stripObjectName(filepath.Ext(abs))
		if err := uploadFileToR2(sessionID, name, abs); err != nil {
			log.Printf("⚠️  r2 upload strip gagal (%s): %v — akan dicoba lagi saat finalize", sessionID, err)
			return
		}
		url, err := uploadResultPage(sessionID, gifsStillGenerating)
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
	return done
}

// uploadFileToR2 mengunggah satu file sesi dengan batas waktunya sendiri:
// URL presign hanya berlaku 5 menit sejak dibuat, jadi setiap file meminta
// presign tepat sebelum diunggah dan tidak berbagi tenggat dengan file lain.
func uploadFileToR2(sessionID, name, absPath string) error {
	ctx, cancel := services.R2Context()
	defer cancel()
	_, err := services.UploadToR2(ctx, services.R2Key(sessionID, name), absPath, services.R2ContentType(name))
	return err
}

// gifStatus keadaan GIF sesi yang ditampilkan Halaman Hasil.
type gifStatus struct {
	Uploaded []string // nama GIF yang sudah ada di R2
	Pending  bool     // GIF masih disiapkan: pelanggan diminta memuat ulang
}

// gifsStillGenerating keadaan GIF untuk Halaman Hasil versi awal.
var gifsStillGenerating = gifStatus{Pending: true}

// uploadResultPage menyusun Halaman Hasil dari file sesi yang sudah ada di R2
// lalu mengunggahnya, dan mengembalikan URL publiknya.
func uploadResultPage(sessionID string, gifs gifStatus) (string, error) {
	p, err := resultPageFor(sessionID)
	if err != nil {
		return "", err
	}
	p.GIFs, p.GIFPending = gifs.Uploaded, gifs.Pending
	page, err := renderResultPage(p)
	if err != nil {
		return "", err
	}
	ctx, cancel := services.R2Context()
	defer cancel()
	return services.UploadBytesToR2(ctx, services.R2Key(sessionID, "index.html"), page, services.R2HTMLContentType)
}

// resultPageFor isi Halaman Hasil: strip terbaru dan foto raw yang sudah
// terunggah ke R2 (foto yang belum terunggah tidak dicantumkan supaya tidak
// ada tombol yang mengarah ke file yang belum ada).
func resultPageFor(sessionID string) (resultPage, error) {
	p := resultPage{BoothName: emailFotoBoothName()}
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

// r2GIF satu GIF sesi: file lokal dan nama objeknya di R2.
type r2GIF struct {
	Path string
	Name string
}

// sessionGIFs GIF sesi urut tampil di Halaman Hasil.
func sessionGIFs(sessionID string) []r2GIF {
	return []r2GIF{
		{services.AnimationOutputPath(sessionID), "slideshow.gif"},
		{services.LiveStripOutputPath(sessionID), "live-strip.gif"},
	}
}

// UploadSessionToR2 menyusulkan sesi yang belum lengkap di R2 (dipakai retry
// job): finalisasi untuk compose yang tercatat saat ini.
func UploadSessionToR2(sessionID string) {
	var composedAt sql.NullTime
	if err := database.DB.QueryRow(`SELECT completed_at FROM sessions WHERE id = ?`, sessionID).Scan(&composedAt); err != nil {
		log.Printf("⚠️  r2 baca sesi gagal (%s): %v", sessionID, err)
		return
	}
	finalizeSessionToR2(sessionID, composedAt)
}

// finalizeSessionToR2 FINALIZE untuk compose yang tersimpan pada composedAt:
// dipanggil setelah GIF selesai, dan oleh retry job. Mengirim strip terbaru,
// GIF yang ada, foto raw yang belum terunggah, lalu Halaman Hasil versi akhir.
// Sesi ditandai `r2_synced` hanya kalau semuanya berhasil dan sesi tidak
// di-compose ulang sejak composedAt; selama belum, retry job menyusulkannya.
func finalizeSessionToR2(sessionID string, composedAt sql.NullTime) {
	if !services.IsR2Enabled() || sessionID == "" {
		return
	}
	unlock := lockR2Session(sessionID)
	defer unlock()

	complete := true
	put := func(name, path string) bool {
		if err := uploadFileToR2(sessionID, name, path); err != nil {
			log.Printf("⚠️  r2 finalize %s gagal (%s): %v — retry job akan menyusulkan", name, sessionID, err)
			complete = false
			return false
		}
		return true
	}

	if rel, err := latestFramedStripRelPath(sessionID); err == nil {
		if abs, ok := safeStoragePath(rel); ok && fileExists(abs) {
			put(stripObjectName(filepath.Ext(abs)), abs)
		}
	}

	photos, err := sessionRawPhotoObjects(sessionID)
	if err != nil {
		log.Printf("⚠️  r2 finalize daftar foto gagal (%s): %v", sessionID, err)
		return
	}
	for _, p := range photos {
		if p.Uploaded {
			continue
		}
		abs, ok := safeStoragePath(p.RelPath)
		if !ok || !fileExists(abs) {
			continue
		}
		if put(p.Name, abs) {
			if _, err := database.DB.Exec(`UPDATE photos SET r2_uploaded = TRUE WHERE id = ?`, p.ID); err != nil {
				log.Printf("⚠️  gagal tandai r2_uploaded (%s): %v", p.ID, err)
			}
		}
	}

	// GIF yang tidak ada setelah generator selesai memang tidak akan muncul,
	// jadi halaman akhir tidak lagi menjanjikannya; GIF yang gagal terunggah
	// tetap "sedang disiapkan" sampai retry job berhasil.
	var gifs gifStatus
	for _, gif := range sessionGIFs(sessionID) {
		if !fileExists(gif.Path) {
			continue
		}
		if put(gif.Name, gif.Path) {
			gifs.Uploaded = append(gifs.Uploaded, gif.Name)
		} else {
			gifs.Pending = true
		}
	}

	url, err := uploadResultPage(sessionID, gifs)
	if err != nil {
		log.Printf("⚠️  r2 finalize halaman hasil gagal (%s): %v — retry job akan menyusulkan", sessionID, err)
		return
	}
	if _, err := database.DB.Exec(`UPDATE sessions SET r2_url = ? WHERE id = ?`, url, sessionID); err != nil {
		log.Printf("⚠️  gagal simpan r2_url (%s): %v", sessionID, err)
		return
	}
	if complete {
		markR2Synced(sessionID, composedAt)
	}
}

// markR2Synced menandai sesi lengkap di R2, kecuali sesi di-compose ulang
// sejak composedAt: hasil putaran ini sudah basi dan retry job harus
// mengirim versi barunya.
func markR2Synced(sessionID string, composedAt sql.NullTime) {
	res, err := database.DB.Exec(`
		UPDATE sessions SET r2_synced = TRUE
		WHERE id = ? AND completed_at IS NOT DISTINCT FROM ?`,
		sessionID, composedAt,
	)
	if err != nil {
		log.Printf("⚠️  gagal tandai r2_synced (%s): %v", sessionID, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		log.Printf("ℹ️  r2 %s di-compose ulang selama upload — versi baru disusulkan retry job", sessionID)
		return
	}
	log.Printf("☁️  r2 sesi %s lengkap", sessionID)
}

// ─── Retry job ───────────────────────────────────────────────────────────────
// Menyusulkan sesi yang belum lengkap di R2 (internet venue mati, layanan
// sedang gangguan, backend restart di tengah upload). Nilainya sama dengan
// retry job Drive, tapi sengaja konstanta sendiri supaya mengubah yang satu
// tidak diam-diam mengubah yang lain.

const (
	r2RetryInterval = time.Minute

	// Sesi yang baru selesai dilewati dulu: finalisasi normal biasanya sudah
	// menyelesaikannya sendiri begitu GIF selesai.
	r2RetryMinAge = 90 * time.Second

	// Batas sesi per putaran supaya uplink tidak banjir saat antrean menumpuk.
	r2RetryBatch = 3
)

// StartR2RetryJob menjalankan penyusul upload R2 di background.
func StartR2RetryJob() {
	if !services.IsR2Enabled() {
		log.Println("ℹ️  r2 retry job non-aktif (R2_UPLOAD_ENABLED=false atau gateway kosong)")
		return
	}
	log.Printf("☁️  R2 retry job aktif (cek tiap %s)", r2RetryInterval)
	go func() {
		ticker := time.NewTicker(r2RetryInterval)
		defer ticker.Stop()
		for range ticker.C {
			retryPendingR2Sessions()
		}
	}()
}

// retryPendingR2Sessions mencoba ulang sesi selesai yang belum tersinkron ke R2.
func retryPendingR2Sessions() {
	rows, err := database.DB.Query(fmt.Sprintf(`
		SELECT id FROM sessions
		WHERE status = 'completed'
		  AND r2_synced = FALSE
		  AND expires_at > NOW()
		  AND completed_at IS NOT NULL
		  AND completed_at < NOW() - INTERVAL '%d seconds'
		ORDER BY completed_at DESC
		LIMIT %d`, int(r2RetryMinAge.Seconds()), r2RetryBatch))
	if err != nil {
		log.Printf("⚠️  r2 retry query gagal: %v", err)
		return
	}
	var pending []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			pending = append(pending, id)
		}
	}
	rows.Close()

	if len(pending) == 0 {
		return
	}
	log.Printf("🔁 r2 retry: %d sesi belum lengkap, mencoba ulang", len(pending))
	for _, sessionID := range pending {
		UploadSessionToR2(sessionID)
	}
}
