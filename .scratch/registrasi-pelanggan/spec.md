# Registrasi pelanggan dan Email Foto

Status: ready-for-agent

Istilah mengikuti `GLOSSARY.md` (Pelanggan, Registrasi, Email Foto). Bentuk data mengikuti ADR 0001: registrasi melekat pada sesi, bukan akun, dan tidak digabung per email.

## Problem Statement

Pelanggan booth hanya bisa mendapatkan foto digitalnya dengan memindai QR di layar akhir. Pelanggan yang lupa atau tidak sempat memindai, misalnya karena terburu-buru, baterai ponsel habis, atau langsung pergi setelah cetakan keluar, kehilangan foto digitalnya. Link fotonya juga dihapus sekitar 3 hari setelah sesi, dan tidak ada cara mengirimkannya belakangan karena booth tidak mencatat siapa pelanggannya.

Pemilik booth juga tidak punya catatan siapa saja yang berkunjung. Halaman admin hanya menampilkan jumlah sesi berbayar.

## Solution

Setelah menekan MULAI dan sebelum memilih paket, pelanggan mengisi **Registrasi** (diubah 2026-11-13; sebelumnya setelah pembayaran): nama dan email, lewat keyboard di layar. Registrasi ini bukan pembuatan akun. Data dipakai untuk mengirim **Email Foto**, yang berisi link folder foto dan strip foto final, ke setiap pelanggan yang registrasi, sudah atau belum memindai QR. Email ini menjadi jalur cadangan kalau pelanggan lupa memindai.

Admin bisa melihat dan mencari registrasi di halaman Sesi, memantau status Email Foto, mengirim ulang ke alamat yang diperbaiki, dan menghapus data registrasi atas permintaan pelanggan. Fitur ini bisa dinyalakan atau dimatikan dari Pengaturan, dan hanya bisa dinyalakan kalau akun Gmail booth sudah diatur.

## User Stories

### Pelanggan di booth

1. As a pelanggan, I want the registration screen to appear right after my payment succeeds, so that I only give my data once I am actually having a session.
2. As a pelanggan in free mode, I want the registration screen to appear right after I press MULAI FOTO and the session is confirmed, so that free sessions get the same email backup.
3. As a pelanggan, I want the screen to tell me that my email is only used to send this session's photos, as a backup if I forget to scan the QR, and is kept as a visit record, so that I know why I am asked for it.
4. As a pelanggan, I want to type my name with lowercase letters, uppercase letters via Shift, and spaces, so that my name is written properly.
5. As a pelanggan, I want an on-screen keyboard with `@`, `.`, `_` and `-`, so that I can type any email address without a physical keyboard.
6. As a pelanggan, I want shortcut keys for `@gmail.com`, `@yahoo.com` and `.com`, so that I can type my email faster and with fewer mistakes.
7. As a pelanggan, I want a backspace key, so that I can fix a typo.
8. As a pelanggan, I want to switch between the name field and the email field by tapping them, so that I can correct either one.
9. As a pelanggan, I want the Lanjut button to stay disabled until both name and email are valid, so that I cannot continue with an incomplete form.
10. As a pelanggan, I want to be told when my email is not a valid address, so that I can fix it before continuing.
11. As a pelanggan, I want a suggestion such as "Maksudmu @gmail.com?" when I mistype a common domain, and to accept it with one tap, so that a small typo does not cost me my photos.
12. As a pelanggan, I want to see my email shown large ("Foto akan dikirim ke: …") before I continue, so that I can check it one last time.
13. As a pelanggan, I want the robot to tell me by voice what to fill in on this screen, so that I understand what is expected.
14. As a pelanggan, I want a warning before the registration screen times out, so that I am not surprised.
15. As a pelanggan who walks away or does not fill the form in time, I want my paid session to continue to frame selection anyway, so that I do not lose the session I paid for.
16. As a pelanggan, I want there to be no "skip" button, so that the booth gets the data it needs while my session is never blocked forever.
17. As a pelanggan who reloads or whose booth page restarts during registration, I want to come back to the registration screen, so that the session continues from where it was.
18. As a pelanggan on the QR screen, I want to read "Foto juga dikirim ke <email>", so that I know my photos will reach me even if I don't scan.
19. As a pelanggan who notices a typo on the QR screen, I want an "Ubah email" button that opens the same keyboard, so that I can fix my address before the Email Foto is sent.
20. As a pelanggan who changes my email after the Email Foto was already sent, I want it sent again to the new address, so that the correction still helps.

### Pelanggan yang menerima email

21. As a pelanggan, I want the Email Foto to greet me by the name I entered, so that it is clearly meant for me.
22. As a pelanggan, I want the Email Foto to contain a link to my photo folder, so that I can download all my photos and GIFs.
23. As a pelanggan, I want the Email Foto to tell me how long the link stays available (about 3 days), so that I download in time.
24. As a pelanggan, I want my final photo strip attached to the email, so that I still have my main photo after the link expires or if the link fails.
25. As a pelanggan whose session had no strip, for example because the robot was stopped or time ran out before choosing a frame, I want an email with the link to my raw photos, so that I still get what was taken.
26. As a pelanggan, I want the email to come from the booth's name, so that I recognise it and don't treat it as spam.
27. As a pelanggan, I want the email to arrive even when the booth's internet was briefly down, so that a short outage does not lose my photos.

### Admin / pemilik booth

28. As an admin, I want a "Registrasi pelanggan" switch in Pengaturan, so that I can turn the feature on or off.
29. As an admin, I want the switch to refuse to turn on while the Gmail account is not configured, so that customers never type an email that will not be sent.
30. As an admin, I want to see whether email sending is configured, so that I know the feature can work.
31. As an admin, I want a "Kirim email uji" button that sends a test email to an address I type, so that I can confirm the Gmail setup works before customers use it.
32. As an admin, I want to set how long the registration screen waits (default 120 seconds), like the other screen timers, so that I can tune it for my booth.
33. As an admin, I want to edit the registration screen's voice clips on the Audio page, like the other screens, so that the voice matches my booth.
34. As an admin, I want name and email columns in the Sesi list, so that I can see who visited.
35. As an admin, I want to search sessions by name or email, so that I can find a customer's session when they ask about it.
36. As an admin, I want to see the Email Foto status for each session (menunggu, terkirim, gagal, tidak dikirim), with the reason when it failed or was not sent, so that I know whether a customer got their photos.
37. As an admin, I want a "Kirim ulang" action in the session detail where I can correct the email address, so that I can rescue a customer who mistyped it.
38. As an admin, I want a "Hapus data registrasi" action in the session detail that clears the name and email but keeps the session history, so that I can honour a customer's request to delete their data.
39. As an admin, I want a deleted registration to also stop any pending Email Foto for that session, so that no email goes to an address the customer asked us to forget.
40. As an admin, I want registrations to stay on record after the session's photos are deleted, so that I keep a visit history.
41. As an admin, I want repeat visits by the same email to stay as separate sessions, so that one customer's typo or shared email never merges different people.
42. As an admin, I want failed sends to be retried automatically until the session's photos are deleted, and then marked failed, so that temporary problems fix themselves and permanent ones are visible.

## Implementation Decisions

### Domain and data

- **Registrasi** is stored on the session as name, email, and registration time. There is no customer or account table (ADR 0001).
- A booth visit can create several backend sessions (one per payment attempt or quantity change). The registration belongs to the backend session that was actually paid, or the confirmed free session. That is the session the booth continues with after payment.
- **Email Foto** delivery state is stored per session as its own record:
  - recipient, status (`pending`, `sent`, `failed`, `skipped`);
  - what was sent (link plus strip, strip only, or link only);
  - number of attempts and time of the next attempt;
  - last error or skip reason, and sent time.
- Deleting a registration clears name and email on the session and the recipient on the delivery record, and turns a pending delivery into `skipped` with reason "data dihapus". The session row and its history stay.
- The expiry cleanup leaves registration fields untouched. A delivery still pending when the session expires becomes `failed`.
- New migrations follow the existing idempotent compatibility-migration pattern, which runs on every boot.

### Settings and configuration

- New setting **registration enabled** (default off). It can only be switched on while the mailer is configured. The admin settings endpoint rejects enabling it otherwise, with a clear message.
- New screen timer **registrationSeconds**, default 120, same range rules as the other timers. It is part of the existing timer settings and the shared booth timeout config.
- The booth's public config exposes the effective value: registration is shown only when the setting is on **and** the mailer is configured.
- Gmail credentials live in the backend environment file, like Midtrans and Google Drive:
  - SMTP user (the booth's Gmail address);
  - an App Password;
  - optional host and port, defaulting to Gmail's SMTP with STARTTLS;
  - optional sender display name.

  The mailer counts as configured when user and password are both set. The example env file and README document these values and the need for 2-step verification on the Gmail account.
- New admin endpoints:
  - **email status:** whether it is configured, and the sender address;
  - **test email:** sends a short test message to a given address and returns the error text on failure.

### Booth flow

- A new session state **REGISTRATION** is added to the shared session state machine, with its own screen. Since 2026-11-13 it sits between MULAI (IDLE) and the package screen (SELECT_PRINT), before anything is paid:
  - **Registration on:** pressing MULAI opens REGISTRATION.
  - **Registration off:** MULAI goes straight to the package screen as before.
  - **Submit (Lanjut):** moves on to the package screen. The booth keeps the registration (also across a reload) and saves it on the backend session once that session is paid, before frame selection. The backend still only accepts a registration on a paid session.
  - **Save after payment fails:** a refusal (400/403/404/410) drops it; a network or server failure is retried with the booth heartbeat. The paid session never waits on it.
  - **Timeout or Kembali:** ends the visit and returns to the welcome screen, like the unpaid package screen. Nothing is saved.
- Restoring a saved booth session that was in REGISTRATION returns to the registration screen.
- The registration screen shows the explanation text: email is only used to send this session's photos, as a backup if the customer forgets to scan the QR, and is kept as a visit record. Pressing Lanjut counts as agreement; there is no checkbox.
- Email validation and typo suggestions are a pure module shared by the registration screen and the QR "Ubah email" dialog:
  - **validation:** an address with a local part, `@`, and a domain containing a dot;
  - **suggestion:** a common-domain correction (gmail.com, yahoo.com, yahoo.co.id, hotmail.com, outlook.com, icloud.com) computed from edit distance.

  The backend applies the same validation rule and rejects invalid addresses.
- A reusable on-screen keyboard component provides:
  - lowercase letters with Shift, digits, space and backspace;
  - `@ . _ -`;
  - shortcut keys for `@gmail.com`, `@yahoo.com` and `.com`.

  The existing voucher keypad may keep its own layout.
- New public endpoint to save or update the registration of a session (name, email). It is allowed from payment success until the session expires, and it validates both fields.
  - **Update before sending:** an update while the Email Foto is still pending changes the recipient.
  - **Update after sending:** an update after it was sent queues a new send to the new address.
- The QR screen shows "Foto juga dikirim ke <email>" and an "Ubah email" button when the session has a registration. Opening and saving the dialog restarts the QR screen timer.
- New voice clip ids for the registration screen (screen shown, likely typo) are added to the audio script seed, so they appear on the admin Audio page like the others.
- **QR screen timeout bug:** the investigation found that the timeout action for QR_READY and FINISHED resolves to an invalid transition. If so, the QR screen never times out to the thanks screen, and the thanks screen never resets to welcome. Verify this; if confirmed, fix it so that:
  - the QR screen timeout finishes the session;
  - the thanks screen timeout returns to welcome.

### Email Foto dispatcher

- A mailer interface sends one message: recipient (address and name), subject, plain-text and HTML bodies, and attachments. Production uses Gmail over SMTP; tests use a fake that records messages and can be told to fail.
- A dispatcher step runs on a periodic job (every minute, like the existing Drive retry job). Each run takes the current time as input and handles every session that has a registration and a delivery record that is not finished.
- **Readiness and content rules:**

  | Situation | Action |
  |---|---|
  | Drive enabled and every file uploaded | Send link plus strip |
  | 10 minutes after the session completed, Drive not finished, failed or disabled | Send strip only, with a note that the link is unavailable |
  | No strip, raw photos exist, Drive link exists, 10 minutes with no new photo | Send link only |
  | No strip and no Drive link, or no photos at all | Mark `skipped` with the reason ("tidak ada foto") |

- **Retries:** a failed send is retried with increasing delays (about 1, 5, 15 minutes, then hourly) until the session's expiry time, then marked `failed` with the last error. A permanent rejection of the recipient address is marked `failed` right away.
- **Resend:** an admin resend, optionally with a corrected address, resets the delivery to `pending` with attempts cleared, and updates the session's registration email when an address is given.
- **Template:** Indonesian with fixed text.
  - Subject: "Foto kamu dari <nama booth> 📸". The booth name comes from the admin display brand label, falling back to "Glambot Photo Booth".
  - Sender display name: the booth name.
  - Body: greeting with the registered name, the folder link (when available), how long the link stays available (from the session's expiry time), and a short closing.
  - Attachment: the final strip image (when available).
- The dispatcher never sends an email after the session's photos have been deleted.

### Admin panel

- **Sesi list:** name and email columns, and the existing search box matches session id, name or email.
- **Session detail:** a "Registrasi & Email Foto" section with name, email, registration time, delivery status, reason, attempts and sent time, plus two actions:
  - **Kirim ulang:** with an editable email;
  - **Hapus data registrasi:** with a confirmation.
- **Pengaturan:** the registration switch, the registration timer, the email status line, and the test-email form.
- No CSV export of registrations.

## Testing Decisions

- A good test drives the feature from the outside, through an HTTP endpoint, the dispatcher's single run, or a booth flow action, and checks what a customer or admin would observe. It does not check internal helpers or query shapes, so the implementation can change without rewriting tests.
- **Backend HTTP API (existing seam)**, using `httptest` against a throw-away schema in the `_test` database. Prior art: the free-mode session tests and the migration tests that use the shared test-schema helper, and skip when no test database URL is set. Covers:
  - saving and updating a registration, rejecting invalid names and emails, refusing after expiry;
  - the admin list showing and searching by name and email;
  - the session detail showing delivery status;
  - resend with a corrected address;
  - deleting a registration, which also stops a pending send;
  - the settings switch refusing to enable without a mailer;
  - the public config exposing the effective value;
  - the test-email endpoint, using the fake mailer.
- **Fake mailer (new seam)**, the only new seam. It records the messages so tests can assert recipient, subject, greeting name, link presence, link-expiry text and attachment. It can be scripted to fail temporarily or permanently.
- **Dispatcher run with a controlled clock**, called directly with a chosen time. Covers every readiness rule:
  - waits for Drive;
  - strip only after 10 minutes;
  - link only without a strip;
  - skipped with no photos;
  - Drive disabled;
  - retry delays;
  - marked failed at session expiry;
  - permanent rejection;
  - no sending after the photos are deleted;
  - resend after sent;
  - email changed while pending.
- **Booth flow with the API mocked (existing seam).** Prior art: the free-mode payment flow tests. Covers:
  - paid and free sessions entering registration after payment;
  - registration off skips the screen;
  - submit saves and moves to frame selection;
  - timeout moves on without saving;
  - restoring a session in REGISTRATION;
  - the QR screen "Ubah email" saving a new address;
  - the QR and thanks timeouts.
- **Pure email module.** Prior art: the payment-mode helper tests. Covers validation and domain suggestions, including no suggestion for correct or unknown domains.
- **Shared state machine.** Prior art: the shared FSM tests. Covers the new REGISTRATION transitions.
- **Browser end-to-end check** with a separate backend and booth on the `_test` database, robot pointed at an unreachable address, and the mailer faked, following the mode-switch browser check done earlier. It types a name and email with the on-screen keyboard, accepts a typo suggestion, reaches frame selection, and sees the email line and "Ubah email" on the QR screen.
- The admin pages have no UI tests in this repo; they are covered through their API.

## Out of Scope

- Promotional use of registration data (newsletters, WhatsApp blasts) and any marketing opt-in.
- Phone number, Instagram, and "tag my Instagram". (WhatsApp was added later as an optional, staff-sent backup; see ticket 09.)
- Sending WhatsApp messages automatically (WhatsApp Business Platform or unofficial gateways). Ticket 09 only prepares a click-to-chat link that staff send by hand.
- CSV or other export of registrations.
- An admin-editable email template.
- Detecting whether the QR was scanned or opened, and sending only when it was not. For now every registration gets the Email Foto.
- Transactional email services (Resend, Brevo) and a custom sending domain.
- Accounts, logins, or merging registrations into one customer record (ADR 0001).
- Changing how long photos are kept.
- UI tests for the admin pages.

## Further Notes

- Gmail allows roughly 500 messages a day from a normal account, which is enough for one booth. Creating an App Password requires 2-step verification on the booth's Gmail account.
- With Drive disabled, the download link only works on the booth's local network, so the strip attachment is the only reliable part of the email.
- The Indonesian personal data protection law (UU PDP No. 27/2022) gives customers the right to request deletion, which the "Hapus data registrasi" action covers.
- Revisit later: conditional sending based on QR scans, an editable template, and a transactional email service, if Gmail deliverability becomes a problem.
