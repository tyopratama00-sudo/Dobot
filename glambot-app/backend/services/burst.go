package services

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"sort"
	"sync"
	"time"
)

// Burst capture: simpan liveview frames selama countdown 3 detik ke
// burst/pending/, lalu pindahkan ke burst/{photoID}/ setelah foto terjepret.
// Dipakai GIF #2 supaya ada motion sebelum shutter.

const (
	// Sengaja sedikit lebih banyak dari 10 fps × 3s biar buffer kalau ada
	// frame yang gagal di-decode (HTML error dll. — sudah difilter di
	// digiCamReadFirstAvailable). Hasil akhir GIF tetap 8-10 fps.
	burstDefaultInterval = 280 * time.Millisecond
	burstDefaultDuration = 3 * time.Second
	burstMaxFrames       = 12
)

// burstSessions melindungi per-session state burst capture.
var (
	burstMu       sync.Mutex
	burstSessions = map[string]*burstState{}
)

type burstState struct {
	mu       sync.Mutex
	pending  string // path absolut ke folder pending
	active   bool
}

func getBurstState(sessionID string) *burstState {
	burstMu.Lock()
	defer burstMu.Unlock()
	s, ok := burstSessions[sessionID]
	if !ok {
		s = &burstState{}
		burstSessions[sessionID] = s
	}
	return s
}

func burstSessionDir(sessionID string) string {
	return filepath.Join(config.App.StoragePath, "sessions", sessionID, "burst")
}

// BurstFramesDir path folder yang menampung burst frames untuk satu photo.
func BurstFramesDir(sessionID, photoID string) string {
	return filepath.Join(burstSessionDir(sessionID), photoID)
}

// StartBurstCapture spawn goroutine yang capture liveview frame Canon berkala
// selama countdown, untuk animated-strip GIF.
func StartBurstCapture(sessionID string) {
	if sessionID == "" {
		return
	}

	state := getBurstState(sessionID)
	state.mu.Lock()
	if state.active {
		state.mu.Unlock()
		log.Printf("ℹ️  burst: sudah aktif untuk session %s, skip", sessionID)
		return
	}
	state.active = true
	pending := filepath.Join(burstSessionDir(sessionID), "pending")
	state.pending = pending
	state.mu.Unlock()

	go func() {
		defer func() {
			// Recover dari panic apapun (mis. nil deref di driver kamera).
			// Tanpa recover, panic di goroutine akan crash seluruh process.
			if rec := recover(); rec != nil {
				log.Printf("⚠️  burst: panic recovered (session %s): %v", sessionID, rec)
			}
			state.mu.Lock()
			state.active = false
			state.mu.Unlock()
		}()

		// Bersihkan pending dir sebelum mulai (kalau ada sisa dari capture
		// sebelumnya yang gagal di-promote).
		_ = os.RemoveAll(pending)
		if err := os.MkdirAll(pending, 0755); err != nil {
			log.Printf("⚠️  burst: mkdir %s: %v", pending, err)
			return
		}

		deadline := time.Now().Add(burstDefaultDuration)
		ticker := time.NewTicker(burstDefaultInterval)
		defer ticker.Stop()

		// Capture frame pertama segera (jangan tunggu tick pertama).
		writeBurstFrame(pending, 0)

		for i := 1; i < burstMaxFrames; i++ {
			<-ticker.C
			if time.Now().After(deadline) {
				return
			}
			writeBurstFrame(pending, i)
		}
	}()
}

func writeBurstFrame(dir string, idx int) {
	// Potong tunggu liveview di 2× interval burst supaya satu frame lambat
	// tidak nahan loop; goroutine dalamnya selesai sendiri via timeout HTTP.
	type result struct {
		data []byte
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		f, err := GetLiveViewFrame()
		ch <- result{data: f, err: err}
	}()

	var res result
	select {
	case res = <-ch:
	case <-time.After(burstDefaultInterval * 2):
		// Frame lambat — skip, loop lanjut.
		return
	}

	if res.err != nil || !isJPEG(res.data) {
		return
	}
	name := fmt.Sprintf("frame_%03d.jpg", idx)
	out := filepath.Join(dir, name)
	if err := os.WriteFile(out, res.data, 0644); err != nil {
		log.Printf("⚠️  burst: write %s: %v", out, err)
	}
}

// PromoteBurstToPhoto memindahkan isi pending/ ke burst/{photoID}/.
// Dipanggil setelah photo final tersimpan dan kita tahu ID-nya.
// Idempotent: kalau pending kosong, no-op.
func PromoteBurstToPhoto(sessionID, photoID string) {
	if sessionID == "" || photoID == "" {
		return
	}
	state := getBurstState(sessionID)
	state.mu.Lock()
	// Tunggu goroutine capture selesai (paling lama ~3 detik) supaya kita
	// tidak ketinggalan frame yang masih di-tulis.
	deadline := time.Now().Add(4 * time.Second)
	for state.active && time.Now().Before(deadline) {
		state.mu.Unlock()
		time.Sleep(100 * time.Millisecond)
		state.mu.Lock()
	}
	pending := state.pending
	state.pending = ""
	state.mu.Unlock()

	if pending == "" {
		return
	}
	if _, err := os.Stat(pending); err != nil {
		return
	}

	dst := BurstFramesDir(sessionID, photoID)
	// Kalau dst sudah ada (mis. retry), bersihkan dulu.
	_ = os.RemoveAll(dst)
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		log.Printf("⚠️  burst: mkdir parent for %s: %v", dst, err)
		return
	}
	if err := os.Rename(pending, dst); err != nil {
		log.Printf("⚠️  burst: rename %s → %s: %v", pending, dst, err)
		return
	}
	log.Printf("📸 burst: promoted frames untuk photo %s", photoID)
}

// ForgetBurstSession membuang burst state sesi (dipanggil setelah compose
// berhasil) supaya peta di memori tidak menumpuk.
func ForgetBurstSession(sessionID string) {
	if sessionID == "" {
		return
	}
	burstMu.Lock()
	delete(burstSessions, sessionID)
	burstMu.Unlock()
}

// ListBurstFrames balik daftar path absolut burst frames untuk satu photo,
// urut sesuai nama file (frame_000, frame_001, dst). Empty kalau tidak ada.
func ListBurstFrames(sessionID, photoID string) []string {
	if sessionID == "" || photoID == "" {
		return nil
	}
	dir := BurstFramesDir(sessionID, photoID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if filepath.Ext(name) != ".jpg" {
			continue
		}
		out = append(out, filepath.Join(dir, name))
	}
	sort.Strings(out)
	return out
}
