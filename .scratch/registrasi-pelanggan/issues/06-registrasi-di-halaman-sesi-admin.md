# 06: Registrasi tampil di halaman Sesi admin

**What to build:** On the admin **Sesi** page, an admin sees name and email columns in the session list. They can find a session by typing part of a name or email into the existing search box. The session detail page shows a "Registrasi & Email Foto" section with name, email and registration time; the Email Foto status is added in ticket 07. Repeat visits with the same email stay separate sessions (ADR 0001). There is no export.

Spec: `.scratch/registrasi-pelanggan/spec.md` (Admin panel).

**Blocked by:** 03 (registrasi di booth)

**Status:** ready-for-agent

- [ ] Admin session list returns name and email, and the Sesi list shows them as columns
- [ ] The existing search matches session id, name or email (partial, case-insensitive)
- [ ] Admin session detail returns and shows the registration (name, email, registration time), or "belum registrasi" when there is none
- [ ] No CSV or other export of registrations is added
- [ ] HTTP tests on the isolated test schema cover the list fields, search by name, search by email, and the detail with and without a registration
- [ ] Backend tests and admin build pass
