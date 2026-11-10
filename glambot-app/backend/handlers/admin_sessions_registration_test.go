package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

type adminSessionRow struct {
	ID                string `json:"id"`
	RegistrationName  string `json:"registration_name"`
	RegistrationEmail string `json:"registration_email"`
}

// listSessions memanggil daftar sesi admin dengan query yang diberikan.
func listSessions(t *testing.T, query string) []adminSessionRow {
	t.Helper()
	w := httptest.NewRecorder()
	AdminListSessions(w, httptest.NewRequest(http.MethodGet, "/?"+query, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	var res struct {
		Data []adminSessionRow `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res.Data
}

func registeredSession(t *testing.T, name, email string) string {
	t.Helper()
	id := paidSession(t)
	if code, _, msg := saveRegistration(t, id, name, email); code != http.StatusOK {
		t.Fatalf("register: %d %s", code, msg)
	}
	return id
}

func TestAdminRegistrationListShowsNameAndEmail(t *testing.T) {
	isolatedDB(t)
	rina := registeredSession(t, "Rina Putri", "rina@gmail.com")
	anon := paidSession(t)

	got := map[string]adminSessionRow{}
	for _, s := range listSessions(t, "") {
		got[s.ID] = s
	}
	if s := got[rina]; s.RegistrationName != "Rina Putri" || s.RegistrationEmail != "rina@gmail.com" {
		t.Fatalf("registered row = %+v", s)
	}
	if s, ok := got[anon]; !ok || s.RegistrationName != "" || s.RegistrationEmail != "" {
		t.Fatalf("unregistered row = %+v (listed %v)", s, ok)
	}
}

func listedIDs(rows []adminSessionRow) map[string]bool {
	ids := map[string]bool{}
	for _, s := range rows {
		ids[s.ID] = true
	}
	return ids
}

func TestAdminRegistrationSearchByName(t *testing.T) {
	isolatedDB(t)
	rina := registeredSession(t, "Rina Putri", "rp@gmail.com")
	budi := registeredSession(t, "Budi", "budi@yahoo.com")

	got := listedIDs(listSessions(t, "search=PUTR"))
	if !got[rina] || got[budi] || len(got) != 1 {
		t.Fatalf("search by name = %v (rina %s)", got, rina)
	}
}

func TestAdminRegistrationSearchByEmail(t *testing.T) {
	isolatedDB(t)
	rina := registeredSession(t, "Rina", "rina.putri@gmail.com")
	budi := registeredSession(t, "Budi", "budi@yahoo.com")
	// Kunjungan ulang dengan email yang sama tetap sesi terpisah (ADR 0001).
	rinaAgain := registeredSession(t, "Rina P", "rina.putri@gmail.com")

	got := listedIDs(listSessions(t, "search=Putri%40Gmail"))
	if !got[rina] || !got[rinaAgain] || got[budi] || len(got) != 2 {
		t.Fatalf("search by email = %v", got)
	}
}

func TestAdminRegistrationSearchStillMatchesSessionID(t *testing.T) {
	isolatedDB(t)
	rina := registeredSession(t, "Rina", "rina@gmail.com")
	other := paidSession(t)

	got := listedIDs(listSessions(t, "search="+rina[:8]))
	if !got[rina] || got[other] {
		t.Fatalf("search by id = %v", got)
	}
}

type sessionDetailRegistration struct {
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	RegisteredAt time.Time `json:"registered_at"`
}

// sessionDetail memanggil detail sesi admin dan mengembalikan bagian registrasinya.
func sessionDetail(t *testing.T, id string) *sessionDetailRegistration {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	rc := chi.NewRouteContext()
	rc.URLParams.Add("id", id)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	AdminGetSession(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("detail: %d %s", w.Code, w.Body)
	}
	var res struct {
		Registration *sessionDetailRegistration `json:"registration"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res.Registration
}

func TestAdminRegistrationDetailShowsTheRegistration(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	_, saved, _ := saveRegistration(t, id, "Rina Putri", "rina@gmail.com")

	got := sessionDetail(t, id)
	if got == nil || got.Name != "Rina Putri" || got.Email != "rina@gmail.com" ||
		!got.RegisteredAt.Equal(saved.RegisteredAt.Truncate(time.Second)) {
		t.Fatalf("detail registration = %+v, saved %+v", got, saved)
	}
}

func TestAdminRegistrationDetailWithoutRegistration(t *testing.T) {
	isolatedDB(t)
	if got := sessionDetail(t, paidSession(t)); got != nil {
		t.Fatalf("detail registration = %+v, want none", got)
	}
}
