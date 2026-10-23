# SchoolSphere: project status

Last updated: 2026-10-22

See [README.md](README.md) for architecture, setup, deployment and security. This file tracks what is done, how it was verified, and what is still open.

## Verification
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (Vitest, unit + integration on PGlite with RLS enforced) | **99 / 99 passing**, 8 files |
| `npm run test:e2e` (Playwright: 9 desktop journeys + 1 mobile) | **10 / 10 passing** against the dev server with the demo seed |
| `npm run build` | succeeds (all app routes dynamic; marketing page static) |
| HTTP smoke test as every role on every page | expected 200 / 307 / 403 / 404 for each route |
| Manual browser checks | landing page, admin dashboard, attendance save, and the e2e journeys above |

Not verified (no credentials or accounts available while building):
- the Supabase Auth provider, Supabase Storage driver and the `postgres` driver against a live Supabase project;
- a live Razorpay checkout and webhook (the signature and webhook verification code is unit-tested with test secrets);
- real email, WhatsApp and push delivery (their providers stay off unless configured);
- live Anthropic or OpenAI calls (the template fallbacks are tested).

## Done
- **Foundation:**
  - 11 migrations with RLS on every table, composite tenant foreign keys, an append-only audit log, a deferred-constraint payments ledger, views, and aggregate-only functions for exam statistics and platform metrics;
  - a Supabase compatibility layer for PGlite and plain Postgres;
  - a migration runner and seed CLI.
- **Auth and onboarding:**
  - local provider (scrypt, revocable sessions, lockout) and Supabase provider;
  - one-click demo sign-in in demo mode only;
  - password reset, invitations, role switching and the proxy guard;
  - onboarding wizard (`/app/setup`) and platform console (`/platform`: onboard a school, invite its principal, demo requests, aggregate metrics).
- **Administration:**
  - students: admission, edit, status changes, guardian verification and invites, CSV import with validation, CSV exports with formula-injection protection, promotion;
  - staff, academic years and terms, classes and sections, subjects, teacher assignments, calendar, timetable;
  - settings: profile and branding, attendance policy, grade scales, users, integrations status, audit log viewer.
- **Attendance:** register, corrections with a reason and history, monthly report, export, parent calendar, and a dashboard alert for unmarked sections.
- **Homework:** assignments with uploads, submissions, grading, return for changes, extensions, reminders.
- **Exams:**
  - creation, marks entry, publication, correction audit, results;
  - printable report card;
  - class statistics computed as aggregates only;
  - AI-drafted remarks that require approval.
- **Fees:**
  - fee structures, billing, discounts, counter payments, sequential receipts, voiding, dues, reminders, reports and reconciliation;
  - parent online checkout through a Razorpay provider with signature and webhook verification and idempotent capture;
  - a clearly labelled sandbox for demo schools only.
- **Transport:**
  - fleet, devices with hashed tokens, a route and stop map editor, student assignment, trips;
  - telemetry API, live map with ETA, delay and deviation alerts;
  - driver screen with phone GPS, minimal driver manifest, labelled simulator, reports.
- **Activities:** registration, session attendance, achievements with verification and certificates, development portfolio.
- **Communication:** announcements with audience fan-out, in-app notifications with per-type channel preferences, and email/WhatsApp/push provider boundaries with a delivery log.
- **AI assistant:**
  - Anthropic (`claude-opus-5-5`) and OpenAI providers, with template fallbacks;
  - features: worksheets, circulars, class trends, weekly student summaries, report explanations, record questions;
  - pseudonymisation, every output stored in `ai_generations`.
- **Experience:**
  - dashboards for all 7 school roles;
  - landing page with modules, pricing placeholders, FAQ and a demo request form (honeypot and rate limit);
  - profile, reports hub, PWA manifest and icons;
  - mobile layout checked by e2e.
- **Docs:** README, `.env.example` and this file.

## Fixed in the final pass
- **Forms rejected blank optional fields.** The client sent the Zod-transformed output to the server actions, and the server parsed it again, so `""` became `null` on the first pass and was rejected on the second. This affected admission, guardians, homework, transport, settings and other forms. `useActionForm` now validates on the client and sends the raw form values; the server remains the authoritative parser. The e2e admission journey found this bug.

## Remaining
1. Tamil (ta-IN) interface translation. The language preference is stored, but the strings are English only.
2. Web Push: VAPID keys, subscription storage and a service worker. The provider boundary exists.
3. Replace live-trip polling with Supabase Realtime. The polling endpoint is already the single authorization point.
4. Validate against live services: Supabase project (auth, storage, `db push`), Razorpay test mode end to end, a Resend/WhatsApp sandbox, and a hardware GPS device.
5. Production hardening:
   - a shared rate-limit store (rate limits are currently per process);
   - timetable conflict checks beyond teacher double-booking;
   - an approved WhatsApp template;
   - a scheduled job for fee reminders (currently started manually from the dues page).
6. Wider e2e coverage: homework submission and grading, exam publication, activity registration, invitation acceptance.

## How to run
```
npm install
cp .env.example .env.local   # set AUTH_SECRET and DEMO_USER_PASSWORD
npm run db:reset             # PGlite: migrate + seed (stop the dev server first)
npm run dev
npm test
E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # then npm run db:reset for pristine data
```
