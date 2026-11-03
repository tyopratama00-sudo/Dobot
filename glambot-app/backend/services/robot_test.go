package services

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"photobooth/config"
)

// fakeDobot: /robot/status menjawab dari `statuses` berurutan, jawaban terakhir diulang.
type fakeDobot struct {
	mu       sync.Mutex
	statuses []string
	stops    int
}

func (f *fakeDobot) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch r.URL.Path {
	case "/robot/status":
		fmt.Fprint(w, f.statuses[0])
		if len(f.statuses) > 1 {
			f.statuses = f.statuses[1:]
		}
	case "/robot/stop":
		f.stops++
	}
}

func startFakeDobot(t *testing.T, statuses ...string) *fakeDobot {
	t.Helper()
	f := &fakeDobot{statuses: statuses}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	config.App = &config.Config{RobotAPIURL: srv.URL, RobotEnabled: true}

	timeout, poll := robotStandbyTimeout, robotStandbyPoll
	robotStandbyTimeout, robotStandbyPoll = 500*time.Millisecond, 5*time.Millisecond
	t.Cleanup(func() { robotStandbyTimeout, robotStandbyPoll = timeout, poll })
	return f
}

// Lock berhasil = goroutine konfirmasi sudah selesai.
func waitConfirmation() {
	robotModeMu.Lock()
	robotModeMu.Unlock()
}

const (
	statusDisabling = `{"mode":"disabling","standby":false,"error":null}`
	statusStandby   = `{"mode":"standby","standby":true,"error":null}`
	statusFailed    = `{"mode":"standby","standby":false,"error":"Robot gagal dimatikan"}`
)

func TestDisableMarksOffOnlyAfterStandby(t *testing.T) {
	f := startFakeDobot(t, statusDisabling, statusDisabling, statusStandby)
	if err := DisableRobot(); err != nil {
		t.Fatal(err)
	}
	waitConfirmation()
	if config.App.GetRobotEnabled() {
		t.Fatal("robot standby harus tercatat mati")
	}
	if f.stops != 0 {
		t.Fatalf("emergency stop tidak boleh terkirim: %d", f.stops)
	}
}

func TestDisableEmergencyStopsWhenDobotReportsFailure(t *testing.T) {
	f := startFakeDobot(t, statusFailed)
	if err := DisableRobot(); err != nil {
		t.Fatal(err)
	}
	waitConfirmation()
	if f.stops != 1 {
		t.Fatalf("mau 1 emergency stop, dapat %d", f.stops)
	}
}

func TestDisableEmergencyStopsWhenNeverStandby(t *testing.T) {
	f := startFakeDobot(t, statusDisabling)
	if err := DisableRobot(); err != nil {
		t.Fatal(err)
	}
	waitConfirmation()
	if f.stops != 1 {
		t.Fatalf("mau 1 emergency stop, dapat %d", f.stops)
	}
}

// Enable harus antre di belakang disable yang belum terkonfirmasi.
func TestEnableWaitsForDisableConfirmation(t *testing.T) {
	startFakeDobot(t, statusDisabling, statusDisabling, statusDisabling, statusStandby)
	if err := DisableRobot(); err != nil {
		t.Fatal(err)
	}
	if err := EnableRobot(nil); err != nil {
		t.Fatal(err)
	}
	if !config.App.GetRobotEnabled() {
		t.Fatal("enable terakhir harus menang: status akhir aktif")
	}
}
