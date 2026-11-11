package mailer

import (
	"strings"
	"testing"
)

// Kasus yang sama dengan email.test.ts di booth: aturan booth dan backend harus sama.
func TestValidAddressMatchesBoothRule(t *testing.T) {
	for _, ok := range []string{"rina@gmail.com", "r.p_1-x@yahoo.co.id", "RINA@GMAIL.COM"} {
		if !ValidAddress(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "rina", "rina@", "@gmail.com", "rina@gmail", "ri na@gmail.com", "rina@@gmail.com"} {
		if ValidAddress(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}

func TestNormalizeAddress(t *testing.T) {
	if got, ok := NormalizeAddress("  Rina.Putri@GMAIL.com "); !ok || got != "rina.putri@gmail.com" {
		t.Errorf("got %q, %v", got, ok)
	}
	long := strings.Repeat("a", 245) + "@gmail.com" // 255 karakter
	if _, ok := NormalizeAddress(long); ok {
		t.Error("address over 254 characters accepted")
	}
	if _, ok := NormalizeAddress(long[1:]); !ok {
		t.Error("254-character address rejected")
	}
	if _, ok := NormalizeAddress("rina@gmail"); ok {
		t.Error("invalid address accepted")
	}
}
