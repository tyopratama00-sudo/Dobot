package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"photobooth/database"
)

// Frame ids are random hex, so ordering by id shuffles frames. Ids below are
// chosen so that id order differs from the expected name order.
func seedFramesForOrder(t *testing.T) {
	t.Helper()
	if _, err := database.DB.Exec(`DELETE FROM frames`); err != nil {
		t.Fatal(err)
	}
	for _, f := range [][2]string{
		{"frame-c1", "Personal 10"},
		{"frame-a2", "Personal 2"},
		{"frame-f3", "Personal 1"},
		{"frame-b4", "Group 2"},
		{"frame-e5", "Group 1"},
	} {
		if _, err := database.DB.Exec(
			`INSERT INTO frames (id, name, file_path, thumb_url, photo_slots) VALUES (?, ?, '', '', 2)`,
			f[0], f[1],
		); err != nil {
			t.Fatal(err)
		}
	}
}

var wantFrameOrder = []string{"Group 1", "Group 2", "Personal 1", "Personal 2", "Personal 10"}

func TestFrameOrderBoothListsFramesByName(t *testing.T) {
	isolatedDB(t)
	seedFramesForOrder(t)

	w := httptest.NewRecorder()
	GetFrames(w, httptest.NewRequest(http.MethodGet, "/api/frames", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var res struct {
		Data []struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, f := range res.Data {
		got = append(got, f.Name)
	}
	if !reflect.DeepEqual(got, wantFrameOrder) {
		t.Fatalf("booth frame order = %v, want %v", got, wantFrameOrder)
	}
}

func TestFrameOrderAdminListsFramesByName(t *testing.T) {
	isolatedDB(t)
	seedFramesForOrder(t)

	for _, url := range []string{"/api/admin/frames", "/api/admin/frames?sortBy=name&sortOrder=asc"} {
		w := httptest.NewRecorder()
		AdminListFrames(w, httptest.NewRequest(http.MethodGet, url, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d: %s", url, w.Code, w.Body)
		}
		var res struct {
			Data []struct {
				Name string `json:"name"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatal(err)
		}
		var got []string
		for _, f := range res.Data {
			got = append(got, f.Name)
		}
		if !reflect.DeepEqual(got, wantFrameOrder) {
			t.Fatalf("%s: admin frame order = %v, want %v", url, got, wantFrameOrder)
		}
	}
}
