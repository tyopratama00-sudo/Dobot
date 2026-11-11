# 09: Nomor WhatsApp opsional dan tombol "Kirim via WhatsApp" di admin

**What to build:** A second, staff-sent backup channel for photos. On the registration screen the pelanggan may also type a WhatsApp number; it is optional, and name and email stay required. In the admin session detail, a staff member presses **Kirim via WhatsApp**. That opens WhatsApp (`https://wa.me/<number>?text=<message>`) in a new tab, with a ready message that the staff member sends by hand. No WhatsApp API is called and nothing is sent automatically.

Decisions (owner chose the semi-manual approach on 2026-11-11; the rest are defaults that can be changed):
- **Optional.** An empty number is fine. A non-empty number must be valid, and Lanjut stays disabled until it is fixed or cleared.
- **Normalisation:**
  - spaces, dashes, dots and parentheses are removed;
  - a leading `+` is dropped;
  - `0` at the start becomes `62` (`0812…` becomes `62812…`);
  - the result must be digits only, start with a non-zero country code, and be 10-15 digits long.

  The booth and the backend apply the same rule; the backend is authoritative.
- **Storage:** stored on the session next to the registration name and email (ADR 0001: no customer table). "Hapus data registrasi" clears it too.
- **Admin session list:** the existing search also matches the WhatsApp number. The list shows no extra column.
- **Admin session detail:** shows the number in the "Registrasi & Email Foto" card, plus the button **Kirim via WhatsApp**.
  - **Enabled** only when the session has a number **and** a Drive folder link. Without Drive, the download link only works on the booth's local network, so it is useless over WhatsApp.
  - **Disabled** otherwise, with the reason shown ("Belum ada nomor WhatsApp" / "Link foto belum tersedia (Google Drive)").
- **Message text** (Indonesian):

  > Halo <nama>, ini foto kamu dari <nama booth> 📸 <link folder> Link berlaku sampai <tanggal kedaluwarsa>.

  The booth name uses the same source as the Email Foto sender name. The backend builds the full `wa.me` URL and returns it in the admin session detail, so it is testable.
- **Booth explanation text** on the registration screen also mentions WhatsApp. For example: email and WhatsApp are only used to send this session's photos (WhatsApp by staff, if needed), as a backup if the pelanggan forgets to scan the QR, and are kept as a visit record.
- **No WhatsApp delivery status or tracking.** The QR-screen "Ubah email" dialog is unchanged and does not edit the WhatsApp number.

Spec: `.scratch/registrasi-pelanggan/spec.md`. Glossary: `GLOSSARY.md` (Registrasi now includes an optional WhatsApp number).

**Blocked by:** None (tickets 01-08 are merged)

**Status:** resolved — selesai di df7521b (merge dcd2cde)

- [ ] Session has a WhatsApp field (idempotent boot migration). The registration endpoint accepts an optional `whatsapp`, normalises and validates it (400 on invalid), stores it, and returns it.
- [ ] Re-saving the registration without `whatsapp` behaves consistently. Document whether it keeps or clears the stored number, and make the booth send it explicitly.
- [ ] "Hapus data registrasi" clears the WhatsApp number.
- [ ] The admin session search matches the number (with or without the `62`/`0` prefix variants, as far as practical).
- [ ] The admin session detail returns the number and a `whatsapp_link`, which is null when there is no number or no Drive link, plus the reason. The card shows the number and the button, or the disabled reason.
- [ ] Booth registration screen: an optional "No. WhatsApp (opsional)" field typed with the on-screen keyboard. Validation mirrors the backend. The explanation text mentions WhatsApp.
- [ ] Shared booth/admin types and the zod schema are updated.
- [ ] Tests:
  - Go HTTP tests on the isolated test schema: normalisation and validation, storage, deletion, search, and the link (with and without number or Drive);
  - booth unit tests for the normalise/validate helper;
  - a booth flow test that the registration submit sends the number.
- [ ] Backend build, vet and filtered tests; booth and admin builds; tsc; vitest all pass.
