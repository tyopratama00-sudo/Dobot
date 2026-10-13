package handlers

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"photobooth/config"

	"github.com/google/uuid"
)

// ─── Pagination ──────────────────────────────────────────────────────────────

// adminMeta cocok dengan PaginationMeta di frontend (perhatikan lastPage camelCase).
type adminMeta struct {
	Total    int `json:"total"`
	Page     int `json:"page"`
	LastPage int `json:"lastPage"`
}

// adminListResponse adalah amplop list admin: { data, meta } (tanpa wrapper success).
type adminListResponse struct {
	Data any       `json:"data"`
	Meta adminMeta `json:"meta"`
}

// parsePaging membaca query ?page=&limit= dengan default page=1, limit=10 (maks 100).
func parsePaging(r *http.Request) (page, limit, offset int) {
	page = atoiDefault(r.URL.Query().Get("page"), 1)
	if page < 1 {
		page = 1
	}
	limit = atoiDefault(r.URL.Query().Get("limit"), 10)
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	offset = (page - 1) * limit
	return
}

func buildMeta(total, page, limit int) adminMeta {
	last := 1
	if limit > 0 {
		last = (total + limit - 1) / limit
	}
	if last < 1 {
		last = 1
	}
	return adminMeta{Total: total, Page: page, LastPage: last}
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// queryParam mengembalikan nilai query, treating "all"/"" sebagai kosong.
func queryParam(r *http.Request, key string) string {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "all" {
		return ""
	}
	return v
}

// sortDir menormalkan ?sortOrder= ke "ASC"/"DESC" (default DESC).
func sortDir(r *http.Request) string {
	if strings.EqualFold(r.URL.Query().Get("sortOrder"), "asc") {
		return "ASC"
	}
	return "DESC"
}

// ─── Upload file ─────────────────────────────────────────────────────────────

// saveUpload menyimpan file dari multipart ke storage/<subdir> dan mengembalikan
// path publik relatif (mis. "/storage/frames/<uuid>.png") + ukuran byte.
func saveUpload(file multipart.File, header *multipart.FileHeader, subdir string) (publicPath string, size int64, err error) {
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".png"
	}
	name := uuid.NewString() + ext

	destDir := filepath.Join(config.App.StoragePath, subdir)
	if err = os.MkdirAll(destDir, 0755); err != nil {
		return "", 0, err
	}

	destPath := filepath.Join(destDir, name)
	out, err := os.Create(destPath)
	if err != nil {
		return "", 0, err
	}
	defer out.Close()

	size, err = io.Copy(out, file)
	if err != nil {
		return "", 0, err
	}

	return "/storage/" + subdir + "/" + name, size, nil
}

// humanSize memformat byte jadi string ringkas, mis. "1.2 MB".
func humanSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGT"[exp])
}

// boolToInt mengonversi bool ke 0/1 untuk kolom integer Postgres.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
