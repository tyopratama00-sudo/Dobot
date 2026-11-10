# 08: Email di layar QR dan tombol Ubah email

**What to build:** On the QR screen, a pelanggan who registered reads "Foto juga dikirim ke <email>", so they know their photos arrive even if they don't scan. An **Ubah email** button opens the same on-screen keyboard, with the same validation and typo suggestion. The effect of a correction depends on timing:
- **Before sending:** it changes where the Email Foto goes.
- **After sending:** it sends the email again to the new address.

Opening and saving the dialog restarts the QR screen timer. Sessions without a registration show neither the line nor the button.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Booth flow: QR screen; Email Foto dispatcher: email changed).

**Blocked by:** 01 (waktu habis layar QR), 03 (registrasi di booth), 05 (Email Foto terkirim)

**Status:** ready-for-agent

- [ ] QR screen shows the email line and the Ubah email button only when the session has a registration
- [ ] The dialog reuses the on-screen keyboard and the email module (validation and suggestion)
- [ ] Saving uses the registration endpoint:
  - a pending delivery gets the new recipient;
  - a sent delivery queues a new send to the new address
- [ ] Opening and saving the dialog restarts the QR timer; the QR timeout from ticket 01 still finishes the session
- [ ] Booth flow tests (API mocked) cover saving a new email from the QR screen and the timer restart
- [ ] Dispatcher tests (fake mailer) cover an email changed while pending and an email changed after sent
- [ ] Browser end-to-end check (separate backend and booth on the `_test` database, robot pointed at an unreachable address, fake mailer):
  - registration through to the QR screen;
  - the email line is visible;
  - Ubah email works
- [ ] Backend and booth tests, type check and builds pass
