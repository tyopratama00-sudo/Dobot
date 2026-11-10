// Package mailertest menyediakan mailer palsu untuk tes: mencatat setiap pesan
// dan bisa disuruh gagal sementara atau permanen. Tidak pernah menghubungi Gmail.
//
//	fake := &mailertest.Fake{}
//	t.Cleanup(mailer.Use(fake)) // plus isi config.App.SMTPUser/SMTPAppPassword
package mailertest

import (
	"context"
	"sync"

	"photobooth/mailer"
)

// Fake mengimplementasikan mailer.Mailer. Zero value siap dipakai.
type Fake struct {
	mu     sync.Mutex
	sent   []mailer.Message
	next   []error
	always error
}

// Send mencatat msg kalau berhasil. Urutan kegagalan: antrean FailNext dulu,
// lalu FailAlways. Pesan yang gagal tidak dicatat sebagai terkirim.
func (f *Fake) Send(_ context.Context, msg mailer.Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.next) > 0 {
		err := f.next[0]
		f.next = f.next[1:]
		if err != nil {
			return err
		}
	} else if f.always != nil {
		return f.always
	}
	f.sent = append(f.sent, msg)
	return nil
}

// FailNext membuat pengiriman berikutnya gagal dengan errs berurutan (satu
// error per Send; nil di antrean = Send itu berhasil). Untuk gagal permanen,
// bungkus dengan mailer.Permanent.
func (f *Fake) FailNext(errs ...error) {
	f.mu.Lock()
	f.next = append(f.next, errs...)
	f.mu.Unlock()
}

// FailAlways membuat setiap Send gagal dengan err (nil = berhasil lagi).
func (f *Fake) FailAlways(err error) {
	f.mu.Lock()
	f.always = err
	f.mu.Unlock()
}

// Sent salinan pesan yang berhasil dikirim, urut waktu.
func (f *Fake) Sent() []mailer.Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]mailer.Message(nil), f.sent...)
}
