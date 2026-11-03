package handlers

import (
	"testing"

	"photobooth/models"
)

func TestStatusTransitionCannotSkipPayment(t *testing.T) {
	if isAllowedStatusTransition(models.StatusPendingPayment, models.StatusPaid) {
		t.Fatal("pending_payment -> paid lewat endpoint publik harus ditolak")
	}
	if isAllowedStatusTransition(models.StatusExpired, models.StatusPaid) {
		t.Fatal("expired -> paid lewat endpoint publik harus ditolak")
	}
	if isAllowedStatusTransition(models.StatusPendingPayment, models.StatusShooting) {
		t.Fatal("pending_payment -> shooting harus ditolak")
	}
}

// Transisi yang dipakai booth harus tetap jalan.
func TestStatusTransitionBoothFlow(t *testing.T) {
	if !isAllowedStatusTransition(models.StatusPaid, models.StatusShooting) {
		t.Fatal("paid -> shooting harus boleh")
	}
	if !isAllowedStatusTransition(models.StatusPendingPayment, models.StatusExpired) {
		t.Fatal("pending_payment -> expired harus boleh")
	}
}
