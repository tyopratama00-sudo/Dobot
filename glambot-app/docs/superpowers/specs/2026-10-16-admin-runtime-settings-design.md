# Admin Runtime Settings

## Intent
Make Admin the control surface for operational settings currently defined in code, with Go backend as persisted source of truth for booth and Dobot runtime. Keep `.env` and secrets outside Admin.

## Goals
- Expose operational settings in current Go-backed Admin, seeded from current code defaults.
- Persist and validate changes in backend; booth and connected services use those values at startup.
- Apply changes live only where current runtime supports safe reconfiguration; otherwise identify restart requirement.
- Keep existing package/frame/voucher/audio/timer/robot controls and behavior.

## Non-goals
- Do not migrate active Admin to Fastify/Prisma or change launcher/backend architecture.
- Do not expose `.env`, credentials, secrets, or device connection secrets.
- Do not make reports, history, account, or device health probes into settings.

## Constraints
- Use current repository code defaults as initial values; do not use `.env` values as Admin defaults.
- Go backend owns validation and persistence; admin forms are not the trust boundary.
- No new dependencies unless existing stack cannot support required behavior.
- Preserve current operational paths and existing settings.

## Settings scope
- Existing Admin controls remain: package/pricing/free mode, frames, vouchers, audio, page timeouts, robot tuning.
- Add missing code-defined controls for session capture parameters, camera behavior, printer behavior, gallery expiration, payment expiry, branding, and robot angle/preset definitions where they are runtime configurable.
- Explicitly classify each setting as live-applied or restart-required; do not claim successful live application when downstream service is unavailable.

## Acceptance
- Admin can read defaults, see current override state, edit, validate, persist, and reset each in-scope settings group.
- Backend and booth/Dobot read the same persisted values after restart.
- Live-safe updates take effect without restart; other updates report restart need.
- Invalid, missing, or malformed persisted values cannot prevent service startup; fall back to code defaults.
- Integration tests cover settings API, persistence/reset, booth config delivery, and Dobot forwarding.
