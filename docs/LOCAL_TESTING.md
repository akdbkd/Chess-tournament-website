# Local Supabase test data

Requires Node 22+, Docker running, and the Supabase CLI. This is a real local Auth/PostgreSQL setup; browser-only demo mode must be off.

From the repository root:

```sh
supabase start
supabase status
cp .env.example .env.local
```

In `.env.local`, set the following using the **local** keys shown by `supabase status`:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
AUTH_COOKIE_SECRET=<at least 32 random characters>
```

Leave Razorpay keys blank. Do not copy production credentials. The local CLI applies the initial schema and subsequent migrations on first startup; do not also run `schema.sql` manually.

```sh
npm ci
npm run seed:local
npm run dev
```

Open http://localhost:3000 and sign in with email/password:

| Email                     | Role / scenario                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| admin@knightfall.test     | ADMIN: admin navigation, settings, users, moderation, refund queue |
| organizer@knightfall.test | ORGANIZER: no admin links or workspace access                      |
| player@knightfall.test    | USER: registrations, approvals, check-in, saved events, notices    |
| suspended@knightfall.test | Suspended USER: application access denied                          |

Password for newly created fixtures: **`LocalChess!2026`**. These are intentional local-only test credentials. The seed refuses non-loopback URLs. Reruns preserve existing passwords and MFA factors, refresh fixture records/dates, reset the fixture accounts' roles/status, and enable local email signup/login, registrations and community posting. Other accounts are not changed; a matching email without the fixture metadata causes a refusal.

Admin MFA remains enforced. Sign in as admin and enroll an authenticator normally; TOTP is enabled in the local configuration. Email confirmations are disabled locally; recovery emails can be viewed in the local mail UI at http://localhost:54324. Studio is http://localhost:54323.

## Included scenarios

Eight clearly labelled local events have dates relative to seeding time: open/free, manual approval, a stricter account-age requirement, check-in opening in 15 minutes, completed standings, a paid refund queue, and an organizer-owned draft. Player entries cover approved, pending, checked-in and withdrawn/refund-requested states. Community data includes a post, reply and open moderation report.

Chess.com identities and payment references in fixtures are synthetic. The seed never calls Chess.com or Razorpay, creates no real orders/refunds, and does not bypass eligibility checks for new registrations. New username lookups still use the real public Chess.com API. Do not attempt provider refunds for fixture references. Real payment and OAuth flows need their own provider test configuration; default social-login switches remain disabled.

To refresh dates/data, run `npm run seed:local` again. This upserts fixed fixture IDs rather than adding duplicates. To completely erase **all local** data and start again, run the destructive local reset explicitly:

```sh
supabase db reset --local
npm run seed:local
```

Use `npm run dev` for this HTTP local setup. Production builds intentionally require canonical HTTPS configuration. Changes made to fixture entries may be overwritten by a later seed; unrelated rows remain intact.
