package mailer

import "testing"

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
