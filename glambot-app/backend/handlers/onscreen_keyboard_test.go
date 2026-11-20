package handlers

import (
	"net/http"
	"testing"
)

// Keyboard di Layar: aktif secara default, admin bisa mematikannya untuk booth
// yang memakai keyboard hardware, dan booth membacanya dari GET /api/config.
func TestOnScreenKeyboardSwitchShowsInPublicConfig(t *testing.T) {
	isolatedDB(t)
	if !publicConfig(t).OnScreenKeyboard {
		t.Fatal("Keyboard di Layar must be on by default")
	}
	code, cfg, msg := patchSettings(t, `{"onScreenKeyboard":false}`)
	if code != http.StatusOK || cfg.OnScreenKeyboard {
		t.Fatalf("disable: %d %q %+v", code, msg, cfg)
	}
	if publicConfig(t).OnScreenKeyboard {
		t.Fatal("public config still shows Keyboard di Layar after it was turned off")
	}
	if code, cfg, msg := patchSettings(t, `{"onScreenKeyboard":true}`); code != http.StatusOK || !cfg.OnScreenKeyboard {
		t.Fatalf("enable: %d %q %+v", code, msg, cfg)
	}
	if !publicConfig(t).OnScreenKeyboard {
		t.Fatal("public config hides Keyboard di Layar that is on")
	}
}
