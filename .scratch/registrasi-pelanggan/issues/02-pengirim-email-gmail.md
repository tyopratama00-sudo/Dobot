# 02: Pengirim email Gmail dan tombol uji di admin

**What to build:** The backend can send email through the booth's Gmail account. An admin can see in Pengaturan whether email is configured ("Email aktif" with the sender address, or "belum diatur"), type an address, press **Kirim email uji**, and receive a short test email. If sending fails, the error text is shown. Tests use a fake mailer that records messages and can be told to fail, so no test ever talks to Gmail.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Settings and configuration; Email Foto dispatcher, mailer interface).

**Blocked by:** None (can start immediately)

**Status:** resolved — selesai di 3d5217f (merge 73a22d6)

- [ ] Gmail credentials come from the backend environment under exactly these names (the owner may already have filled them in): `SMTP_USER`, `SMTP_APP_PASSWORD`, optional `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (default `587`, STARTTLS) and `SMTP_FROM_NAME`
- [ ] Email counts as configured only when user and password are both set
- [ ] A mailer interface sends one message (recipient address and name, subject, plain-text and HTML bodies, attachments); production uses Gmail SMTP, tests use a fake
- [ ] Admin endpoint reports whether email is configured and the sender address, without exposing the password
- [ ] Admin endpoint sends a test email to a given address and returns the error text on failure; it refuses when email is not configured
- [ ] Pengaturan page shows the status line and the test-email form
- [ ] HTTP tests on the isolated test schema cover configured and not-configured status, a successful test send (checked through the fake mailer), and a failing send
- [ ] Example env file and README document the new variables and that the Gmail account needs 2-step verification to create an App Password
- [ ] Backend build, vet and tests pass
