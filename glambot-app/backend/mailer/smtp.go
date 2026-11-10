package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"photobooth/config"
)

const (
	defaultSMTPHost = "smtp.gmail.com"
	defaultSMTPPort = 587
	sendTimeout     = 60 * time.Second
)

// SMTP mengirim lewat server SMTP dengan AUTH PLAIN. Port 587 (bawaan Gmail)
// memakai STARTTLS; port 465 memakai TLS langsung.
type SMTP struct {
	Host     string // kosong = smtp.gmail.com
	Port     int    // 0 = 587
	User     string // juga alamat pengirim
	Password string // App Password Google
	FromName string // nama tampilan pengirim bawaan
}

// SMTPFromConfig membangun SMTP dari env backend (SMTP_*).
func SMTPFromConfig(c *config.Config) *SMTP {
	return &SMTP{Host: c.SMTPHost, Port: c.SMTPPort, User: strings.TrimSpace(c.SMTPUser), Password: c.SMTPAppPassword, FromName: c.SMTPFromName}
}

// Send mengirim satu pesan. Penolakan alamat penerima (5xx pada RCPT TO)
// dikembalikan sebagai kegagalan permanen (IsPermanent); kegagalan lain
// (jaringan, login, server sibuk) dianggap sementara.
func (s *SMTP) Send(ctx context.Context, msg Message) error {
	host, port := s.Host, s.Port
	if host == "" {
		host = defaultSMTPHost
	}
	if port == 0 {
		port = defaultSMTPPort
	}
	fromName := msg.FromName
	if fromName == "" {
		fromName = s.FromName
	}
	data, err := buildMessage(Address{Email: s.User, Name: fromName}, msg, time.Now())
	if err != nil {
		return err
	}

	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, sendTimeout)
		defer cancel()
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	tlsCfg := &tls.Config{ServerName: host}
	var conn net.Conn
	if port == 465 {
		conn, err = (&tls.Dialer{Config: tlsCfg}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("tidak bisa terhubung ke %s: %w", addr, err)
	}
	if dl, ok := ctx.Deadline(); ok {
		conn.SetDeadline(dl)
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return err
	}
	defer c.Close()

	if port != 465 {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsCfg); err != nil {
				return fmt.Errorf("STARTTLS: %w", err)
			}
		}
	}
	if err := c.Auth(smtp.PlainAuth("", s.User, s.Password, host)); err != nil {
		return fmt.Errorf("login Gmail gagal: %w", err)
	}
	if err := c.Mail(s.User); err != nil {
		return err
	}
	if err := c.Rcpt(msg.To.Email); err != nil {
		var te *textproto.Error
		if errors.As(err, &te) && te.Code >= 500 {
			return Permanent(fmt.Errorf("alamat %s ditolak: %w", msg.To.Email, err))
		}
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(data); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

// buildMessage menyusun pesan MIME: multipart/alternative (teks + HTML),
// dibungkus multipart/mixed kalau ada lampiran.
func buildMessage(from Address, msg Message, now time.Time) ([]byte, error) {
	var buf bytes.Buffer
	h := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }
	h("From", (&mail.Address{Name: from.Name, Address: from.Email}).String())
	h("To", (&mail.Address{Name: msg.To.Name, Address: msg.To.Email}).String())
	h("Subject", mime.QEncoding.Encode("utf-8", msg.Subject))
	h("Date", now.Format(time.RFC1123Z))
	h("Message-ID", messageID(from.Email))
	h("MIME-Version", "1.0")

	// Teks + HTML sebagai multipart/alternative.
	var altBuf bytes.Buffer
	alt := multipart.NewWriter(&altBuf)
	altType := `multipart/alternative; boundary="` + alt.Boundary() + `"`
	for _, p := range []struct{ ctype, body string }{{"text/plain", msg.Text}, {"text/html", msg.HTML}} {
		if p.body == "" {
			continue
		}
		pw, err := alt.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {p.ctype + "; charset=utf-8"},
			"Content-Transfer-Encoding": {"quoted-printable"},
		})
		if err != nil {
			return nil, err
		}
		qp := quotedprintable.NewWriter(pw)
		if _, err := qp.Write([]byte(p.body)); err != nil {
			return nil, err
		}
		if err := qp.Close(); err != nil {
			return nil, err
		}
	}
	if err := alt.Close(); err != nil {
		return nil, err
	}

	if len(msg.Attachments) == 0 {
		h("Content-Type", altType)
		buf.WriteString("\r\n")
		buf.Write(altBuf.Bytes())
		return buf.Bytes(), nil
	}

	// Ada lampiran: multipart/mixed = alternative + file.
	outer := multipart.NewWriter(&buf)
	h("Content-Type", `multipart/mixed; boundary="`+outer.Boundary()+`"`)
	buf.WriteString("\r\n")
	pw, err := outer.CreatePart(textproto.MIMEHeader{"Content-Type": {altType}})
	if err != nil {
		return nil, err
	}
	if _, err := pw.Write(altBuf.Bytes()); err != nil {
		return nil, err
	}
	for _, a := range msg.Attachments {
		ctype := a.ContentType
		if ctype == "" {
			ctype = "application/octet-stream"
		}
		pw, err := outer.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {mime.FormatMediaType(ctype, map[string]string{"name": a.Filename})},
			"Content-Disposition":       {mime.FormatMediaType("attachment", map[string]string{"filename": a.Filename})},
			"Content-Transfer-Encoding": {"base64"},
		})
		if err != nil {
			return nil, err
		}
		enc := base64.StdEncoding.EncodeToString(a.Data)
		for len(enc) > 76 {
			io.WriteString(pw, enc[:76]+"\r\n")
			enc = enc[76:]
		}
		io.WriteString(pw, enc+"\r\n")
	}
	if err := outer.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func messageID(from string) string {
	b := make([]byte, 12)
	rand.Read(b)
	domain := "glambot.local"
	if i := strings.LastIndex(from, "@"); i >= 0 && i < len(from)-1 {
		domain = from[i+1:]
	}
	return "<" + hex.EncodeToString(b) + "@" + domain + ">"
}
