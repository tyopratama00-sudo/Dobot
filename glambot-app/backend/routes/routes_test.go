package routes

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorageHidesDirectoriesButServesFiles(t *testing.T) {
	root := t.TempDir()
	rawDir := filepath.Join(root, "sessions", "abc", "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rawDir, "foto.jpg"), []byte("jpeg"), 0644); err != nil {
		t.Fatal(err)
	}
	h := storageHandler(root)

	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}

	if w := get("/storage/sessions/abc/raw/foto.jpg"); w.Code != http.StatusOK || w.Body.String() != "jpeg" {
		t.Fatalf("file harus tetap tersaji: %d %q", w.Code, w.Body.String())
	}
	for _, path := range []string{
		"/storage/",
		"/storage/sessions",
		"/storage/sessions/",
		"/storage/sessions/abc/",
		"/storage/sessions/./",
	} {
		w := get(path)
		if strings.Contains(w.Body.String(), "abc") || strings.Contains(w.Body.String(), "foto.jpg") {
			t.Errorf("%s membocorkan isi folder: %q", path, w.Body.String())
		}
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: mau 404, dapat %d", path, w.Code)
		}
	}
}
