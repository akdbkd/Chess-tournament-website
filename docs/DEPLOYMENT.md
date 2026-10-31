# Deployment runbook

Release 1.2.0 · 31 October 2026 · Vercel / Supabase / Razorpay

The source is implemented and locally verified. No live infrastructure, domain, SMTP account or payment credentials were connected during this task. Complete these steps before accepting live registrations.

## 1. Database

- New Supabase project: run `supabase/schema.sql` once.
- Existing project from `codex/premium-arena-design`: take a provider backup, test restoring it to staging, then apply `supabase/migrations/20261031000000_production_hardening.sql`, followed by `supabase/migrations/20261031010000_identity_controls.sql`. A 1.1.0 database needs only the latter migration. Do not rerun the fresh-install schema.
- The upgrade preserves existing users, tournaments, orders and entries. New consent fields remain empty on historical registrations; they are populated on new registrations. No historical consent is fabricated.
- The identity upgrade requires existing users to sign in again once. Their profile, entries and payment history remain intact.
- The upgrade is transactional and rerunnable. Test it in staging first. Do not roll back by dropping tables that contain payment records.
- All tables have RLS. Sensitive RPCs are executable only by `service_role`. Keep the service-role key server-only.

## 2. Identity and first admin

Configure Supabase Auth:

- Email/password with email confirmation and a production SMTP provider.
- Password minimum 12 characters, appropriate session lifetime, auth endpoint rate limits, leaked-password protection if available and CAPTCHA according to traffic needs.
- TOTP MFA enabled. Privileged operators must enroll and verify it in Account settings or the studio gate.
- Site URL = your canonical HTTPS domain. Add exact redirect URLs for `/api/auth/callback`, `/auth/confirmed`, `/dashboard` and `/reset-password`, plus only the local/staging URLs you use. Avoid wildcard production redirect URLs.
- Sign up, confirm the first admin's email, then assign ADMIN using the account's UUID in the Supabase SQL editor. Subsequent role changes use the studio.
- Store authenticator recovery access securely. If an operator loses their factor, verify their identity using your documented recovery process before removing the factor in Supabase. Recovery must never bypass the studio's AAL2 requirement.

Suspending an account stops application API actions and private RLS reads. Existing access JWTs may remain cryptographically valid until expiry; the application reads current account status for every request. **Sign out other sessions** revokes other refresh sessions; short-lived access tokens expire according to your Supabase policy.

### Social sign-in providers

The app supports email/password, Google, Microsoft and Discord. Provider secrets belong in **Supabase Auth → Providers**, never the browser or this repository.

| Sign-in option | Configure in the provider console                                                                        | Supabase provider |
| -------------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| Google         | OAuth web client ID/secret; authorized redirect URI shown in Supabase                                    | Google            |
| Microsoft      | Microsoft Entra app/client ID and secret; supported account/tenant types; redirect URI shown in Supabase | Azure (Microsoft) |
| Discord        | Discord OAuth2 application/client ID and secret; redirect URI shown in Supabase                          | Discord           |
| Email          | Email/password enabled, confirmations and production SMTP                                                | Email             |

The upstream provider redirect is normally `https://YOUR-PROJECT.supabase.co/auth/v1/callback`; use the exact URI shown by your Supabase project, including any custom Auth domain. The separate **application** callback `https://YOUR-DOMAIN/api/auth/callback` must be in Supabase's redirect allowlist. Microsoft uses the `azure` provider identifier internally. Configure the Microsoft tenant according to whether you support personal, work/school, or one organization's accounts.

Then enable each desired method in **Organizer studio → Settings → Sign-in & accounts**. Live login shows methods only when both the admin switch and Supabase provider configuration are enabled. Confirm the real provider flow with a test account before opening it to players. Email is enabled by default; Google, Microsoft and Discord default to disabled in a live database.

Login settings are independent of legal/contact settings. You can pause all **new** sign-ins, pause new accounts while allowing existing users to log in, or switch individual methods. Existing application sessions stay active so a signed-in admin can restore access. Account suspension remains the way to revoke a user's application access. If every administrator signs out while sign-ins are paused, restore access through the Supabase SQL editor:

```sql
update public.site_settings set login_enabled=true,email_login_enabled=true where id=true;
```

OAuth exchanges stay on the server. Flow data is encrypted in a Secure/HttpOnly/SameSite cookie, and returned provider tokens are checked with the selected provider to prevent changing Supabase's authorize URL to a disabled provider. The application receives its own access/refresh tokens through a one-use encrypted handoff, never an OAuth token in a redirect URL. Direct Supabase login tokens cannot authorize themselves for application APIs/private RLS reads; each accepted session is recorded server-side. The account-creation database trigger also enforces signup/provider switches against direct Auth API requests.

## 3. Environment variables

Set these in Vercel Production (and separately for Preview/Staging):

| Variable                        | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_DEMO_MODE=false`   | Explicit live build                                                     |
| `NEXT_PUBLIC_SITE_URL`          | Canonical HTTPS origin, no path/query/credentials                       |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase HTTPS origin                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe anon/publishable key                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only service role                                                |
| `AUTH_COOKIE_SECRET`            | Server-only random OAuth-flow encryption secret, at least 32 characters |
| `RAZORPAY_KEY_ID`               | Test/live provider key ID                                               |
| `RAZORPAY_KEY_SECRET`           | Server-only payment secret                                              |
| `RAZORPAY_WEBHOOK_SECRET`       | Separate random webhook secret, at least 32 characters                  |
| `CRON_SECRET`                   | Optional scheduler bearer secret, at least 32 random characters         |

All three Razorpay values may be omitted for a free-event deployment. If any is supplied, supply all three. Paid registration remains unavailable without payment credentials. Never put server secrets in a `NEXT_PUBLIC_` variable or commit a real `.env` file. The configuration checker validates shape, not provider authorization.

Use `npm run check:production` before promoting a live release. Public environment changes require a rebuild. Use separate provider projects/keys for staging; never run demo browser tests against live data.

## 4. Hosting

Import the repository in Vercel:

- Framework: Next.js; Node.js 22 or newer.
- Install: `npm ci`; Build: `npm run build`; output directory: default.
- Keep `vercel.json` or adjust its Mumbai function region to match your database/provider deployment.
- Configure the custom domain and verify HTTPS. Update Supabase redirects and the Razorpay webhook to the final domain.
- Use Vercel's trusted proxy/forwarded IP behavior. If hosting elsewhere, configure your reverse proxy to replace client-supplied `X-Forwarded-For`; public rate limits rely on the trusted incoming address.
- `/api/health` is a liveness endpoint and reports mode. It does not prove database, SMTP or payment readiness.

Nonce-based CSP requires dynamic rendering. The app sets the nonce on both the request and response so Next can apply it to hydration scripts. The production policy allows Supabase and Razorpay endpoints and denies framing/object execution. Validate Razorpay's actual checkout in staging after any provider CSP requirements change.

## 5. Operator configuration

In **Organizer studio → Settings**, publish the operator's legal name, support email, jurisdiction/contact address, retention review period and any public announcement. Paid events cannot open until these details exist. Complete age/consent, prize distribution, tax/payout and event eligibility terms appropriate to your operation before accepting paid entries.

Registration and community switches pause new activity. They preserve existing data, withdrawal and refund paths. Retention days express a review policy; there is no automatic deletion of financial/audit records. Handle access/deletion requests through support while preserving records required for disputes and applicable obligations.

## 6. Payment acceptance

Start with Razorpay **test** keys and automatic capture:

1. Webhook: `https://YOUR-DOMAIN/api/payments/webhook`; subscribe to `payment.captured` and `refund.processed` using the configured webhook secret.
2. Complete a paid checkout. Check server amount/currency, approved or pending state, payment ledger and one notification.
3. Replay the captured webhook; verify no second entry/notification. Alter the signature and confirm rejection.
4. Close checkout, resume payment, allow a hold to expire, and test a late capture after a later reservation. The old order must appear in the refund queue without overwriting the new entry.
5. Withdraw/reject/cancel a paid entry. Issue a full refund and verify its provider result and signed processed callback. Retry the action and webhook; verify one refund and one processed notification.
6. Simulate a provider timeout. After two minutes use **Issue / check full refund**. The stable idempotency key and provider lookup protect retry behavior. A submitted refund can be reconciled if webhook delivery is delayed.
7. Check provider dashboard/webhook failures and resolve unknown or mismatched payments before opening live entries.

Keep a separate merchant account or reviewed webhook routing for this application. Signed captured events for unknown orders are acknowledged and ignored. Partial refunds and automated prize payouts are outside this release.

## 7. Scheduler

The server exposes `GET /api/cron/maintenance`. Send `Authorization: Bearer <CRON_SECRET>` from a trusted scheduler; use secret storage, not a URL query parameter. Vercel Cron supplies the matching Authorization header when `CRON_SECRET` is configured.

For a Vercel plan that supports a 15-minute schedule, add this property to `vercel.json`:

```json
"crons": [{ "path": "/api/cron/maintenance", "schedule": "*/15 * * * *" }]
```

Alternatively configure a supported external authenticated scheduler. No schedule is enabled by default because provider plans differ. Maintenance expires unpaid holds, updates counts, prunes rate-limit windows older than a day, and sends in-app reminders within 24 hours and 30 minutes before an event. Reminder keys prevent duplicates. Reminders are **not emails**. Capacity calculations already exclude expired holds even if the scheduler is unavailable.

Monitor scheduler failures and validate one day-before and one check-in reminder. Run maintenance only against the intended environment.

## 8. Acceptance and operations

Use separate USER, ORGANIZER and ADMIN test accounts:

- Verify email delivery, signup, recovery and password changes.
- Verify password-only privileged sessions cannot enter the studio; verify MFA setup, challenge and recovery operations.
- Confirm guests, users and organizers see no admin links and cannot access the admin workspace/API, including exports and login settings.
- Test email/password and each configured OAuth provider, provider cancellation, expired/tampered callbacks, linked accounts, disabled methods, signup pause and global login pause. Verify an existing admin session stays available during a pause.
- Confirm the minimum Chess.com account-age setting saves/reloads and rejects an account younger than the chosen number of days.
- Suspend a test account, confirm its existing session is denied, then restore it.
- Test free/paid/manual-approval entries, duplicate username case, capacity, eligibility, deadline, check-in and withdrawal.
- Attempt stale tournament edits and changes to fees/eligibility with active entries. Confirm cancellation notifications/refund queue and that cancelled/completed events cannot reopen.
- Import reviewed standings for approved players; reject unknown users and duplicate names.
- Search/paginate admin collections, export a large event, moderate/restore/lock/unlock posts, remove a reply and resolve a report. Review corresponding audit records.
- Test at 320, 390, 768, 1024 and 1440 pixels. Verify keyboard navigation, focus, dialogs and checkout.
- Monitor application errors by `X-Request-ID`, database health, auth rate limits, Razorpay disputes/webhook failures and scheduler runs.
- Enable Supabase backups/PITR according to your plan, restrict provider dashboard access with MFA, rotate secrets after any exposure, and rehearse restoring a staging backup.

For an application rollback, promote the previous Vercel deployment while preserving the database and payment ledger. Prefer a forward database fix; dropping production tables or replaying an old schema is not a safe rollback.
