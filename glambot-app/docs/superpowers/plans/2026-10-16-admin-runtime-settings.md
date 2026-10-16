# Admin Runtime Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Admin control all operational settings defined in code, persisted by Go backend and consumed by booth/Dobot, excluding `.env` and secrets.

**Architecture:** Extend active Go settings API and store using code defaults, then add Admin forms for missing setting groups. Connect API output to booth and runtime services; report whether each update applied live or requires restart.

**Tech Stack:** Go, React, TypeScript, SQLite/PostgreSQL through existing DB layer, existing tests and dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-admin-runtime-settings-design.md`

## Global Constraints
- Code defaults seed Admin; `.env` and secrets remain outside Admin.
- Extend current Go-backed Admin; do not migrate to Fastify/Prisma.
- Backend validates and persists every setting group.
- Preserve current existing Admin settings and operational behavior.
- Mark restart-required changes accurately; do not silently claim live application.

## Review Focus
- Invalid/out-of-range or malformed DB overrides: service falls back safely; test settings-load recovery.
- Dobot offline during save: value persists and restart/startup can load it; test forwarding failure response and persisted state.
- Booth/Admin/backend running mismatched revisions or unavailable API: display actionable error; test API failure handling.
- Setting reset with partial overrides: restore only selected code defaults; test reset preservation of other groups.
- Hardware-affecting changes while a session/device is busy: defer or reject rather than disrupt session; test safe-apply policy.

---

### Task 1: Establish Go settings registry and persistence

**Files:**
- Modify: `backend/handlers/config.go`
- Modify: `backend/routes/routes.go`
- Test: existing Go handler/config tests; add focused settings API tests under `backend/handlers/`

**Interfaces:**
- Produces authenticated `GET/PATCH/DELETE /api/admin/runtime-settings` contract with grouped code-default settings, saved overrides, and per-group apply mode.
- Existing `/api/admin/settings` and `/api/admin/robot-settings` remain compatible during migration.

- [ ] Add failing handler tests for default response, partial update, invalid setting, selected-group reset, and preserving unrelated settings.
- [ ] Run focused Go tests; confirm expected failures.
- [ ] Implement registry of supported runtime settings, code defaults, bounds/schema validation, DB persistence, and reset behavior using existing app-settings patterns.
- [ ] Register authenticated routes and keep old endpoints functional.
- [ ] Run focused Go tests; confirm pass.

### Task 2: Apply backend runtime settings to booth and hardware services

**Files:**
- Modify: `backend/handlers/config.go`, `backend/handlers/robot_settings.go`
- Modify: `backend/handlers/session.go`, `backend/handlers/photo.go`, `backend/handlers/robot.go` as required by settings usage
- Modify: `frontend/apps/booth/src/api/client.ts` and relevant runtime consumers only where API contract currently differs
- Test: Go backend integration tests and booth config tests

**Interfaces:**
- Consumes Task 1 runtime-settings registry and persisted values.
- Public booth config returns effective values plus no secrets.
- Dobot settings endpoint returns effective code defaults plus Admin overrides, excluding `.env`-only values.

- [ ] Add failing tests proving Admin overrides reach public booth configuration and Dobot configuration after reload.
- [ ] Run tests; confirm expected failures.
- [ ] Wire session, camera, printer, gallery, payment, branding, and angle values to existing runtime consumers; classify each as live-safe or restart-required.
- [ ] Ensure Dobot startup fetch and live-forward behavior use effective Admin settings, while retaining `.env` only for excluded connection/secrets configuration.
- [ ] Run Go tests, booth typecheck, and focused tests; confirm pass.

### Task 3: Add Admin controls for all runtime settings

**Files:**
- Modify: `frontend/apps/admin/src/pages/Settings.tsx`
- Modify: `frontend/apps/admin/src/App.tsx` only if navigation needs grouping
- Modify: `frontend/apps/admin/src/api.ts` only if response typing requires it
- Test: Admin settings tests under `frontend/apps/admin/src/`

**Interfaces:**
- Consumes `GET/PATCH/DELETE /api/admin/runtime-settings` from Task 1.
- Each settings group displays current effective value, code default, override state, validation, save/reset actions, and live/restart-required status.

- [ ] Add failing UI tests for loading defaults/overrides, saving valid values, rejecting invalid values, resetting one group, and displaying restart-required state.
- [ ] Run Admin test command; confirm expected failures.
- [ ] Implement grouped forms for all scoped code-defined settings not already managed by Packages, Frames, Vouchers, Audio, or existing Timer/Robot controls. Do not duplicate existing controls.
- [ ] Run Admin tests and typecheck; confirm pass.

### Task 4: End-to-end verification and compatibility

**Files:**
- Modify tests only where integration coverage is missing.

- [ ] Add/run end-to-end checks: Admin update → DB persistence → public booth config → service restart reload → Dobot endpoint forwarding.
- [ ] Verify offline Dobot save retains value and clearly reports non-live application.
- [ ] Run full Go tests, frontend typecheck, unit tests, and booth/Admin builds.
- [ ] Review legacy endpoint compatibility and confirm `.env`/secret fields never appear in Admin API responses.
