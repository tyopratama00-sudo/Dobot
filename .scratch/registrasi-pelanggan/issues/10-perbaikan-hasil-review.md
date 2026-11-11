# 10: Perbaikan hasil code review

**What to build:** Fix the findings of the two-axis code review of `feat/registrasi-pelanggan` (since `0ed858f`). Behaviour fixes A–E come first; F–H and the cleanups follow if budget allows.

A previous attempt was cut off and left **uncommitted** work in the worktree `.claude/worktrees/agent-a9e931c04cd0b7ba8` (branch `fix/review-registrasi`, based on `39cbc66`, older than the integration tip). Review it and reuse what is right, or discard it and start clean on `feat/registrasi-pelanggan`. That worktree predates several later commits:
- live registration switch;
- no-photo apology;
- frame name order;
- photo pose fix;
- WhatsApp (ticket 09).

Expect conflicts in booth `flow.ts` / `api/client.ts` if you reuse it.

**Blocked by:** None

**Status:** resolved — selesai di 4c670f1 (A–E) + 18aa78e (F–H, cleanups), langsung di feat/registrasi-pelanggan

## Safety (mandatory)
- **Real database.** Never run `go test ./handlers` or `./...` without `-run`: `TestFreeModeRoundTrip` and `admin_extra_test.go` use `testDB(t)`, which writes to the real booth DB.
- **Test database.** Only run tests built on `dbtest.Schema(t)`, with `TEST_DATABASE_URL` set to the `.env` DATABASE_URL with its path changed to `/photobooth_test`. Derive it with node, without printing it.
- **Safe filter.** The safe `-run` filter so far is:
  `WhatsApp|FrameOrder|AudioSeeds|ValidAddress|EmailFoto|AdminRegistration|Registration|Email|Fresh|AdminZero|FreeModeSurvives|FreeModeBefore|CreateSession|RestartHeals|RestartKeeps|StatusTransition`
- **No outside services.** Never contact Gmail, Midtrans or the real robot from tests. Never print secrets.
- **Line endings.** Many files are CRLF; keep each file's line endings.

## Behaviour fixes (priority)
- [x] **A. Email Foto no-strip rule fires while the session is still in progress.** The dispatcher sends link-only or marks the delivery skipped after 10 minutes without a strip, even when the pelanggan is only idle on frame, pick or edit. The strip that arrives later is then never sent.
  - Fix: apply the no-strip rules only once the session is really over.
  - Suggested signal: the booth heartbeat already reports the current `sessionId`. Treat the session as active while a recent heartbeat (for example under 2 minutes) names it.
- [x] **B. "Hapus data registrasi" is not atomic and can race the dispatcher.** A dispatcher round that already loaded the recipient still sends.
  - Fix: do the delete in one transaction.
  - Make the dispatcher claim or lock the delivery row and re-check the recipient before sending, so a delete or email change that commits first always wins.
- [x] **C. A deleted registration comes back.** The booth QR "Ubah email" (any registration PUT) re-creates the registration and queues a send.
  - Fix: add an explicit "registration deleted" marker on the session, and refuse registration updates once it is set.
  - The booth shows a friendly message.
  - The marker also replaces the admin UI's guess from empty name and email.
- [x] **D. Kirim ulang creates registrations.** It works on sessions that never registered, or whose data was deleted, through `COALESCE(registered_at, NOW())`.
  - Fix: allow it only for sessions with a registration that was not deleted.
- [x] **E. `ResendEmailFoto` checks status and expiry outside its transaction.** Do the check under the row lock.

## Smaller fixes
- [x] **F. Wrong skip reason.** With Drive off, no strip, but raw photos present, the reason says "tidak ada foto". Use an accurate one, such as "tidak ada yang bisa dikirim: strip belum jadi dan Drive tidak aktif".
- [x] **G. `SMTP_FROM_NAME` has no effect on Email Foto.** The sender name should be `SMTP_FROM_NAME` when set, else the admin brand label, else "Glambot Photo Booth". Keep the WhatsApp message's booth name consistent, and document it.
- [x] **H. Pengaturan shows the stored switch, not the effective one.** When the registration switch is on but email is not configured, show a warning that registration is hidden from the booth.
  - Already in place since d3ae0a1: Settings shows "Email belum diatur: layar registrasi tidak tampil di booth." No change needed.

## Cleanups (judgement calls)
- [x] One Go helper for email normalisation and validation (registration, admin resend, `ResendEmailFoto`), and one source for the 80/254 limits on each side (TS module shared by the zod schema, `Register.tsx` and `EmailChange.tsx`).
- [x] Use the Email Foto status constants and `models.StatusExpired` instead of raw strings. Reuse the "photos gone" reason constant in `services/cleanup.go`, avoiding an import cycle.
- [x] Rename the booth `registrationOn` / `BoothConfig.registration` boolean to one clear name, so it no longer collides with `SessionSnapshot.registration`.
- [x] Replace "customer" with "pelanggan" in new comments and test names (GLOSSARY.md). Fix the stale "(later) the QR screen" comment in booth `email.ts`.
- [x] Share the mocked `ApiError` across booth test files if it fits.

## Done when
- [x] Every behaviour fix has a test that failed first.
- [x] Backend build and vet pass; the safe filtered Go tests, mailer, routes and services pass.
- [x] Vitest, tsc, and the booth and admin builds pass.
- [x] The work is committed on `feat/registrasi-pelanggan`, or merged into it.
