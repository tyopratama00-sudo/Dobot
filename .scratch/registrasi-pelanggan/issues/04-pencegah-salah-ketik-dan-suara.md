# 04: Pencegah salah ketik dan suara di layar registrasi

**What to build:** The registration screen helps the pelanggan get their email right and understand why it is asked:
- **Format check:** an invalid address shows a message and keeps Lanjut disabled.
- **Typo suggestion:** a mistyped common domain shows a one-tap suggestion such as "Maksudmu @gmail.com?".
- **Confirmation:** before continuing, the email is shown large ("Foto akan dikirim ke: …").
- **Explanation text:** under the form it says the email is only used to send this session's photos, as a backup if they forget to scan the QR, and is kept as a visit record. Pressing Lanjut counts as agreement; there is no checkbox.
- **Voice:** the robot speaks when the screen appears and when a likely typo is detected. Both clips are editable on the admin Audio page like the other screens.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Booth flow: email module, explanation text, voice clips).

**Blocked by:** 03 (registrasi di booth)

**Status:** ready-for-agent

- [ ] Pure email module: validation (local part, `@`, domain with a dot) and a domain suggestion for gmail.com, yahoo.com, yahoo.co.id, hotmail.com, outlook.com, icloud.com based on edit distance; no suggestion for correct or unknown domains
- [ ] The backend uses the same validation rule as the booth
- [ ] Registration screen shows the format message, the tappable suggestion, the large confirmation line and the explanation text
- [ ] New voice clip ids for "screen shown" and "likely typo" are in the audio script seed and appear on the admin Audio page
- [ ] Unit tests for the email module cover valid, invalid, suggested and not-suggested cases
- [ ] Browser end-to-end check (separate backend and booth on the `_test` database, robot pointed at an unreachable address, fake mailer) types a name and a mistyped email with the on-screen keyboard, accepts the suggestion, and reaches frame selection
- [ ] Booth tests, type check and build pass
