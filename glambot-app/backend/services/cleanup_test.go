package services

import (
	"testing"
	"time"

	"photobooth/config"
	"photobooth/database"
	"photobooth/database/dbtest"
)

func TestEmailFotoExpiryCleanupKeepsRegistrationAndFailsPendingDelivery(t *testing.T) {
	url := dbtest.Schema(t)
	prevApp := config.App
	config.App = &config.Config{StoragePath: t.TempDir(), CleanupIntervalHours: 1}
	if err := database.Init(url); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() {
		database.Close()
		config.App = prevApp
	})

	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := database.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	past := time.Now().Add(-time.Hour)
	for _, id := range []string{"pending-one", "sent-one"} {
		exec(`INSERT INTO sessions (id, duration_secs, price, final_price, status, expires_at,
				registration_name, registration_email, registered_at)
			VALUES (?, 300, 0, 0, 'completed', ?, 'Rina Putri', 'rina@gmail.com', ?)`, id, past, past.Add(-72*time.Hour))
	}
	exec(`INSERT INTO email_deliveries (session_id, recipient, attempts, last_error) VALUES ('pending-one', 'rina@gmail.com', 3, '421 try again later')`)
	exec(`INSERT INTO email_deliveries (session_id, recipient, status, content, attempts) VALUES ('sent-one', 'rina@gmail.com', 'sent', 'link_strip', 1)`)

	runCleanup()

	for id, want := range map[string]struct{ status, lastError string }{
		"pending-one": {"failed", "421 try again later"},
		"sent-one":    {"sent", ""},
	} {
		var status, lastError, name, email string
		var registeredAt *time.Time
		if err := database.DB.QueryRow(`
			SELECT d.status, d.last_error, s.registration_name, s.registration_email, s.registered_at
			FROM email_deliveries d JOIN sessions s ON s.id = d.session_id
			WHERE d.session_id = ?`, id).Scan(&status, &lastError, &name, &email, &registeredAt); err != nil {
			t.Fatal(err)
		}
		if status != want.status || lastError != want.lastError {
			t.Errorf("%s: delivery %q %q, want %q %q", id, status, lastError, want.status, want.lastError)
		}
		if name != "Rina Putri" || email != "rina@gmail.com" || registeredAt == nil {
			t.Errorf("%s: registration cleared: %q %q %v", id, name, email, registeredAt)
		}
	}
}
