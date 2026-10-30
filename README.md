# Knightfall Arena

A complete chess-event application built with **Next.js App Router, TypeScript, Supabase Auth/PostgreSQL, and Razorpay**, prepared for **Vercel**. Chess.com hosts every game; Knightfall manages the tournament experience around it.

[Desktop preview](docs/desktop-preview.png) · [Mobile preview](docs/mobile-preview.png) · [Verification record](VALIDATION.md)

## Run the included demo

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. No credentials are needed for demo mode. Select **Join the arena → Explore as a demo player**. For administration, open **Organizer studio → Explore the demo studio**.

Demo activity is stored in browser localStorage. Sample events, player counts, prize amounts, and standings are illustrative. A demo registration never charges money or joins a real Chess.com tournament. Clear the site's browser storage to reset the demo.

## What's included

- Responsive dark esports design, original vector artwork, keyboard focus states, accessible dialogs, mobile navigation, loading/error/empty states.
- Eight realistic sample tournaments; URL-persisted search, category/status/format/fee/rating/date filters, sorting and pagination.
- Tournament overview, public participants, rules, match-day schedule, organizer-imported standings and event-specific discussions.
- Website users separate from Chess.com players. Any authenticated user can submit an eligible player's entry with their permission.
- Public Chess.com profile/stat lookup, timeout handling, short-lived cache, account-age/rating validation and normalized username uniqueness.
- Supabase email/password signup/signin, verification, password recovery/reset, account settings, USER/ORGANIZER/ADMIN roles.
- Server-enforced registrations, row-locked capacity checks, duplicate prevention, manual/automatic approval, 30-minute check-in, withdrawals, calendar downloads and saved events.
- Razorpay server-created orders with database-authoritative amounts, signature verification, captured-payment checks, exact-body signed webhooks, idempotent confirmations, a permanent order ledger and full-refund workflows.
- Player dashboard, notifications, organizer tournament CRUD, registration CSV export, standings CSV import, refund queue, role management, community moderation and audit logs.
- Community posts, comments, reactions, reports, category filters, event-specific discussions, and locked threads.
- Help center, about page, fair-play guidelines, privacy, terms, and refund policy pages.
- PostgreSQL schema, seed script, environment template, Vercel configuration and automated tests.

## Connect Supabase

1. Create a Supabase project. Run **`supabase/schema.sql`** once in its SQL editor on a new database. It creates tables, RLS policies, triggers and server-only transactional RPCs.
2. Copy `.env.example` to `.env.local`. Add the project URL and anon/publishable-compatible key, and a server-only service-role key. Never put the service-role key in a `NEXT_PUBLIC_` variable.
3. Set `NEXT_PUBLIC_DEMO_MODE=false` for the live application. This is a build-time flag; rebuild after changing it. Demo and production data are intentionally separate.
4. In Supabase Auth, enable email/password, email confirmations, a production SMTP provider, and suitable authentication rate limits. Add your domain as Site URL and allow `/dashboard` and `/reset-password` redirect URLs, plus localhost for development. Configure Supabase CAPTCHA if required for your traffic profile.
5. Sign up normally and confirm your email. Grant the first administrator using the SQL editor, using **your actual auth user UUID**:

```sql
update public.profiles set role = 'ADMIN' where id = 'YOUR-AUTH-USER-UUID';
```

The initial profile trigger ignores roles in signup metadata. Subsequent role changes are available to admins in the studio. Never distribute a shared admin password.

### Optional staging seed

Create the organizer account through signup, grant ORGANIZER or ADMIN, add `SEED_ORGANIZER_ID=<that-profile-uuid>` to `.env.local`, then run:

```sh
npm run seed
```

Eight templates are inserted as **drafts**, with zero claimed registrations. Existing tournament rows are not overwritten. Sample counts and sample auth users are not copied to your production database. Review every date, prize distribution, contact detail, eligibility rule, and Chess.com lobby before publishing. Create real test accounts with separate emails for USER, ORGANIZER, and ADMIN when testing permissions.

## Configure Razorpay

Use Razorpay **test-mode** credentials first:

```text
RAZORPAY_KEY_ID=your_test_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_separate_webhook_secret
```

1. Enable automatic payment capture in Razorpay.
2. Add a webhook pointing to `https://YOUR-DOMAIN/api/payments/webhook`.
3. Subscribe to `payment.captured` and `refund.processed`. Set the webhook secret to match the server environment.
4. Complete an end-to-end test checkout and verify both callback and webhook delivery. Replay the webhook to confirm the entry and notification remain singular.
5. Test a closed/abandoned checkout, a late capture, withdrawal, organizer rejection and full refund.
6. Switch to live keys only after your Razorpay business account is activated and your operator/prize/policy details are complete.

Payment details stay with Razorpay. The browser never chooses the price. A server-verified `captured` payment is required for paid approval. Reserving an entry alone is not confirmation.

Unpaid holds last 15 minutes. Expired holds are excluded from capacity when the next reservation runs. An old captured payment has a permanent order record even if the player re-registers; it is added to **Organizer studio → Refunds**, without overwriting the newer entry. A callback failure can be recovered by the signed webhook. Refund requests stay pending until the webhook confirms processing. Refunds are full refunds; partial refunds are not implemented.

## Deploy to Vercel

1. Push the project to a repository you own, or import the source through your normal Vercel workflow.
2. Create a Vercel project with the **Next.js** framework preset. Node.js 22+, install `npm ci`, build `npm run build`; use the default output directory.
3. Add the variables from `.env.example` in Vercel's project settings. Set `NEXT_PUBLIC_SITE_URL` to your canonical HTTPS domain and `NEXT_PUBLIC_DEMO_MODE=false` for live mode.
4. Deploy. If using the CLI in your authenticated environment: `vercel --prod`.
5. Update Supabase redirect URLs and Razorpay's webhook to the resulting domain. Redeploy after any change to public variables.
6. Set a custom domain, verify HTTPS, and run the launch checks below.

`vercel.json` selects the Mumbai region for application functions. Match your Supabase region as appropriate for your account. Hosting, database and payment-service fees are paid through your own provider accounts.

**No live Vercel/Supabase/Razorpay resources were created in the build environment: no credentials were connected.** The source, SQL and integrations are implemented; external activation is still required.

## Chess.com workflow

Organizers create and administer the actual club tournament in Chess.com. Paste its HTTPS event/lobby URL in the tournament editor. Players must join that lobby themselves before play. Knightfall does not log into Chess.com accounts, create remote tournaments, join on behalf of players, or scrape authenticated pages. It uses only public read APIs.

Chess.com has no public write API for these operations. Pairings and clocks remain on Chess.com. Standings are imported by an organizer from reviewed results, not automatically synchronized. For Classical events, eligibility uses the available Chess.com rapid rating, as Chess.com does not provide a separate classical public rating field.

All displayed event times use Asia/Kolkata (IST). Editor date inputs use the organizer's browser timezone and are stored in UTC.

### Standings CSV

```csv
username,score,wins,draws,losses,tiebreak
tacticalrook,7,7,0,0,32
endgame_artist,6.5,6,1,0,30
```

The importer accepts this simple unquoted format, validates numeric fields and usernames, and upserts by event + player. Results sort by score then tie-break. Imported demo results are local to the browser.

## Architecture

```text
src/app/                 App Router layout, route dispatch, metadata and API
src/components/          Shared design system and feature views
src/lib/server.ts        Auth, role checks, rate limits, Chess.com and Razorpay
src/lib/validation.ts    Shared Zod schemas and eligibility rules
src/lib/types.ts         Domain models
src/lib/data.ts          Explicit demo fixtures and display formatting
src/lib/csv.ts           CSV import/export with spreadsheet-injection protection
supabase/schema.sql      Tables, RLS, permissions and transactional functions
scripts/seed.ts          Optional staging templates
tests/                  Unit, validation and PostgreSQL integration checks
```

Supabase replaces the separate Prisma/Auth.js layers so authentication, database permissions and hosted PostgreSQL share one coherent setup. Direct browser writes have no RLS policy; sensitive changes go through server routes, authenticate a Supabase bearer token with `getUser`, and read the trusted role from `profiles`. User/organizer IDs from the browser never establish authority.

The database serializes reservations, payment confirmations and registration transitions by locking the tournament row. A case-insensitive generated username column and event/player unique constraint prevent duplicate entries. SQL SECURITY DEFINER functions are revoked from public, anon and authenticated roles, and granted only to service_role. Community bodies render as text rather than raw HTML.

Production rate limits use a PostgreSQL counter, so limits survive serverless cold starts. Supabase handles auth endpoint limits; configure those in its dashboard. The demo-only public Chess.com lookup uses a bounded in-memory counter.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

For browser checks, run the application in another terminal, then:

```sh
npx playwright install chromium
npm run test:browser
```

Browser checks use a fresh isolated profile and only demo data. They cover registration, persistence, duplicates, filters, community, organizer editing/imports, mobile layouts and anonymous API rejection. Run against demo mode; `TEST_BASE_URL` optionally changes the target. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects an existing Chromium binary. Screenshots and temporary artifacts go into ignored `work/`.

The database suite runs real PostgreSQL semantics in PGlite, with an isolated Supabase auth-schema shim. It covers RLS, role restrictions, unique constraints, eligibility, capacity, payment amounts, webhook/callback idempotence, late captures and withdrawal transitions. The migration is run from scratch in tests; the unused `pgcrypto` extension declaration is skipped in the embedded runner because `gen_random_uuid` is built in. Run the unmodified schema on Supabase.

## Launch checks and operational details

- Replace the demo brand/operator placeholders as needed; publish legal entity, contact/support, jurisdiction, consent/age rules, retention schedule and actual event prize distribution before taking real entries.
- Set support email in the admin settings. Verify email verification and password recovery against your SMTP setup.
- Test normal users, two separate organizers, and an admin. Verify that one organizer cannot modify another's tournament or payments.
- Test a free entry, manual approval, paid entry, duplicate username in different case, full capacity, rating restriction, new account restriction, early/late check-in and withdrawal.
- Confirm payment callbacks, captured webhooks, webhook retries, and full-refund webhook updates using Razorpay test mode.
- Add the Chess.com lobby before match day and verify it with the organizer's intended membership restrictions.
- Back up the Supabase database, monitor Vercel function errors and Razorpay webhook failures, and periodically prune old `rate_limits` rows.

Implemented notifications cover registration, payment and status changes. Time-based reminders, automatic Chess.com standings synchronization, automated prize payouts, age/country-restricted events, invite codes and waitlist promotion are not enabled. No fabricated integration status is used to imply these capabilities are live. Live authentication, real provider payments, SMTP delivery and deployment require validation against your connected accounts.

## Assets

Knight artwork and decorative graphics are original SVG/CSS included in the source. DM Sans and Barlow Condensed are self-hosted under the SIL Open Font License; license files are in `public/fonts/`.
