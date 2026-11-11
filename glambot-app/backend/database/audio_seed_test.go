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

// Layar registrasi punya clip sendiri (tampil, kemungkinan salah ketik) di tab
// "register" halaman Audio admin.
func TestAudioSeedsHaveRegistrationClips(t *testing.T) {
	tabs := map[string]bool{}
	for _, x := range AudioTabs {
		tabs[x] = true
	}
	if !tabs["register"] {
		t.Fatal(`AudioTabs has no "register" tab`)
	}
	want := map[string]bool{"reg_show": false, "reg_typo": false}
	for _, s := range audioSeeds() {
		if _, ok := want[s.id]; ok {
			if s.tab != "register" || s.when == "" {
				t.Errorf("%s: tab %q when %q", s.id, s.tab, s.when)
			}
			want[s.id] = true
		}
	}
	for id, seen := range want {
		if !seen {
			t.Errorf("%s has no audio seed", id)
		}
	}
}
