# 07: Status Email Foto, kirim ulang, dan hapus data registrasi

**What to build:** In the session detail, the admin sees the Email Foto status for that session (menunggu, terkirim, gagal, tidak dikirim), with the reason when it failed or was skipped, the number of attempts and the sent time. Two actions are available:
- **Kirim ulang**, with an editable email field: queues a fresh send, using the corrected address when one is given and updating the registration email.
- **Hapus data registrasi**, after a confirmation: clears the name and email but keeps the session history, and stops any Email Foto that has not been sent yet.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Domain and data: deletion; Email Foto dispatcher: resend; Admin panel).

**Blocked by:** 05 (Email Foto terkirim), 06 (registrasi di halaman Sesi admin)

**Status:** ready-for-agent

- [ ] Admin session detail returns and shows delivery status, reason, attempts and sent time
- [ ] Resend endpoint resets the delivery to pending with attempts cleared; with an address it validates it and updates both the registration email and the recipient
- [ ] Delete endpoint clears registration name and email and the delivery recipient, and turns a pending delivery into skipped with reason "data dihapus"; the session row, photos and transactions stay
- [ ] Session detail page shows both actions, the resend email field, and a delete confirmation
- [ ] HTTP and dispatcher tests (isolated test schema, fake mailer) cover:
  - resend after failure;
  - resend to a corrected address;
  - resend after a successful send;
  - delete while pending (nothing is sent afterwards);
  - delete after sent
- [ ] Backend tests and admin build pass
