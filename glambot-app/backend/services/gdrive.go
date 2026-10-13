package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"photobooth/config"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

// Google Drive: semua aset sesi masuk satu folder per-sesi yang di-share
// "anyone with link" — link itu yang dipakai QR halaman download (tak
// bergantung LAN). Auth OAuth2 refresh-token (cmd/gdrive-token), scope
// `drive.file` saja.

const (
	driveAPIBase    = "https://www.googleapis.com/drive/v3"
	driveUploadBase = "https://www.googleapis.com/upload/drive/v3"
	driveFolderMIME = "application/vnd.google-apps.folder"
)

// DriveUpload satu file lokal yang akan diunggah, beserta nama tampil di Drive.
type DriveUpload struct {
	LocalPath string // path absolut file di disk
	Name      string // nama file yang tampil di Drive
}

// IsDriveEnabled true kalau kredensial OAuth Drive lengkap di config.
func IsDriveEnabled() bool {
	c := config.App
	return c != nil &&
		c.GoogleClientID != "" &&
		c.GoogleClientSecret != "" &&
		c.GoogleRefreshToken != ""
}

// driveOAuthConfig membangun oauth2.Config untuk endpoint Google. Sengaja tidak
// memakai golang.org/x/oauth2/google supaya dependensi tetap ringan — kita
// hanya butuh token URL Google.
func driveOAuthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     config.App.GoogleClientID,
		ClientSecret: config.App.GoogleClientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://accounts.google.com/o/oauth2/auth",
			TokenURL: "https://oauth2.googleapis.com/token",
		},
		// drive.file: akses hanya ke file yang dibuat aplikasi ini.
		Scopes: []string{"https://www.googleapis.com/auth/drive.file"},
	}
}

// Token source dipakai bersama seluruh proses. Dulu tiap pemanggilan bikin
// client baru → satu penukaran refresh-token per file (bisa 4 sekaligus saat
// finalize). oauth2.Config.TokenSource sudah menyimpan access token sampai
// kedaluwarsa, jadi cukup dibuat sekali: 1 refresh per ~1 jam, bukan per file.
var (
	driveTokenMu      sync.Mutex
	driveTokenSource  oauth2.TokenSource
	driveTokenRefresh string
)

func sharedDriveTokenSource() oauth2.TokenSource {
	driveTokenMu.Lock()
	defer driveTokenMu.Unlock()

	// Rebuild kalau refresh token di config berubah (mis. re-auth admin).
	if driveTokenSource == nil || driveTokenRefresh != config.App.GoogleRefreshToken {
		driveTokenRefresh = config.App.GoogleRefreshToken
		driveTokenSource = driveOAuthConfig().TokenSource(
			context.Background(),
			&oauth2.Token{RefreshToken: driveTokenRefresh},
		)
	}
	return driveTokenSource
}

// driveClient mengembalikan *http.Client yang otomatis me-refresh access token
// dari refresh token (tidak ada access token awal → di-refresh saat dipakai).
func driveClient(ctx context.Context) *http.Client {
	return oauth2.NewClient(ctx, sharedDriveTokenSource())
}

// ─── Retry ───────────────────────────────────────────────────────────────────
// Kegagalan upload Drive di kiosk hampir selalu transient: WiFi venue "kedip"
// sepersekian detik dan koneksi TLS yang sedang mengirim body mati di tengah
// jalan (`unexpected EOF`). Tanpa retry, satu kedipan = file tidak pernah
// sampai ke customer. Dengan retry berjenjang, kedipan itu jadi tidak terasa.

const driveMaxAttempts = 4

var driveRetryBackoff = []time.Duration{time.Second, 3 * time.Second, 8 * time.Second}

// driveAPIError respons non-2xx dari Drive (dibedakan dari error transport
// supaya 4xx yang pasti gagal lagi tidak diulang percuma).
type driveAPIError struct {
	Status     string
	StatusCode int
	Body       string
}

func (e *driveAPIError) Error() string {
	return fmt.Sprintf("drive API %s: %s", e.Status, e.Body)
}

// retryableDriveErr: error transport selalu layak diulang; error dari API hanya
// kalau 408/429/5xx. invalid_grant (refresh token mati) percuma diulang.
func retryableDriveErr(ctx context.Context, err error) bool {
	if err == nil || ctx.Err() != nil {
		return false
	}
	if strings.Contains(err.Error(), "invalid_grant") {
		return false
	}

	var apiErr *driveAPIError
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusRequestTimeout, http.StatusTooManyRequests:
			return true
		}
		return apiErr.StatusCode >= 500
	}
	return true
}

// withDriveRetry menjalankan satu operasi Drive dengan percobaan ulang.
func withDriveRetry(ctx context.Context, label string, fn func() error) error {
	var lastErr error

	for attempt := 1; attempt <= driveMaxAttempts; attempt++ {
		if attempt > 1 {
			wait := driveRetryBackoff[attempt-2]
			log.Printf("🔁 drive %s gagal (percobaan %d/%d), ulang dalam %s: %v",
				label, attempt-1, driveMaxAttempts, wait, lastErr)

			select {
			case <-ctx.Done():
				return lastErr
			case <-time.After(wait):
			}
		}

		err := fn()
		if err == nil {
			if attempt > 1 {
				log.Printf("✅ drive %s berhasil di percobaan ke-%d", label, attempt)
			}
			return nil
		}

		lastErr = err
		if !retryableDriveErr(ctx, err) {
			return err
		}
	}

	return fmt.Errorf("%s gagal setelah %d percobaan: %w", label, driveMaxAttempts, lastErr)
}

// CreateSharedFolder bikin folder per-sesi + share publik, dipanggil sekali
// saat foto pertama masuk. Return folder ID + webViewLink (untuk QR).
func CreateSharedFolder(ctx context.Context, folderName string) (folderID, webViewLink string, err error) {
	if !IsDriveEnabled() {
		return "", "", fmt.Errorf("google drive belum dikonfigurasi")
	}
	client := driveClient(ctx)

	folderID, webViewLink, err = createDriveFolder(ctx, client, folderName, config.App.GoogleDriveFolderID)
	if err != nil {
		return "", "", fmt.Errorf("gagal membuat folder Drive: %w", err)
	}
	// Share folder: anyone with link → reader. File di dalamnya mewarisi izin.
	if err := setAnyoneReader(ctx, client, folderID); err != nil {
		return "", "", fmt.Errorf("gagal share folder Drive: %w", err)
	}
	return folderID, webViewLink, nil
}

// UploadFileToFolder mengunggah SATU file ke folder Drive yang sudah ada.
// Dipakai baik oleh upload per-capture (streaming) maupun finalize (strip/GIF).
func UploadFileToFolder(ctx context.Context, folderID string, f DriveUpload) error {
	if !IsDriveEnabled() {
		return fmt.Errorf("google drive belum dikonfigurasi")
	}
	if folderID == "" {
		return fmt.Errorf("folder ID kosong")
	}
	client := driveClient(ctx)
	_, err := uploadDriveFile(ctx, client, folderID, f)
	return err
}

// createDriveFolder membuat folder. parentID boleh kosong (folder dibuat di
// root My Drive akun).
func createDriveFolder(ctx context.Context, client *http.Client, name, parentID string) (id, webViewLink string, err error) {
	meta := map[string]interface{}{
		"name":     name,
		"mimeType": driveFolderMIME,
	}
	if parentID != "" {
		meta["parents"] = []string{parentID}
	}
	body, _ := json.Marshal(meta)

	url := driveAPIBase + "/files?fields=id,webViewLink&supportsAllDrives=true"

	var out struct {
		ID          string `json:"id"`
		WebViewLink string `json:"webViewLink"`
	}
	err = withDriveRetry(ctx, "buat folder", func() error {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		return doDriveJSON(client, req, &out)
	})
	if err != nil {
		return "", "", err
	}
	return out.ID, out.WebViewLink, nil
}

// setAnyoneReader memberi izin baca publik (anyone with link) ke sebuah file/
// folder Drive.
func setAnyoneReader(ctx context.Context, client *http.Client, fileID string) error {
	body, _ := json.Marshal(map[string]string{
		"role": "reader",
		"type": "anyone",
	})
	url := fmt.Sprintf("%s/files/%s/permissions?supportsAllDrives=true", driveAPIBase, fileID)

	return withDriveRetry(ctx, "share folder", func() error {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		return doDriveJSON(client, req, nil)
	})
}

// uploadDriveFile mengunggah satu file lokal ke folder Drive via multipart
// upload (metadata + konten dalam satu request). Body dibaca dari disk SEKALI
// lalu dipakai ulang tiap percobaan — selain hemat I/O, ini juga bikin retry
// mengirim isi yang persis sama walau file di disk sempat ditulis ulang
// (mis. GIF di-regenerate saat HP customer minta versi baru).
func uploadDriveFile(ctx context.Context, client *http.Client, parentID string, f DriveUpload) (string, error) {
	body, boundary, err := buildDriveMultipart(parentID, f)
	if err != nil {
		return "", err
	}

	url := driveUploadBase + "/files?uploadType=multipart&fields=id&supportsAllDrives=true"

	var out struct {
		ID string `json:"id"`
	}
	err = withDriveRetry(ctx, "upload "+f.Name, func() error {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "multipart/related; boundary="+boundary)
		return doDriveJSON(client, req, &out)
	})
	if err != nil {
		return "", err
	}
	return out.ID, nil
}

// buildDriveMultipart merakit body multipart/related (metadata JSON + isi file).
func buildDriveMultipart(parentID string, f DriveUpload) (body []byte, boundary string, err error) {
	src, err := os.Open(f.LocalPath)
	if err != nil {
		return nil, "", err
	}
	defer src.Close()

	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(f.Name)))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Part 1: metadata JSON.
	metaHeader := textproto.MIMEHeader{}
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := mw.CreatePart(metaHeader)
	if err != nil {
		return nil, "", err
	}
	meta := map[string]interface{}{
		"name":    f.Name,
		"parents": []string{parentID},
	}
	if err := json.NewEncoder(metaPart).Encode(meta); err != nil {
		return nil, "", err
	}

	// Part 2: konten file.
	contentHeader := textproto.MIMEHeader{}
	contentHeader.Set("Content-Type", mimeType)
	contentPart, err := mw.CreatePart(contentHeader)
	if err != nil {
		return nil, "", err
	}
	if _, err := io.Copy(contentPart, src); err != nil {
		return nil, "", err
	}
	if err := mw.Close(); err != nil {
		return nil, "", err
	}

	return buf.Bytes(), mw.Boundary(), nil
}

// DriveFileInfo keterangan ringkas satu file yang sudah ada di folder Drive.
type DriveFileInfo struct {
	ID   string
	Size int64
}

// ListFolderFiles isi folder sesi, dipetakan per nama file. Drive mengizinkan
// nama duplikat dalam satu folder, jadi upload ulang (retry job, atau finalize
// yang jalan lagi setelah backend restart) butuh daftar ini supaya tidak bikin
// "strip.jpg" dua biji di folder yang sama. Ukuran ikut dibawa untuk
// membedakan "sudah ada & sama" dari "ada tapi versi lama".
func ListFolderFiles(ctx context.Context, folderID string) (map[string]DriveFileInfo, error) {
	if !IsDriveEnabled() {
		return nil, fmt.Errorf("google drive belum dikonfigurasi")
	}
	if folderID == "" {
		return nil, fmt.Errorf("folder ID kosong")
	}
	client := driveClient(ctx)

	type listPage struct {
		NextPageToken string `json:"nextPageToken"`
		Files         []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Size string `json:"size"` // Drive mengirim int64 sebagai string
		} `json:"files"`
	}

	found := make(map[string]DriveFileInfo)
	pageToken := ""

	// Batas halaman sekadar jaring pengaman — folder sesi isinya belasan file.
	for page := 0; page < 10; page++ {
		q := url.Values{}
		q.Set("q", fmt.Sprintf("'%s' in parents and trashed = false", folderID))
		q.Set("fields", "nextPageToken,files(id,name,size)")
		q.Set("pageSize", "200")
		q.Set("supportsAllDrives", "true")
		q.Set("includeItemsFromAllDrives", "true")
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		reqURL := driveAPIBase + "/files?" + q.Encode()

		var out listPage
		if err := withDriveRetry(ctx, "list folder", func() error {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
			if err != nil {
				return err
			}
			out = listPage{}
			return doDriveJSON(client, req, &out)
		}); err != nil {
			return nil, err
		}

		for _, file := range out.Files {
			size, _ := strconv.ParseInt(file.Size, 10, 64)
			found[file.Name] = DriveFileInfo{ID: file.ID, Size: size}
		}
		if out.NextPageToken == "" {
			break
		}
		pageToken = out.NextPageToken
	}

	return found, nil
}

// ─── Penjaga anti-dobel per artefak ──────────────────────────────────────────
// Satu artefak sesi (mis. "strip.jpg") bisa dipicu dari dua jalur: upload awal
// begitu strip jadi, dan finalize/retry job setelahnya. Guard ini memastikan
// yang kedua menunggu yang pertama selesai lalu tinggal skip — bukan mengirim
// file yang sama untuk kedua kalinya.

type driveArtifactGuard struct {
	mu   sync.Mutex
	sent bool
}

var driveArtifactGuards sync.Map // "sessionID|nama" → *driveArtifactGuard

// UploadArtifactOnce mengunggah satu artefak sesi paling banyak sekali.
// `existing` (boleh nil) = isi folder Drive dari ListFolderFiles. Nil error
// berarti artefak dipastikan ada di Drive dalam versi terbaru.
func UploadArtifactOnce(ctx context.Context, sessionID, folderID string, f DriveUpload, existing map[string]DriveFileInfo) error {
	guardAny, _ := driveArtifactGuards.LoadOrStore(
		sessionID+"|"+f.Name, &driveArtifactGuard{},
	)
	guard := guardAny.(*driveArtifactGuard)

	guard.mu.Lock()
	defer guard.mu.Unlock()

	if guard.sent {
		return nil
	}

	if info, ok := existing[f.Name]; ok {
		if size := localFileSize(f.LocalPath); size > 0 && size == info.Size {
			// Sudah ada dan isinya sama — tak perlu dikirim ulang.
			guard.sent = true
			return nil
		}
		// Nama sama tapi ukuran beda = versi lama (mis. customer compose ulang,
		// atau upload sebelumnya terpotong). Buang dulu supaya folder tidak
		// berisi dua file bernama sama dan customer tak salah ambil.
		if info.ID != "" {
			if err := deleteDriveItem(ctx, info.ID); err != nil {
				log.Printf("⚠️  drive hapus versi lama %s gagal: %v", f.Name, err)
			}
		}
	}

	if err := UploadFileToFolder(ctx, folderID, f); err != nil {
		return err
	}
	guard.sent = true
	return nil
}

func localFileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// ForgetDriveSession melepas guard artefak milik satu sesi (dipanggil saat
// cleanup) supaya peta tidak bertumbuh terus.
func ForgetDriveSession(sessionID string) {
	prefix := sessionID + "|"
	driveArtifactGuards.Range(func(key, _ interface{}) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			driveArtifactGuards.Delete(k)
		}
		return true
	})
}

// doDriveJSON menjalankan request, memeriksa status, dan men-decode body JSON
// ke `out` (boleh nil kalau respons tidak dipakai).
func doDriveJSON(client *http.Client, req *http.Request, out interface{}) error {
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &driveAPIError{
			Status:     resp.Status,
			StatusCode: resp.StatusCode,
			Body:       strings.TrimSpace(string(data)),
		}
	}
	if out == nil {
		return nil
	}
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// DeleteDriveFolder menghapus folder sesi (beserta isinya) dari Drive. Dipakai
// saat cleanup sesi expired supaya storage Drive tidak menumpuk. Folder yang
// sudah tidak ada (404) dianggap sukses — idempoten terhadap cleanup berulang.
func DeleteDriveFolder(ctx context.Context, folderID string) error {
	return deleteDriveItem(ctx, folderID)
}

// deleteDriveItem menghapus file ATAU folder — Drive memakai endpoint yang sama
// untuk keduanya.
func deleteDriveItem(ctx context.Context, fileID string) error {
	if !IsDriveEnabled() {
		return fmt.Errorf("google drive belum dikonfigurasi")
	}
	if fileID == "" {
		return fmt.Errorf("file ID kosong")
	}

	client := driveClient(ctx)
	url := fmt.Sprintf("%s/files/%s?supportsAllDrives=true", driveAPIBase, fileID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 404: folder sudah tidak ada → anggap sukses agar idempoten.
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return fmt.Errorf("drive API %s: %s", resp.Status, strings.TrimSpace(string(data)))
	}
	return nil
}

// DriveContext mengembalikan context dengan timeout wajar untuk operasi upload
// (beberapa file beberapa MB). Cukup longgar supaya satu ronde retry penuh
// (jeda 1s + 3s + 8s per file) tetap muat, bukan keburu ke-cancel di tengah.
func DriveContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Minute)
}
