# Security review and operating model

Reviewed 31 October 2026 against `codex/premium-arena-design` (`ed9327b`). This is an implementation review and automated regression pass, not an external penetration test or a guarantee against every vulnerability.

## Implemented protections

| Area                   | Control                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privileged access      | Supabase verifies bearer sessions; roles/status are loaded from PostgreSQL; organizer/admin operations require the validated JWT's AAL2 claim                      |
| Tenant isolation       | Organizer APIs filter by owned tournament; mutations repeat ownership checks in service-only SQL functions                                                         |
| Account administration | No self-access changes; active-admin checks; suspension/restore and role changes commit with audit records                                                         |
| Direct database access | RLS on every table, no client mutation policies, restrictive active-account checks for private reads, service-only sensitive RPCs                                  |
| Registration integrity | Tournament row locks, case-insensitive uniqueness, server eligibility, deadlines and capacity, recorded consent timestamp/policy version                           |
| Event lifecycle        | Stale-version checks, locked fees/eligibility, guarded lifecycle, transactional cancellation, one notification per affected account                                |
| Payment integrity      | Server-authoritative amount, captured INR payment verification, exact-body webhook HMAC, permanent order ledger, transactional confirmation/refunds                |
| Refund retries         | Database claim, stable provider idempotency key, provider lookup/reconciliation, callbacks cannot overwrite a later payment/registration                           |
| Community              | Text rendering, bounded inputs, rate limits, database pause guards, reversible moderation and audited reply deletion                                               |
| Browser security       | Nonce/strict-dynamic CSP, frame/object restrictions, HSTS, nosniff, referrer/permissions policies, no public API caching                                           |
| HTTP                   | Stream-counted request limits, JSON/content-type validation, origin checks, parameterized queries, UUID/URL/schema validation                                      |
| Abuse                  | Distributed PostgreSQL limits for live public reads/user mutations; dedicated lookup/post/comment/report/export limits; Supabase auth limits configured separately |
| Operations             | Secret-safe configuration checks, redacted structured error IDs, CI/dependency audit, server-only scheduler, idempotent reminders                                  |

## Sign-in controls (1.2.0)

Only ADMIN accounts can see admin navigation or use the `/admin` workspace/API, including collection/export/settings routes. Authenticator verification is still required for privileged operations. Existing ownership checks on event mutation APIs remain in place for the legacy ORGANIZER role.

All new application logins use the server's credential/PKCE exchange. A service-only session registry binds the verified Supabase session UUID to its actual sign-in method; raw browser-provided tokens cannot register themselves. Private RLS reads check the same registry. New-account/provider switches are also enforced by the profile-creation database trigger. Switches pause new sign-ins, while already-authorized sessions continue until expiry/sign-out/suspension.

OAuth provider selection is encrypted into a Secure/HttpOnly/SameSite flow cookie. The server redeems the PKCE code and verifies the returned provider token against that provider's user-info endpoint, including for linked identities. Tokens transfer to the browser via an opaque one-use handoff whose payload is encrypted with a purpose-specific key derived from `AUTH_COOKIE_SECRET`; no OAuth tokens are put in application redirect URLs. Handoffs expire after 90 seconds and are cleaned by maintenance. Login session references are pruned when the corresponding Supabase Auth session no longer exists.

## Boundaries requiring live verification

Configure and verify Supabase email confirmation/SMTP, password policy, TOTP, session lifetime, CAPTCHA and auth rate limits in the provider account. Run real test-mode checkout/refund/webhook flows; mocked API and embedded PostgreSQL tests do not validate provider credentials, network behavior or webhook delivery. Test migration/restore and concurrent traffic against staging PostgreSQL before launch at scale.

Supabase uses bearer tokens in its browser session store. Protect the site against XSS and third-party script changes, use appropriate access-token lifetimes and secure operator devices. Account suspension is application-enforced on every API request and on private RLS reads; public content remains public.

Rate limiting trusts the hosting proxy's forwarded client address. Replace client-supplied forwarded headers at any custom proxy. Configure hosting/WAF protections for volumetric attacks; application database counters are not a network DDoS service.

Razorpay handles card/bank details. The app does not implement partial refunds, automatic prize payout, country/age verification, Chess.com account ownership verification, remote tournament creation or its own cheat-detection engine. Chess.com hosts gameplay; organizer-reviewed public data is the integration boundary.

No live resources or credentials were modified during this task. See [the deployment runbook](docs/DEPLOYMENT.md) for activation, acceptance, recovery, backups and rollback.

## Reporting

Use the operator's configured support contact for private security reports. Do not include passwords, access tokens, service keys or complete payment credentials in issue reports. Provide a reproduction, affected route, time and request ID where available.
