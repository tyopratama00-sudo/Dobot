// Package mailer mengirim email dari akun Gmail booth (Email Foto, email uji).
// Produksi memakai SMTP (lihat SMTP); tes memakai mailertest.Fake lewat Use,
// sehingga tidak ada tes yang menghubungi Gmail.
package mailer

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"

	"photobooth/config"
)

// Address penerima email.
type Address struct {
	Email string
	Name  string
}

// Attachment lampiran satu file.
type Attachment struct {
	Filename    string
	ContentType string // kosong = application/octet-stream
	Data        []byte
}

// Message satu email: penerima, subjek, isi teks & HTML, lampiran.
// FromName kosong = nama pengirim bawaan mailer (SMTP_FROM_NAME).
type Message struct {
	To          Address
	FromName    string
	Subject     string
	Text        string
	HTML        string
	Attachments []Attachment
}

// Mailer mengirim satu pesan.
type Mailer interface {
	Send(ctx context.Context, msg Message) error
}

// Configured true kalau akun Gmail booth sudah diatur: user DAN App Password
// terisi di env backend.
func Configured() bool {
	c := config.App
	return c != nil && strings.TrimSpace(c.SMTPUser) != "" && c.SMTPAppPassword != ""
}

// SenderAddress alamat pengirim (SMTP_USER), kosong kalau belum diatur.
func SenderAddress() string {
	if !Configured() {
		return ""
	}
	return strings.TrimSpace(config.App.SMTPUser)
}

var (
	overrideMu sync.RWMutex
	override   Mailer
)

// Current mengembalikan mailer aktif, atau nil kalau email belum diatur.
// Tanpa Use, ini Gmail SMTP dari config.
func Current() Mailer {
	if !Configured() {
		return nil
	}
	overrideMu.RLock()
	m := override
	overrideMu.RUnlock()
	if m != nil {
		return m
	}
	return SMTPFromConfig(config.App)
}

// Use mengganti mailer yang dipakai Current (untuk tes, mis. mailertest.Fake).
// Panggil restore yang dikembalikan untuk memulihkan mailer sebelumnya.
func Use(m Mailer) (restore func()) {
	overrideMu.Lock()
	prev := override
	override = m
	overrideMu.Unlock()
	return func() {
		overrideMu.Lock()
		override = prev
		overrideMu.Unlock()
	}
}

var addressRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// ValidAddress aturan validasi email booth: bagian lokal, '@', lalu domain
// yang mengandung titik. Sama dengan validasi di layar registrasi booth.
func ValidAddress(s string) bool {
	return addressRe.MatchString(s)
}

// permanentError menandai penolakan yang tidak akan berhasil kalau diulang
// (mis. server menolak alamat penerima dengan kode 5xx).
type permanentError struct{ err error }

func (e permanentError) Error() string { return e.err.Error() }
func (e permanentError) Unwrap() error { return e.err }

// Permanent membungkus err sebagai kegagalan permanen.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return permanentError{err}
}

// IsPermanent true kalau err (atau yang dibungkusnya) kegagalan permanen;
// selain itu kegagalan dianggap sementara dan boleh dicoba lagi.
func IsPermanent(err error) bool {
	var p permanentError
	return errors.As(err, &p)
}
