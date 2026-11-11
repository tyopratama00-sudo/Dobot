# 01: Perbaiki waktu habis layar QR dan layar terima kasih

**What to build:** When the QR screen's timer runs out, the session finishes and the booth shows the thanks screen. When the thanks screen's timer runs out, the booth returns to the welcome screen. An earlier code reading suggests neither happens today: the timeout action for QR_READY and FINISHED resolves to an invalid transition, so the QR timer just restarts. Confirm this first. Fix it only if it is confirmed, and report what was found either way. The QR screen will later hold the "Ubah email" button, so its timer must behave correctly first.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Booth flow, last decision).

**Blocked by:** None (can start immediately)

**Status:** resolved — selesai di 363863f (merge eae9f00)

- [ ] A booth flow test reproduces the bug (QR timeout does not reach FINISHED), or the ticket reports that the bug does not exist
- [ ] QR screen timeout moves the session to FINISHED (thanks screen)
- [ ] Thanks screen timeout returns the booth to the welcome screen with no session
- [ ] The existing selection, frame, pick, edit and final-preview timeout behaviour is unchanged (existing timeout tests still pass)
- [ ] Booth unit tests, type check and build pass
