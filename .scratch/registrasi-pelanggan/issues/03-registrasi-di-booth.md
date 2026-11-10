# 03: Registrasi di booth (nama dan email)

**What to build:** An admin turns on **Registrasi pelanggan** in Pengaturan. The switch refuses to turn on while email is not configured. From then on, after the paid ticket (or after MULAI FOTO in free mode), the pelanggan sees a registration screen and types their name and email on an on-screen keyboard. Pressing Lanjut saves the **Registrasi** on the session and continues to frame selection.

The behaviour around the screen:
- **Switch off:** the screen is skipped and the flow is the same as today.
- **Timeout:** after the admin-set time (default 120 seconds, with the usual warning), the session continues to frame selection without a registration.
- **Reload:** reloading the booth during registration returns to the registration screen.

There is no skip button.

Typo help, the confirmation display, the explanation text and voice clips come in ticket 04. This ticket only needs a basic non-empty check plus the shared email format rule on the backend.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Domain and data; Settings and configuration; Booth flow). Data shape follows ADR 0001.

**Blocked by:** 02 (pengirim email Gmail)

**Status:** ready-for-agent

- [ ] Session stores registration name, email and registration time (idempotent boot migration); there is no customer or account table
- [ ] The registration is attached to the backend session that was actually paid, or to the confirmed free session
- [ ] New setting "registration enabled" (default off); the admin settings endpoint rejects enabling it while email is not configured, with a clear message
- [ ] New timer `registrationSeconds` (default 120) is part of the timer settings and editable on the Pengaturan page
- [ ] Public booth config exposes registration as enabled only when the setting is on and email is configured
- [ ] Public endpoint saves or updates a session's registration; it validates both fields (name non-empty, valid email format) and refuses expired sessions
- [ ] Shared session state machine has a REGISTRATION state between PAYMENT_SUCCESS and FRAME_SELECTION, with submit and timeout transitions to frame selection
- [ ] Reusable on-screen keyboard: lowercase letters with Shift, digits, space, backspace, `@ . _ -`, and shortcut keys `@gmail.com`, `@yahoo.com`, `.com`; tapping a field selects which one is being typed
- [ ] Registration screen: Lanjut is disabled until both fields pass the basic check; there is no skip button
- [ ] Timeout continues to frame selection without saving
- [ ] Restoring a saved booth session that was in REGISTRATION shows the registration screen
- [ ] HTTP tests on the isolated test schema cover saving, updating, rejection of invalid data, rejection after expiry, the switch refusing without email, and the public config value
- [ ] Booth flow tests (API mocked) cover paid and free sessions entering registration, switch off skipping it, submit, timeout, and restore
- [ ] Shared state machine tests cover the new transitions
- [ ] Backend and booth tests, type check and builds pass
