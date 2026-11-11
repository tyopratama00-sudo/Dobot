package mailer

import (
	"bufio"
	"context"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"net/textproto"
	"strconv"
	"strings"
	"testing"
)

// fakeSMTPServer server SMTP minimal di 127.0.0.1 untuk satu koneksi: mencatat
// AUTH, MAIL, RCPT dan isi DATA. rcptReply = balasan untuk RCPT TO.
type fakeSMTPServer struct {
	addr      string
	rcptReply string
	auth      string
	from      string
	rcpt      []string
	data      string
	done      chan struct{}
}

func startFakeSMTP(t *testing.T, rcptReply string) *fakeSMTPServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	s := &fakeSMTPServer{addr: ln.Addr().String(), rcptReply: rcptReply, done: make(chan struct{})}
	go func() {
		defer close(s.done)
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		tp := textproto.NewConn(c)
		tp.PrintfLine("220 fake ESMTP")
		for {
			line, err := tp.ReadLine()
			if err != nil {
				return
			}
			cmd := strings.ToUpper(line)
			switch {
			case strings.HasPrefix(cmd, "EHLO"):
				tp.PrintfLine("250-fake")
				tp.PrintfLine("250 AUTH PLAIN")
			case strings.HasPrefix(cmd, "AUTH"):
				s.auth = line
				tp.PrintfLine("235 ok")
			case strings.HasPrefix(cmd, "MAIL FROM"):
				s.from = line
				tp.PrintfLine("250 ok")
			case strings.HasPrefix(cmd, "RCPT TO"):
				s.rcpt = append(s.rcpt, line)
				tp.PrintfLine("%s", s.rcptReply)
			case cmd == "DATA":
				tp.PrintfLine("354 go")
				b, _ := io.ReadAll(tp.DotReader())
				s.data = string(b)
				tp.PrintfLine("250 queued")
			case cmd == "QUIT":
				tp.PrintfLine("221 bye")
				return
			default:
				tp.PrintfLine("250 ok")
			}
		}
	}()
	return s
}

func (s *fakeSMTPServer) mailer(t *testing.T) *SMTP {
	host, port, _ := net.SplitHostPort(s.addr)
	p, err := strconv.Atoi(port)
	if err != nil {
		t.Fatal(err)
	}
	return &SMTP{Host: host, Port: p, User: "booth@gmail.com", Password: "app-pass", FromName: "Glambot Booth"}
}

func TestSMTPSendsAMultipartMessageWithAttachment(t *testing.T) {
	srv := startFakeSMTP(t, "250 ok")
	strip := []byte("\x89PNG fake strip bytes")
	err := srv.mailer(t).Send(context.Background(), Message{
		To:      Address{Email: "rina@example.com", Name: "Rina Ayu"},
		Subject: "Foto kamu dari Glambot 📸",
		Text:    "Halo Rina, ini fotomu.",
		HTML:    "<p>Halo <b>Rina</b>, ini fotomu.</p>",
		Attachments: []Attachment{
			{Filename: "strip.png", ContentType: "image/png", Data: strip},
		},
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	<-srv.done

	if !strings.Contains(srv.from, "<booth@gmail.com>") || len(srv.rcpt) != 1 || !strings.Contains(srv.rcpt[0], "<rina@example.com>") {
		t.Fatalf("envelope from %q rcpt %q", srv.from, srv.rcpt)
	}
	if !strings.HasPrefix(srv.auth, "AUTH PLAIN ") {
		t.Fatalf("auth %q", srv.auth)
	}
	if creds, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(srv.auth, "AUTH PLAIN ")); string(creds) != "\x00booth@gmail.com\x00app-pass" {
		t.Fatalf("auth creds %q", creds)
	}

	msg, err := mail.ReadMessage(strings.NewReader(srv.data))
	if err != nil {
		t.Fatalf("parse: %v\n%s", err, srv.data)
	}
	dec := new(mime.WordDecoder)
	if subj, _ := dec.DecodeHeader(msg.Header.Get("Subject")); subj != "Foto kamu dari Glambot 📸" {
		t.Fatalf("subject %q", subj)
	}
	from, err := mail.ParseAddress(msg.Header.Get("From"))
	if err != nil || from.Name != "Glambot Booth" || from.Address != "booth@gmail.com" {
		t.Fatalf("from %v %v", from, err)
	}
	to, err := mail.ParseAddress(msg.Header.Get("To"))
	if err != nil || to.Name != "Rina Ayu" || to.Address != "rina@example.com" {
		t.Fatalf("to %v %v", to, err)
	}

	parts := map[string]string{}
	var walk func(r io.Reader, ctype string)
	walk = func(r io.Reader, ctype string) {
		mt, params, err := mime.ParseMediaType(ctype)
		if err != nil {
			t.Fatalf("content-type %q: %v", ctype, err)
		}
		if !strings.HasPrefix(mt, "multipart/") {
			t.Fatalf("expected multipart, got %s", mt)
		}
		mr := multipart.NewReader(r, params["boundary"])
		for {
			p, err := mr.NextPart()
			if err == io.EOF {
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			pt := p.Header.Get("Content-Type")
			if strings.HasPrefix(pt, "multipart/") {
				walk(p, pt)
				continue
			}
			var body []byte
			if p.Header.Get("Content-Transfer-Encoding") == "base64" {
				body, err = io.ReadAll(base64.NewDecoder(base64.StdEncoding, p))
			} else {
				body, err = io.ReadAll(p) // multipart.Part decodes quoted-printable
			}
			if err != nil {
				t.Fatal(err)
			}
			key, _, _ := mime.ParseMediaType(pt)
			if fn := p.FileName(); fn != "" {
				key = "file:" + fn
			}
			parts[key] = string(body)
		}
	}
	walk(bufio.NewReader(msg.Body), msg.Header.Get("Content-Type"))

	if parts["text/plain"] != "Halo Rina, ini fotomu." {
		t.Errorf("text %q", parts["text/plain"])
	}
	if parts["text/html"] != "<p>Halo <b>Rina</b>, ini fotomu.</p>" {
		t.Errorf("html %q", parts["text/html"])
	}
	if parts["file:strip.png"] != string(strip) {
		t.Errorf("attachment %q (parts %v)", parts["file:strip.png"], parts)
	}
}

func TestSMTPRejectedRecipientIsPermanent(t *testing.T) {
	srv := startFakeSMTP(t, "550 5.1.1 The email account that you tried to reach does not exist")
	err := srv.mailer(t).Send(context.Background(), Message{
		To: Address{Email: "nobody@example.com"}, Subject: "x", Text: "x", HTML: "<p>x</p>",
	})
	if err == nil || !IsPermanent(err) || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("err %v, permanent %v", err, IsPermanent(err))
	}
}

func TestSMTPUnreachableServerIsTemporary(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().(*net.TCPAddr)
	ln.Close()
	m := &SMTP{Host: "127.0.0.1", Port: addr.Port, User: "booth@gmail.com", Password: "x"}
	err = m.Send(context.Background(), Message{To: Address{Email: "a@b.co"}, Subject: "x", Text: "x"})
	if err == nil || IsPermanent(err) {
		t.Fatalf("err %v, permanent %v", err, IsPermanent(err))
	}
}
