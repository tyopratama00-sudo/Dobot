package database

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Setiap mp3 bawaan booth punya baris master script (booth / unused), tanpa ID ganda.
func TestAudioSeedsCoverBoothFiles(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "..", "..", "frontend", "apps", "booth", "public", "audio")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, s := range audioSeeds() {
		if seen[s.id] {
			t.Errorf("duplicate seed %s", s.id)
		}
		seen[s.id] = true
	}
	for _, e := range entries {
		if id, ok := strings.CutSuffix(e.Name(), ".mp3"); ok && !seen[id] {
			t.Errorf("%s.mp3 has no audio seed", id)
		}
	}
}
