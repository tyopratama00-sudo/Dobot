package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"photobooth/services"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// POST /api/photo/upload
func UploadPhoto(w http.ResponseWriter, r *http.Request) {
	// Hard cap ukuran request 15MB (cegah upload raksasa mengisi disk/RAM).
	// ParseMultipartForm(10MB) hanya batas memori; sisanya spill ke temp tanpa
	// MaxBytesReader. Dengan ini total body dibatasi tegas.
	r.Body = http.MaxBytesReader(w, r.Body, 15<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "File terlalu besar atau form tidak valid")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sessionID := r.FormValue("session_id")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	if session.Status != models.StatusPaid && session.Status != models.StatusShooting {
		respondError(w, http.StatusForbidden, "Sesi belum dibayar atau tidak dalam status foto")
		return
	}

	// Update status ke shooting kalau masih paid
	if session.Status == models.StatusPaid {
		if _, err := database.DB.Exec(`UPDATE sessions SET status = 'shooting' WHERE id = ?`, sessionID); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui status sesi")
			return
		}
	}

	// Ambil file dari form
	file, header, err := r.FormFile("photo")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File foto wajib disertakan")
		return
	}
	defer file.Close()

	// Validasi ekstensi
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		respondError(w, http.StatusBadRequest, "Hanya file JPG dan PNG yang diizinkan")
		return
	}

	// Buat folder sesi kalau belum ada
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "raw")
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat direktori penyimpanan")
		return
	}

	// Generate nama file unik
	photoID := uuid.New().String()
	fileName := fmt.Sprintf("%s%s", photoID, ext)
	filePath := filepath.Join(sessionDir, fileName)

	// Simpan file ke disk
	dst, err := os.Create(filePath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan foto")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menulis foto")
		return
	}

	// Simpan metadata ke DB (pakai relative path)
	dbPath := fmt.Sprintf("sessions/%s/raw/%s", sessionID, fileName)
	_, err = database.DB.Exec(`
		INSERT INTO photos 
			(id, session_id, file_path, file_name, type, selected, created_at)
		VALUES 
			(?, ?, ?, ?, 'raw', 0, ?)`,
		photoID, sessionID, dbPath, fileName, time.Now().UTC(),
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan metadata foto")
		return
	}

	// Streaming ke Drive: kirim foto ini segera (non-blocking), sama seperti
	// jalur auto-capture robot — tidak menunggu akhir sesi.
	EnqueueRawPhotoUpload(sessionID, photoID, filePath)

	photo := models.Photo{
		ID:        photoID,
		SessionID: sessionID,
		FilePath:  dbPath,
		FileName:  fileName,
		Type:      models.PhotoRaw,
		Selected:  false,
		CreatedAt: time.Now(),
		URL:       fmt.Sprintf("/storage/sessions/%s/raw/%s", sessionID, fileName),
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(photo))
}

// GET /api/photo/session/{sessionID}
// Ambil semua foto raw milik sesi ini
func GetSessionPhotos(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	rows, err := database.DB.Query(`
		SELECT 
			id, session_id, file_path, file_name, type,
			selected, COALESCE(position, 0), created_at
		FROM photos 
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC`, sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengambil foto")
		return
	}
	defer rows.Close()

	var photos []models.Photo
	for rows.Next() {
		var p models.Photo
		var selectedInt int
		var pos int

		if err := rows.Scan(
			&p.ID, &p.SessionID, &p.FilePath, &p.FileName,
			&p.Type, &selectedInt, &pos, &p.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca data foto")
			return
		}

		p.Selected = selectedInt == 1
		if pos > 0 {
			p.Position = &pos
		}
		p.URL = "/storage/" + p.FilePath
		photos = append(photos, p)
	}

	if photos == nil {
		photos = []models.Photo{}
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membaca daftar foto")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(photos))
}

// GET /api/frames
// List semua frame aktif dari DB (dengan slot data)
func GetFrames(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, name, COALESCE(category, ''), file_path, thumb_url, photo_slots, canvas_width, canvas_height, slots
		FROM frames
		WHERE is_active = 1
		ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load frames")
		return
	}
	defer rows.Close()

	frames := make([]models.Frame, 0)
	for rows.Next() {
		var f models.Frame
		var slotsBytes []byte
		if err := rows.Scan(
			&f.ID, &f.Name, &f.Category, &f.FilePath, &f.ThumbURL,
			&f.PhotoSlots, &f.CanvasWidth, &f.CanvasHeight, &slotsBytes,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to read frames")
			return
		}
		if len(slotsBytes) > 0 {
			// Pastikan tiap slot punya id unik — frame lama tersimpan tanpa id,
			// yang membuat editor publik menumpuk semua slot jadi satu.
			norm, _ := ensureSlotIDs(slotsBytes)
			f.Slots = norm
		} else {
			f.Slots = []byte("[]")
		}
		frames = append(frames, f)
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to read frames")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(frames))
}

// POST /api/photo/compose — simpan JPEG hasil export canvas frontend (field
// "image") ke storage + DB. Tidak di-render ulang server-side karena posisi
// slot dinamis per-frame.
func ComposeFrame(w http.ResponseWriter, r *http.Request) {
	// Max 20MB per file (canvas export bisa besar)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Gagal membaca form compose")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	sessionID := firstNonEmpty(r.FormValue("sessionId"), r.FormValue("session_id"))
	frameID := firstNonEmpty(r.FormValue("frameId"), r.FormValue("frame_id"))
	photoIDsJSON := firstNonEmpty(r.FormValue("photoIds"), r.FormValue("photo_ids"))
	// Filter strip: untuk hasil akhir memang sudah baked-in di canvas export
	// frontend, TAPI burst GIF live disimpan mentah → filter disimpan agar
	// generator GIF bisa menerapkan filter yang sama (lihat ApplyStripFilter).
	stripFilter := firstNonEmpty(r.FormValue("filter"), r.FormValue("strip_filter"))
	if !services.StripFilters[stripFilter] {
		stripFilter = "original"
	}
	// Zoom/rotate/geser per slot dari photo editor (urut slot, sejajar photoIds).
	// Sama seperti filter: hasil akhir sudah baked-in di canvas export, tapi burst
	// GIF live mentah → generator butuh angkanya untuk membingkai burst sama.
	slotTransformsJSON := firstNonEmpty(
		r.FormValue("slotTransforms"), r.FormValue("slot_transforms"),
	)

	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}
	if frameID == "" {
		respondError(w, http.StatusBadRequest, "frame_id wajib diisi")
		return
	}

	var photoIDs []string
	if photoIDsJSON != "" {
		if err := json.Unmarshal([]byte(photoIDsJSON), &photoIDs); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid photo_ids format")
			return
		}
	}

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	allowedStatus := session.Status == models.StatusShooting ||
		session.Status == models.StatusPaid ||
		session.Status == models.StatusCompleted
	if !allowedStatus {
		respondError(w, http.StatusBadRequest, "Status sesi tidak valid untuk compose")
		return
	}

	// Validasi tiap photo_id memang milik sesi ini
	for _, photoID := range photoIDs {
		var count int
		if err := database.DB.QueryRow(
			`SELECT COUNT(*) FROM photos WHERE id = ? AND session_id = ?`,
			photoID, sessionID,
		).Scan(&count); err != nil || count == 0 {
			respondError(w, http.StatusBadRequest,
				fmt.Sprintf("Foto %s tidak ditemukan", photoID))
			return
		}
	}

	// Ambil file image hasil canvas export dari frontend
	file, header, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File komposisi (image) wajib disertakan")
		return
	}
	defer file.Close()

	// Tentukan ekstensi dari header file (default .jpg)
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		ext = ".jpg"
	}

	// Buat folder framed
	framedDir := filepath.Join(config.App.StoragePath, "sessions", sessionID, "framed")
	if err := os.MkdirAll(framedDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat direktori hasil")
		return
	}

	resultID := uuid.New().String()
	framedFileName := fmt.Sprintf("result_%s%s", resultID, ext)
	framedRelPath := fmt.Sprintf("sessions/%s/framed/%s", sessionID, framedFileName)
	framedFullPath := filepath.Join(config.App.StoragePath, framedRelPath)

	dst, err := os.Create(framedFullPath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat file hasil")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menulis file hasil")
		return
	}
	// Tutup sekarang (defer di atas tinggal jadi jaring pengaman) supaya file
	// benar-benar utuh sebelum ada yang membacanya untuk diunggah ke Drive.
	dst.Close()

	// Tandai foto yang dipilih (kalau ada)
	if len(photoIDs) > 0 {
		if err := updateSelectedPhotos(sessionID, photoIDs); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan pilihan foto")
			return
		}
	}

	// photoIds urut slot (boleh duplikat) disimpan apa adanya — sumber kebenaran
	// slot→foto untuk GIF live supaya burst tidak bergeser slot.
	slotPhotoIDsJSON, _ := json.Marshal(photoIDs)

	// Transform per slot hanya berguna kalau jumlahnya sama dengan jumlah slot
	// (generator memetakannya lewat index). Panjang beda = klien lama atau
	// payload rusak → simpan kosong, generator fallback ke cover-fit polos.
	// Sengaja tidak menolak request: strip fisik & foto customer lebih penting
	// daripada animasi GIF yang framing-nya kurang pas.
	if parsed := services.ParseSlotTransformsJSON(slotTransformsJSON); len(parsed) != len(photoIDs) {
		if slotTransformsJSON != "" {
			log.Printf("ℹ️  compose %s: slot_transforms (%d) tidak match jumlah slot (%d) — diabaikan",
				sessionID, len(parsed), len(photoIDs))
		}
		slotTransformsJSON = ""
	}

	// Update sesi: frame_id + filter strip + assignment slot + status completed.
	// completed_at diisi di sini (sebelumnya kolomnya tidak pernah ditulis).
	if _, err := database.DB.Exec(
		// drive_synced di-reset: strip & GIF versi baru belum tentu sudah naik ke
		// Drive, jadi sesi ini harus kembali masuk radar retry job sampai lengkap.
		`UPDATE sessions SET frame_id = ?, strip_filter = ?, slot_photo_ids = ?, slot_transforms = ?, status = 'completed', completed_at = NOW(), drive_synced = FALSE WHERE id = ?`,
		frameID, stripFilter, string(slotPhotoIDsJSON), slotTransformsJSON, sessionID,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memperbarui sesi")
		return
	}

	// Simpan metadata framed ke DB
	if _, err := database.DB.Exec(`
		INSERT INTO photos (id, session_id, file_path, file_name, type, selected, created_at)
		VALUES (?, ?, ?, ?, 'framed', 1, ?)`,
		resultID, sessionID, framedRelPath, framedFileName, time.Now().UTC(),
	); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan metadata hasil")
		return
	}

	// Compose (ulang) berarti strip & GIF sesi ini punya versi baru — lepas
	// penanda "sudah dikirim" dari compose sebelumnya supaya yang naik ke Drive
	// adalah versi terbaru, bukan versi lama yang terlanjur dianggap beres.
	services.ForgetDriveSession(sessionID)

	// Strip framed = artefak yang paling dicari customer. Kirim ke Drive
	// sekarang juga (non-blocking), tidak usah antre di belakang encoding GIF
	// di bawah. Finalize memakai nama file yang sama, jadi tidak akan dobel.
	EnqueueFramedStripUpload(sessionID, framedFullPath)

	// Pre-generate kedua varian GIF di background supaya saat user buka
	// halaman download di HP, file sudah siap (tidak perlu wait beberapa
	// detik di first hit).
	//
	// Keduanya jalan PARALEL: artefaknya beda file dan sejak lock-nya dipecah
	// per-artefak tidak lagi saling menunggu. Ini penting karena layar QR
	// menahan loading sampai GIF live selesai — dulu ia harus menunggu
	// slideshow kelar dulu padahal tidak memerlukannya sama sekali.
	go func(sid string) {
		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			if opts, err := collectLiveStripSources(sid); err != nil {
				log.Printf("ℹ️  gif-live pre-generate skip (%s): %v", sid, err)
			} else if _, err := services.GenerateLiveStripGIF(opts); err != nil {
				log.Printf("⚠️  gif-live pre-generate failed (%s): %v", sid, err)
			}
		}()

		go func() {
			defer wg.Done()
			if opts, err := collectAnimationSources(sid); err != nil {
				log.Printf("⚠️  gif pre-generate skip (%s): %v", sid, err)
			} else if _, err := services.GenerateSessionGIF(opts); err != nil {
				log.Printf("⚠️  gif pre-generate failed (%s): %v", sid, err)
			}
		}()

		wg.Wait()

		// Setelah strip + GIF siap, upload semua aset sesi ke Google Drive
		// supaya QR di halaman download bisa mengarah ke folder publik (no-op
		// kalau Drive belum dikonfigurasi).
		UploadSessionToDrive(sid)
	}(sessionID)

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"result_id":     resultID,
		"download_url":  fmt.Sprintf("/api/photo/download/%s", resultID),
		"preview_url":   fmt.Sprintf("/storage/%s", framedRelPath),
		"gif_url":       fmt.Sprintf("/api/photo/session/%s/gif", sessionID),
		"gif_live_url":  fmt.Sprintf("/api/photo/session/%s/gif-live", sessionID),
		"status":        "composed",
		"message":       "Strip foto berhasil disimpan",
	}))
}

type printCompositionRequest struct {
	SessionID string `json:"session_id"`
}

// latestFramedStripRelPath = relative path strip framed TERBARU sesi, error
// kalau compose belum jalan. Dipakai bersama PrintComposition,
// collectLiveStripSources, dan collectFinalDriveFiles.
func latestFramedStripRelPath(sessionID string) (string, error) {
	var rel string
	if err := database.DB.QueryRow(`
		SELECT file_path FROM photos
		WHERE session_id = ? AND type = 'framed'
		ORDER BY created_at DESC LIMIT 1`, sessionID,
	).Scan(&rel); err != nil {
		return "", err
	}
	if rel == "" {
		return "", fmt.Errorf("framed strip belum ada")
	}
	return rel, nil
}

func PrintComposition(w http.ResponseWriter, r *http.Request) {
	var req printCompositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib diisi")
		return
	}

	// Ambil strip framed terbaru untuk sesi ini.
	relPath, err := latestFramedStripRelPath(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Strip foto belum tersedia untuk sesi ini")
		return
	}

	// Jumlah salinan = print_count sesi (default 1 kalau tak terbaca).
	copies := 1
	var pc int
	if err := database.DB.QueryRow(
		`SELECT print_count FROM sessions WHERE id = ?`, sessionID,
	).Scan(&pc); err == nil && pc > 0 {
		copies = pc
	}

	fullPath := filepath.Join(config.App.StoragePath, relPath)
	if err := services.PrintFile(fullPath, copies); err != nil {
		respondError(w, http.StatusServiceUnavailable, fmt.Sprintf("Gagal mencetak: %v", err))
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"status":  "printing",
		"copies":  copies,
		"message": fmt.Sprintf("Mengirim %d salinan ke printer", copies),
	}))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// GET /api/photo/download/{photoID}
// Download foto tunggal (raw maupun framed)
func DownloadPhoto(w http.ResponseWriter, r *http.Request) {
	photoID := chi.URLParam(r, "photoID")

	var filePath, fileName string
	err := database.DB.QueryRow(`
		SELECT file_path, file_name FROM photos WHERE id = ?`, photoID,
	).Scan(&filePath, &fileName)

	if err != nil {
		respondError(w, http.StatusNotFound, "Foto tidak ditemukan")
		return
	}

	fullPath, ok := safeStoragePath(filePath)
	if !ok {
		respondError(w, http.StatusForbidden, "Path foto tidak valid")
		return
	}
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		respondError(w, http.StatusNotFound, "File foto tidak ditemukan di storage")
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(fileName)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	http.ServeFile(w, r, fullPath)
}

// GET /api/photo/session/{sessionID}/gif — generate/ambil cache animated GIF
// (foto raw terpilih, loop) di storage/sessions/{id}/animation.gif.
func DownloadSessionGIF(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib")
		return
	}

	opts, err := collectAnimationSources(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	gifPath, err := services.GenerateSessionGIF(opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError,
			fmt.Sprintf("Gagal generate GIF: %v", err))
		return
	}

	if _, err := os.Stat(gifPath); err != nil {
		respondError(w, http.StatusInternalServerError, "GIF tidak ditemukan setelah generate")
		return
	}

	serveGIFFile(w, r, gifPath, fmt.Sprintf("photobooth_%s.gif", sessionID))
}

// serveGIFFile serve file GIF dengan disposition yang tepat. Default
// "attachment" (force download); kalau ?inline=1 → "inline" supaya bisa
// dipakai sebagai <img src> untuk preview di halaman.
func serveGIFFile(w http.ResponseWriter, r *http.Request, gifPath, downloadName string) {
	inline := r.URL.Query().Get("inline") == "1"
	if inline {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, downloadName))
		// Cache pendek di browser — file di-update setiap session compose
		// ulang, tapi dalam sesi yang sama isinya stabil.
		w.Header().Set("Cache-Control", "public, max-age=60")
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, downloadName))
	}
	w.Header().Set("Content-Type", "image/gif")
	http.ServeFile(w, r, gifPath)
}

// collectAnimationSources kumpulkan path foto raw (urut posisi terpilih, atau
// created_at untuk sesi Digital) sebagai frame GIF #1 — murni rotasi foto raw,
// tanpa framed strip.
func collectAnimationSources(sessionID string) (services.GenerateAnimationOptions, error) {
	opts := services.GenerateAnimationOptions{SessionID: sessionID}

	// Path raw (urut posisi terpilih, fallback semua raw) → konversi ke abs.
	for _, rel := range selectedRawRelPaths(sessionID) {
		if abs, ok := safeStoragePath(rel); ok {
			opts.SelectedRawPaths = append(opts.SelectedRawPaths, abs)
		}
	}

	if len(opts.SelectedRawPaths) == 0 {
		return opts, fmt.Errorf("session %s tidak punya foto", sessionID)
	}
	return opts, nil
}

// selectedRawRelPaths = path foto raw TERPILIH (urut posisi), atau semua raw
// kalau tidak ada yang selected. Dipakai generator GIF.
func selectedRawRelPaths(sessionID string) []string {
	var paths []string

	rows, err := database.DB.Query(`
		SELECT file_path FROM photos
		WHERE session_id = ? AND type = 'raw' AND selected = 1
		ORDER BY COALESCE(position, 0) ASC, created_at ASC`, sessionID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var rel string
			if rows.Scan(&rel) == nil {
				paths = append(paths, rel)
			}
		}
	}
	if len(paths) > 0 {
		return paths
	}

	rows2, err := database.DB.Query(`
		SELECT file_path FROM photos
		WHERE session_id = ? AND type = 'raw'
		ORDER BY created_at ASC`, sessionID,
	)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var rel string
			if rows2.Scan(&rel) == nil {
				paths = append(paths, rel)
			}
		}
	}
	return paths
}

// GET /api/photo/session/{sessionID}/gif-live/available — cek ringan GIF #2:
// butuh framed strip + minimal satu foto terpilih yang punya burst frames.
// False (mis. liveview gagal saat countdown) → frontend hide tombolnya.
func GetSessionLiveGIFAvailable(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"available": isLiveGIFAvailable(sessionID),
	}))
}

// isLiveGIFAvailable cek cepat tanpa generate apa-apa: ada framed strip
// & minimal satu foto terpilih dengan burst frames.
func isLiveGIFAvailable(sessionID string) bool {
	if sessionID == "" {
		return false
	}

	// Harus sudah ada framed strip — kalau belum, compose belum jalan.
	var framedCount int
	if err := database.DB.QueryRow(`
		SELECT COUNT(*) FROM photos
		WHERE session_id = ? AND type = 'framed'`, sessionID,
	).Scan(&framedCount); err != nil || framedCount == 0 {
		return false
	}

	rows, err := database.DB.Query(`
		SELECT id FROM photos
		WHERE session_id = ? AND type = 'raw' AND selected = 1`, sessionID,
	)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var photoID string
		if scanErr := rows.Scan(&photoID); scanErr != nil {
			continue
		}
		if len(services.ListBurstFrames(sessionID, photoID)) > 0 {
			return true
		}
	}
	return false
}

// GET /api/photo/session/{sessionID}/gif-live
// Generate (atau ambil cache) animated strip GIF: framed strip + tiap slot
// "hidup" dengan burst liveview frames sebelum settle ke foto final.
func DownloadSessionLiveGIF(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		respondError(w, http.StatusBadRequest, "session_id wajib")
		return
	}

	opts, err := collectLiveStripSources(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	gifPath, err := services.GenerateLiveStripGIF(opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError,
			fmt.Sprintf("Gagal generate live GIF: %v", err))
		return
	}

	if _, err := os.Stat(gifPath); err != nil {
		respondError(w, http.StatusInternalServerError, "GIF tidak ditemukan setelah generate")
		return
	}

	serveGIFFile(w, r, gifPath, fmt.Sprintf("photobooth_live_%s.gif", sessionID))
}

// collectLiveStripSources kumpulkan semua data yang dibutuhkan generator
// GIF #2: framed strip path, slot coords dari frame yang dipilih, daftar
// foto terpilih beserta burst frames-nya (ordered by position).
func collectLiveStripSources(sessionID string) (services.LiveStripOptions, error) {
	opts := services.LiveStripOptions{SessionID: sessionID}

	// Ambil session → frame_id
	session, err := GetSessionByID(sessionID)
	if err != nil {
		return opts, fmt.Errorf("session tidak ditemukan")
	}
	if session.FrameID == "" {
		return opts, fmt.Errorf("session belum memilih frame")
	}

	// Filter strip yang dipilih saat compose — diterapkan ke burst frame supaya
	// animasi GIF konsisten dengan hasil akhir.
	var stripFilter string
	if err := database.DB.QueryRow(
		`SELECT COALESCE(strip_filter, 'original') FROM sessions WHERE id = ?`, sessionID,
	).Scan(&stripFilter); err == nil {
		opts.Filter = stripFilter
	}

	// Frame design: slot coords + canvas dim + file path
	var slotsBytes []byte
	var framePath string
	if err := database.DB.QueryRow(
		`SELECT file_path, canvas_width, canvas_height, slots FROM frames WHERE id = ?`,
		session.FrameID,
	).Scan(&framePath, &opts.CanvasWidth, &opts.CanvasHeight, &slotsBytes); err != nil {
		return opts, fmt.Errorf("frame %s tidak ditemukan", session.FrameID)
	}
	slots, err := services.ParseSlotsJSON(slotsBytes)
	if err != nil {
		return opts, fmt.Errorf("slot JSON invalid: %v", err)
	}
	opts.Slots = slots
	if abs, ok := safeStoragePath(framePath); ok {
		opts.FrameSVGPath = abs
	}

	// Framed strip terbaru
	framedRel, err := latestFramedStripRelPath(sessionID)
	if err != nil {
		return opts, fmt.Errorf("framed strip belum ada — selesaikan compose dulu")
	}
	abs, ok := safeStoragePath(framedRel)
	if !ok {
		return opts, fmt.Errorf("path framed strip invalid")
	}
	opts.FramedImagePath = abs

	// WAJIB pakai slot_photo_ids (satu entri per slot, urut slot): men-derive
	// dari photos.selected/position meng-collapse foto yang dipakai di beberapa
	// slot → jumlah foto < jumlah slot → slot bergeser.
	var slotJSON, transformsJSON string
	_ = database.DB.QueryRow(
		`SELECT COALESCE(slot_photo_ids, ''), COALESCE(slot_transforms, '')
		 FROM sessions WHERE id = ?`, sessionID,
	).Scan(&slotJSON, &transformsJSON)
	var slotPhotoIDs []string
	if slotJSON != "" {
		_ = json.Unmarshal([]byte(slotJSON), &slotPhotoIDs)
	}

	// Zoom/rotate/geser hasil editan user. Hanya dipakai kalau jumlahnya sama
	// dengan jumlah slot frame — kalau tidak (sesi lama, atau frame diganti
	// setelah transform tersimpan), biarkan nil → burst pakai cover-fit polos.
	if tf := services.ParseSlotTransformsJSON(transformsJSON); len(tf) == len(opts.Slots) {
		opts.Transforms = tf
	}

	if len(slotPhotoIDs) == len(opts.Slots) && len(slotPhotoIDs) > 0 {
		for i, photoID := range slotPhotoIDs {
			opts.Photos = append(opts.Photos, services.LiveStripPhoto{
				PhotoID:     photoID,
				Position:    i + 1,
				BurstFrames: services.ListBurstFrames(sessionID, photoID),
			})
		}
		return opts, nil
	}

	// Fallback (sesi lama tanpa slot_photo_ids): pakai foto terpilih urut posisi.
	// Tetap benar untuk kasus 1 foto per slot; hanya kasus reuse yang tak bisa
	// direkonstruksi tanpa slot_photo_ids.
	rows, err := database.DB.Query(`
		SELECT id, COALESCE(position, 0) FROM photos
		WHERE session_id = ? AND type = 'raw' AND selected = 1
		ORDER BY COALESCE(position, 0) ASC, created_at ASC`, sessionID,
	)
	if err != nil {
		return opts, fmt.Errorf("gagal query foto terpilih: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var photoID string
		var pos int
		if err := rows.Scan(&photoID, &pos); err != nil {
			continue
		}
		opts.Photos = append(opts.Photos, services.LiveStripPhoto{
			PhotoID:     photoID,
			Position:    pos,
			BurstFrames: services.ListBurstFrames(sessionID, photoID),
		})
	}

	if len(opts.Photos) == 0 {
		return opts, fmt.Errorf("belum ada foto terpilih")
	}
	return opts, nil
}

// safeStoragePath join relPath ke StoragePath dan pastikan hasilnya masih
// di dalam folder storage (defense-in-depth terhadap path traversal kalau
// file_path di DB ternyata mengandung "..").
func safeStoragePath(relPath string) (string, bool) {
	// file_path di DB campur: seed relatif ("frames/x.svg") vs upload admin
	// ber-prefix "/storage/...". Tanpa di-strip jadi "storage/storage/..." →
	// overlay gagal → burst bocor keluar frame. Samakan ke path relatif.
	relPath = strings.TrimPrefix(relPath, "/")
	relPath = strings.TrimPrefix(relPath, "storage/")

	absStorage, err := filepath.Abs(config.App.StoragePath)
	if err != nil {
		return "", false
	}
	absPath, err := filepath.Abs(filepath.Join(absStorage, relPath))
	if err != nil {
		return "", false
	}
	rel, err := filepath.Rel(absStorage, absPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return absPath, true
}

// GET /api/photo/session/{sessionID}/framed
// Ambil semua foto framed milik sesi
func GetFramedPhotos(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	rows, err := database.DB.Query(`
		SELECT id, session_id, file_path, file_name, type, selected, created_at
		FROM photos 
		WHERE session_id = ? AND type = 'framed'
		ORDER BY created_at DESC`, sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengambil foto")
		return
	}
	defer rows.Close()

	var photos []models.Photo
	for rows.Next() {
		var p models.Photo
		var selectedInt int
		if err := rows.Scan(
			&p.ID, &p.SessionID, &p.FilePath,
			&p.FileName, &p.Type, &selectedInt, &p.CreatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membaca data foto framed")
			return
		}
		p.Selected = selectedInt == 1
		p.URL = "/storage/" + p.FilePath
		p.DownloadURL = fmt.Sprintf("/api/photo/download/%s", p.ID)
		photos = append(photos, p)
	}

	if photos == nil {
		photos = []models.Photo{}
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membaca daftar foto framed")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(photos))
}

// ─── Helper ──────────────────────────────────────────────────────────────────

func updateSelectedPhotos(sessionID string, photoIDs []string) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}

	rollback := true
	defer func() {
		if rollback {
			tx.Rollback()
		}
	}()

	if _, err := tx.Exec(`
		UPDATE photos SET selected = 0, position = NULL
		WHERE session_id = ?`, sessionID,
	); err != nil {
		return err
	}

	for i, photoID := range photoIDs {
		pos := i + 1
		if _, err := tx.Exec(`
			UPDATE photos SET selected = 1, position = ?
			WHERE id = ? AND session_id = ?`,
			pos, photoID, sessionID,
		); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	rollback = false
	return nil
}
