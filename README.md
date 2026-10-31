# Knightfall Arena

Chess esports event management built with **Next.js 16, React 19, TypeScript, Supabase Auth/PostgreSQL and Razorpay**, targeting **Vercel / Node.js 22+**. Based on `codex/premium-arena-design` at `ed9327b` and retaining its gold and midnight visual design.

Chess.com hosts games, pairings and clocks. Knightfall manages discovery, eligibility, entries, checkout, check-in, reviewed standings, community and administration.

## Try the demo

```sh
npm ci
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Open `http://localhost:3000`. Use **Join the arena → Explore as a demo player**, or **Join the arena → Explore as a demo admin**. Demo activity lives in browser localStorage; entries, payments, standings and player counts are illustrative. Live account mutations are rejected in demo mode. Demo builds are excluded from search indexing.

For a production-mode demo preview:

```sh
NEXT_PUBLIC_DEMO_MODE=true npm run build
NEXT_PUBLIC_DEMO_MODE=true npm start
```

## Deploy the live application

Follow [the deployment runbook](docs/DEPLOYMENT.md). Copy `.env.example` to `.env.local` for local live development, and set environment variables directly in your hosting provider for deployment. **Do not commit service keys.** Public variables are baked into the browser bundle; rebuild after changing them.

1. Create a Supabase project. For a new database run `supabase/schema.sql`. For an existing database, back it up and apply the pending migrations in order: `20261031000000_production_hardening.sql`, then `20261031010000_identity_controls.sql`. If release 1.1.0 is already installed, apply only the identity-controls migration.
2. Configure Supabase email confirmations, production SMTP, TOTP MFA, password policy, rate limits and redirect URLs.
3. Configure a server-only `AUTH_COOKIE_SECRET` with at least 32 random characters. In Supabase Auth, configure Google, Microsoft (Azure) and Discord using your provider client IDs/secrets and callback URLs, then enable the desired methods in **Settings → Sign-in & accounts**. Email/password is enabled by default; social providers start disabled.
4. Sign up and verify your first administrator. Assign the initial role in the SQL editor using that account's actual auth UUID:

   ```sql
   update public.profiles set role = 'ADMIN' where id = 'YOUR-AUTH-USER-UUID';
   ```

5. Sign in, set up and verify an authenticator, then open the studio. Fill in operator identity, support email, jurisdiction/contact address and retention review period in **Settings**. Paid events cannot be published until operator details are set.
6. Configure Razorpay test keys and the signed webhook. Complete the provider acceptance checks in the runbook before using live keys.
7. Import this repository into Vercel with the Next.js preset, Node 22+, `npm ci` and `npm run build`. Set `NEXT_PUBLIC_DEMO_MODE=false` and your canonical HTTPS domain. Leave the output directory at its default.
8. Configure the optional authenticated maintenance scheduler for reminders and expired-hold cleanup. Deploy and perform live acceptance checks.

`npm run check:production` rejects demo mode, missing live configuration, insecure domain values, incomplete payment credentials and weak scheduler/webhook secrets. `npm run build` runs configuration validation automatically. No configured provider accounts are present in this execution environment; a passing demo build does not verify live payments, email, MFA delivery or deployment.

## Features

- Responsive tournament catalog, filters, sorting, saved events, rules, participants, calendar downloads, reviewed standings and event discussions.
- Separate website identities and Chess.com players; registrations may be submitted with a player's permission. Public Chess.com profile/rating/account-age checks and case-insensitive duplicate prevention.
- Row-locked capacity reservations, free/paid entries, approval, check-in, withdrawal, recorded rules acceptance and notifications.
- Server-created Razorpay orders, captured-payment verification, signed exact-body webhooks, permanent order ledger, late-payment recovery and full refunds.
- Email/password, Google, Microsoft and Discord login with server-controlled enable/disable switches, a global new-sign-in switch and a separate new-account switch. OAuth uses PKCE, encrypted flow cookies and one-use handoffs; the provider token is verified against the selected provider.
- Admin links and the `/admin` workspace/API are visible/available only to ADMIN accounts. Direct private database reads also require an application-authorized session. Existing users must sign in once after applying the identity-controls migration.
- Authenticator setup and verification. All organizer/admin API operations require a verified AAL2 session; trusted roles come from the database.
- Searchable, paginated tournament, registration, refund, user, moderation, report and audit management; per-event CSV exports up to 10,000 historical entries (larger histories require a database export).
- Confirmed role changes and suspensions, ownership-scoped organizer access, reversible post hiding/locking, reply review and deletion, report resolution and transactional audit records.
- Transactional tournament edits with stale-version protection, immutable entry fees after registrations start, guarded eligibility changes and lifecycle transitions.
- Tournament cancellation withdraws active entries, queues full refunds and notifies each affected website account once. Cancelled/completed/archived events cannot reopen.
- Persistent operator settings, announcements, registration/community pause switches, legal contact details and retention review information.
- Optional scheduled in-app day-before/check-in reminders, expired payment holds and rate-limit cleanup. These require a configured scheduler; they do not send email.
- Nonce-based CSP, HSTS and other security headers, no-store API responses, bounded JSON/webhook bodies, origin checks, distributed rate limiting and redacted error correlation IDs.
- CI runs type checks, unit/API/PostgreSQL tests, dependency audit, production demo build and desktop/mobile browser regression checks.

## Payments and refunds

Automatic capture must be enabled in Razorpay. Subscribe `/api/payments/webhook` to `payment.captured` and `refund.processed`. The browser cannot choose prices or declare a payment successful. Captured amounts/currency/order identity are checked server-side.

Unpaid holds expire after 15 minutes. A late captured payment is queued for refund without overwriting a newer entry. Callback and webhook confirmations share an idempotent database transaction. Refund requests are claimed in the database before contacting Razorpay and use a stable `X-Refund-Idempotency` key. After an interruption, wait two minutes and use **Issue / check full refund** to reconcile or retry. Processed callbacks update the order, matching registration, counts, notification and audit log atomically. Partial refunds and automated prize payouts are not implemented.

## Admin and event operations

Users cannot assign themselves roles. Administrators cannot change their own access. Suspended accounts are rejected by the API and cannot directly read private records through RLS. The admin workspace and its collection/export/settings endpoints require ADMIN. The legacy ORGANIZER role retains ownership-scoped event mutation APIs but has no admin navigation or workspace access. Admin access is verified on every request.

Editors save the version they loaded; stale edits must be reloaded. Existing fees cannot change after entries begin. Eligibility and time control cannot change with active entries. Publish a new event for a different competition. Use **Cancel event** to notify players and queue refunds. Closing registration alone does not cancel entries.

For live standings, close registration first and import only approved/checked-in participants. Names normalize to lower case. Imports and audit records commit together.

```csv
username,score,wins,draws,losses,tiebreak
registered_player,6.5,6,1,0,30
```

Chess.com does not provide a public tournament write API. Organizers supply the real HTTPS lobby URL and import reviewed results. No remote tournament creation, player account login, automatic standings synchronization or proprietary cheat detection is claimed. Classical eligibility uses the available Chess.com rapid rating.

The tournament editor includes **Minimum Chess.com account age (days)**. A value of 0 removes the age minimum; otherwise the player’s Chess.com join date is checked at registration by both the API and database. This refers to the player account, not the website account.

Displayed event times use Asia/Kolkata (IST); editor inputs use the organizer's browser timezone and are stored in UTC.

## Checks

```sh
npm run typecheck
npm test
npm audit --audit-level=moderate
NEXT_PUBLIC_DEMO_MODE=true npm run build
```

With the demo server running:

```sh
npx playwright install chromium
npm run test:browser
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an existing Chromium binary. `TEST_BASE_URL` overrides the browser target. Browser tests are for isolated demo environments. Temporary outputs go to ignored `work/`.

The PostgreSQL suites use PGlite with an isolated Supabase auth-schema shim, including a rerunnable upgrade migration. API tests mock the provider boundary to verify authorization and request controls. Neither replaces acceptance testing against your actual Supabase/Razorpay tenant. See [VALIDATION.md](VALIDATION.md) and [the security review](SECURITY.md).

## Optional staging templates

Create an active ORGANIZER or ADMIN profile, set `SEED_ORGANIZER_ID` to its UUID, then `npm run seed`. Templates are inserted as drafts, without fabricated live counts or shared passwords. Review dates, eligibility, prizes, policies and lobbies before publishing.

## Source layout

```text
src/app/                  Routes, metadata, public API and security headers
src/components/           Player experience, MFA and admin management
src/lib/                  Validation, server authorization, HTTP and CSV helpers
src/proxy.ts              Per-request CSP nonce, request ID and private API caching
supabase/schema.sql       Fresh database installation
supabase/migrations/      Existing-database upgrade
scripts/                  Seed and release-configuration validation
tests/                   Unit, API, SQL and browser regression checks
```

The artwork is included as optimized WebP in `public/art/`. Self-hosted fonts carry their SIL Open Font License files in `public/fonts/`.
