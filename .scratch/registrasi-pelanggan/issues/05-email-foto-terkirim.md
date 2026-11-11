# 05: Email Foto terkirim otomatis

**What to build:** After a session with a **Registrasi**, the pelanggan receives the **Email Foto** from the booth's name, whether or not they scanned the QR. The email contains:
- a greeting with their name;
- the photo folder link and how long it stays available (about 3 days, from the session's expiry);
- the final strip attached.

Temporary failures are retried until the session's photos are deleted, then marked failed. No email is ever sent after the photos are gone.

The readiness rules:

| Situation | Action |
|---|---|
| Drive enabled and every file uploaded | Send link plus strip |
| 10 minutes after the session completed, Drive not finished, failed or disabled | Send strip only, with a note that the link is unavailable |
| No strip, raw photos exist, Drive link exists, 10 minutes with no new photo | Send link only |
| No strip and no link, or no photos | Mark skipped ("tidak ada foto") |

Spec: `.scratch/registrasi-pelanggan/spec.md` (Domain and data: delivery record; Email Foto dispatcher).

**Blocked by:** 02 (pengirim email Gmail), 03 (registrasi di booth)

**Status:** resolved — selesai di 6949fb9 + 68c4fc0 (merge 80897bd)

- [ ] Each session with a registration gets a delivery record:
  - recipient, status (pending, sent, failed, skipped);
  - what was sent (link plus strip, strip only, link only);
  - attempts and next-attempt time;
  - last error or skip reason, and sent time
- [ ] A dispatcher step runs every minute on a periodic job; one run takes the current time as input
- [ ] The readiness rules in the table above are applied
- [ ] Retry delays grow (about 1, 5, 15 minutes, then hourly) until the session's expiry, then the record becomes failed with the last error; a permanent rejection of the address fails immediately
- [ ] The expiry cleanup keeps registration fields and turns a still-pending delivery into failed
- [ ] Template:
  - subject "Foto kamu dari <nama booth> 📸";
  - sender display name and booth name from the admin brand label, falling back to "Glambot Photo Booth";
  - Indonesian plain-text and HTML bodies;
  - greeting with the registered name, the link when available, the link-expiry note, and the strip attachment when available
- [ ] Dispatcher tests with a controlled clock and the fake mailer cover:
  - waiting for Drive;
  - strip only after 10 minutes;
  - link only without a strip;
  - skipped with no photos;
  - Drive disabled;
  - retry delays;
  - failed at expiry;
  - permanent rejection;
  - nothing sent after the photos are deleted
- [ ] Tests check the delivered message's recipient, subject, greeting name, link presence, link-expiry text and attachment through the fake mailer
- [ ] Backend build, vet and tests pass
