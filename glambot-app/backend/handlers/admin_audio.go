package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"photobooth/config"
	"photobooth/database"

	"github.com/go-chi/chi/v5"
)

var audioIDRe = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)

const maxAudioBytes = 10 << 20

type audioScript struct {
	ID            string  `json:"id"`
	Tab           string  `json:"tab"`
	Sort          int     `json:"sort"`
	Trigger       string  `json:"trigger"`
	Script        string  `json:"script"`
	Tone          string  `json:"tone"`
	ScreenSeconds float64 `json:"screenSeconds"`
	Source        string  `json:"source"`
	// Uploaded = ada storage/audio/booth/<id>.mp3 (dipakai booth lebih dulu).
	Uploaded   bool   `json:"uploaded"`
	UploadURL  string `json:"uploadUrl,omitempty"`
	HasDefault bool   `json:"hasDefault"`
	DefaultURL string `json:"defaultUrl,omitempty"`
}

func uploadedAudioPath(id string) string {
	return filepath.Join(config.App.StoragePath, "audio", "booth", id+".mp3")
}

// ponytail: audio bawaan dicari di source booth (cwd = backend/ atau root repo).
// Tambah env AUDIO_DEFAULT_DIR kalau booth dideploy terpisah dari repo.
func defaultAudioPath(id string) string {
	for _, dir := range []string{"../frontend/apps/booth/public/audio", "frontend/apps/booth/public/audio"} {
		if p := filepath.Join(dir, id+".mp3"); fileExists(p) {
			return p
		}
	}
	return ""
}

// GET /api/admin/audio
func AdminListAudio(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`SELECT id, tab, sort, trigger_desc, script, tone, screen_seconds, source
		FROM audio_scripts ORDER BY sort, id`)
	if err != nil {
		respondInternal(w, "list audio", err)
		return
	}
	defer rows.Close()
	list := []audioScript{}
	for rows.Next() {
		var a audioScript
		if err := rows.Scan(&a.ID, &a.Tab, &a.Sort, &a.Trigger, &a.Script, &a.Tone, &a.ScreenSeconds, &a.Source); err != nil {
			respondInternal(w, "scan audio", err)
			return
		}
		if st, err := os.Stat(uploadedAudioPath(a.ID)); err == nil {
			a.Uploaded = true
			a.UploadURL = "/storage/audio/booth/" + a.ID + ".mp3?v=" + st.ModTime().Format("20060102150405")
		}
		if defaultAudioPath(a.ID) != "" {
			a.HasDefault = true
			a.DefaultURL = "/api/audio/default/" + a.ID + ".mp3"
		}
		list = append(list, a)
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": list, "tabs": database.AudioTabs})
}

// POST /api/admin/audio {id, tab} — baris baru buatan admin (hanya naskah
// sampai ada pemicu di kode booth).
func AdminCreateAudio(w http.ResponseWriter, r *http.Request) {
	var body struct{ ID, Tab string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	body.ID = strings.ToLower(strings.TrimSpace(body.ID))
	if !audioIDRe.MatchString(body.ID) {
		respondError(w, http.StatusBadRequest, "ID hanya huruf kecil, angka, dan _ (maks 40)")
		return
	}
	if !validAudioTab(body.Tab) || body.Tab == "unused" {
		respondError(w, http.StatusBadRequest, "Tab tidak dikenal")
		return
	}
	res, err := database.DB.Exec(`INSERT INTO audio_scripts (id, tab, sort, source)
		VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM audio_scripts), 'admin')
		ON CONFLICT (id) DO NOTHING`, body.ID, body.Tab)
	if err != nil {
		respondInternal(w, "create audio", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		respondError(w, http.StatusConflict, "ID audio sudah ada")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"success": true})
}

func validAudioTab(t string) bool {
	for _, x := range database.AudioTabs {
		if x == t {
			return true
		}
	}
	return false
}

// PATCH /api/admin/audio/{id} — naskah, nada, pemicu, durasi layar. ID & tab
// tetap (mengikuti kode booth).
func AdminUpdateAudio(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Script        *string  `json:"script"`
		Tone          *string  `json:"tone"`
		Trigger       *string  `json:"trigger"`
		ScreenSeconds *float64 `json:"screenSeconds"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Body tidak valid")
		return
	}
	if body.ScreenSeconds != nil && (*body.ScreenSeconds < 0 || *body.ScreenSeconds > 600) {
		respondError(w, http.StatusBadRequest, "Durasi layar 0–600 detik")
		return
	}
	res, err := database.DB.Exec(`UPDATE audio_scripts SET
		script = COALESCE(?, script), tone = COALESCE(?, tone),
		trigger_desc = COALESCE(?, trigger_desc), screen_seconds = COALESCE(?, screen_seconds),
		updated_at = NOW() WHERE id = ?`,
		body.Script, body.Tone, body.Trigger, body.ScreenSeconds, chi.URLParam(r, "id"))
	if err != nil {
		respondInternal(w, "update audio", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		respondError(w, http.StatusNotFound, "Audio tidak ditemukan")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// DELETE /api/admin/audio/{id} — hanya baris buatan admin; clip booth dipakai kode.
func AdminDeleteAudio(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	res, err := database.DB.Exec(`DELETE FROM audio_scripts WHERE id = ? AND source = 'admin'`, id)
	if err != nil {
		respondInternal(w, "delete audio", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		respondError(w, http.StatusBadRequest, "Hanya audio buatan admin yang bisa dihapus")
		return
	}
	_ = os.Remove(uploadedAudioPath(id))
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

func audioExists(id string) bool {
	var n int
	return database.DB.QueryRow(`SELECT COUNT(*) FROM audio_scripts WHERE id = ?`, id).Scan(&n) == nil && n > 0
}

// POST /api/admin/audio/{id}/file (multipart "file") → storage/audio/booth/<id>.mp3.
func AdminUploadAudio(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !audioIDRe.MatchString(id) || !audioExists(id) {
		respondError(w, http.StatusNotFound, "Audio tidak ditemukan")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAudioBytes+(1<<20))
	file, _, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File mp3 wajib (maks 10 MB)")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxAudioBytes+1))
	if err != nil || len(data) > maxAudioBytes {
		respondError(w, http.StatusBadRequest, "File terlalu besar (maks 10 MB)")
		return
	}
	if !isMP3(data) {
		respondError(w, http.StatusBadRequest, "File bukan mp3")
		return
	}
	dest := uploadedAudioPath(id)
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		respondInternal(w, "mkdir audio", err)
		return
	}
	// Tulis ke file sementara lalu rename: booth tidak pernah memutar file setengah jadi.
	tmp := dest + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		respondInternal(w, "write audio", err)
		return
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		respondInternal(w, "rename audio", err)
		return
	}
	database.DB.Exec(`UPDATE audio_scripts SET updated_at = NOW() WHERE id = ?`, id)
	respondJSON(w, http.StatusOK, map[string]any{"success": true, "updatedAt": time.Now().Format(time.RFC3339)})
}

// mp3 = tag ID3 atau frame sync MPEG audio.
func isMP3(b []byte) bool {
	return bytes.HasPrefix(b, []byte("ID3")) || (len(b) > 1 && b[0] == 0xFF && b[1]&0xE0 == 0xE0)
}

// DELETE /api/admin/audio/{id}/file — lepas upload; booth kembali ke audio bawaan.
func AdminDetachAudio(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !audioIDRe.MatchString(id) {
		respondError(w, http.StatusNotFound, "Audio tidak ditemukan")
		return
	}
	if err := os.Remove(uploadedAudioPath(id)); err != nil && !os.IsNotExist(err) {
		respondInternal(w, "detach audio", err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// GET /api/audio — publik: {id: versi} audio upload admin. Booth memutar
// /storage/audio/booth/<id>.mp3?v=<versi> untuk id ini, sisanya audio bawaan.
func GetUploadedAudio(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{}
	entries, _ := os.ReadDir(filepath.Join(config.App.StoragePath, "audio", "booth"))
	for _, e := range entries {
		id, ok := strings.CutSuffix(e.Name(), ".mp3")
		if !ok || !audioIDRe.MatchString(id) {
			continue
		}
		if info, err := e.Info(); err == nil {
			out[id] = info.ModTime().Format("20060102150405")
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	respondJSON(w, http.StatusOK, out)
}

// GET /api/audio/scripts — script text for isolated booth preview; no session/device calls.
func GetAudioPreviewScripts(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`SELECT id, tab, script, tone, screen_seconds FROM audio_scripts ORDER BY sort, id`)
	if err != nil {
		respondInternal(w, "list preview scripts", err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, tab, script, tone string
		var seconds float64
		if err := rows.Scan(&id, &tab, &script, &tone, &seconds); err != nil {
			respondInternal(w, "scan preview script", err)
			return
		}
		_, uploadedErr := os.Stat(uploadedAudioPath(id))
		list = append(list, map[string]any{"id": id, "tab": tab, "script": script, "tone": tone, "screenSeconds": seconds, "uploaded": uploadedErr == nil, "hasDefault": defaultAudioPath(id) != ""})
	}
	respondJSON(w, http.StatusOK, list)
}

// GET /api/audio/default/{id}.mp3 — audio bawaan booth (publik, sama dengan public/audio booth).
func GetDefaultAudio(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSuffix(chi.URLParam(r, "file"), ".mp3")
	p := ""
	if audioIDRe.MatchString(id) {
		p = defaultAudioPath(id)
	}
	if p == "" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, p)
}
