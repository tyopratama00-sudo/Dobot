package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"photobooth/auth"
	"photobooth/database"
)

// Default timer Go = DEFAULT_SETTINGS.timeouts booth; rentang = skema zod.
func TestTimerDefaultsMatchBooth(t *testing.T) {
	src, err := os.ReadFile(filepath.Join(srcRoot(t), "frontend/packages/shared/src/config.ts"))
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range timerFields {
		def := regexp.MustCompile(`\n\s+` + f.JSON + `: (\d+),`).FindSubmatch(src)
		rng := regexp.MustCompile(f.JSON + `: z\.number\(\)\.int\(\)\.min\((\d+)\)\.max\((\d+)\)`).FindSubmatch(src)
		if def == nil || rng == nil {
			t.Fatalf("%s not found in config.ts", f.JSON)
		}
		if got := fmt.Sprintf("%s %s-%s", def[1], rng[1], rng[2]); got != fmt.Sprintf("%d %d-%d", f.Def, f.Min, f.Max) {
			t.Errorf("%s: booth %s, Go %d %d-%d", f.JSON, got, f.Def, f.Min, f.Max)
		}
	}
}

// Default robot Go = dobot/.env.example.
func TestRobotDefaultsMatchDobotEnv(t *testing.T) {
	src, err := os.ReadFile(filepath.Join(srcRoot(t), "dobot/.env.example"))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(robotDefaults)
	var got map[string]float64
	json.Unmarshal(b, &got)
	for js, env := range map[string]string{
		"robotSpeedFactor": "ROBOT_SPEED_FACTOR", "robotJointSpeed": "ROBOT_JOINT_SPEED", "robotJointAcc": "ROBOT_JOINT_ACC",
		"safetyTimeout": "SAFETY_TIMEOUT", "postActionDelay": "POST_ACTION_DELAY", "sequenceSlotSec": "SEQUENCE_SLOT_SEC",
		"faceTrackGainPan": "FACE_TRACK_GAIN_PAN", "faceTrackGainTilt": "FACE_TRACK_GAIN_TILT",
		"faceTrackDeadbandPct": "FACE_TRACK_DEADBAND_PCT", "faceTrackMaxDevDeg": "FACE_TRACK_MAX_DEV_DEG",
	} {
		m := regexp.MustCompile(`(?m)^` + env + `=([\d.]+)`).FindSubmatch(src)
		if m == nil {
			t.Fatalf("%s not in .env.example", env)
		}
		if want, _ := strconv.ParseFloat(string(m[1]), 64); got[js] != want {
			t.Errorf("%s: Go %v, .env %v", js, got[js], want)
		}
	}
}

// srcRoot = glambot-app, independen dari os.Chdir di testDB.
func srcRoot(t *testing.T) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..")
}

func TestDateRange(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/?from=2026-01-01&to=bogus", nil)
	where, args := dateRange(r, "c", []string{"1=1"}, nil)
	if len(where) != 2 || where[1] != "c >= ?::date" || len(args) != 1 || args[0] != "2026-01-01" {
		t.Fatalf("got %v %v", where, args)
	}
}

// Ganti password lalu dicoba login dengan password baru; hash asli dikembalikan.
func TestChangePassword(t *testing.T) {
	testDB(t)
	var (
		id          int64
		email, hash string
	)
	if err := database.DB.QueryRow(`SELECT id, email, password_hash FROM admins ORDER BY id LIMIT 1`).Scan(&id, &email, &hash); err != nil {
		t.Skipf("no admin: %v", err)
	}
	t.Cleanup(func() { database.DB.Exec(`UPDATE admins SET password_hash = ? WHERE id = ?`, hash, id) })
	tok, _ := auth.GenerateToken(id, email)

	change := func(body string) int {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		AdminChangePassword(w, req)
		return w.Code
	}
	if c := change(`{"oldPassword":"wrong-old","newPassword":"newpass123"}`); c != http.StatusBadRequest {
		t.Fatalf("wrong old password accepted: %d", c)
	}
	if c := change(`{"oldPassword":"x","newPassword":"short"}`); c != http.StatusBadRequest {
		t.Fatalf("short password accepted: %d", c)
	}

	// Pakai hash yang diketahui supaya tidak bergantung password admin sekarang.
	known, _ := auth.HashPassword("known-old-1")
	database.DB.Exec(`UPDATE admins SET password_hash = ? WHERE id = ?`, known, id)
	if c := change(`{"oldPassword":"known-old-1","newPassword":"newpass123"}`); c != http.StatusOK {
		t.Fatalf("change failed: %d", c)
	}
	var now string
	database.DB.QueryRow(`SELECT password_hash FROM admins WHERE id = ?`, id).Scan(&now)
	if !auth.VerifyPassword(now, "newpass123") {
		t.Fatal("new password not stored")
	}
}
