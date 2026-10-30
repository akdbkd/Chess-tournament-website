# Verification record

Release **1.1.0**, verified **31 October 2026**, based on `codex/premium-arena-design` at `ed9327b`.

| Check                                                           | Result                      |
| --------------------------------------------------------------- | --------------------------- |
| TypeScript / generated route types                              | Passed                      |
| Unit, API, configuration and PostgreSQL tests                   | **49 passed, 0 failed**     |
| Production Next.js build with explicit demo configuration       | Passed                      |
| npm dependency audit                                            | **0 known vulnerabilities** |
| Desktop/mobile browser regression groups                        | **14 passed**               |
| Browser JavaScript errors                                       | **0**                       |
| Mobile overflow across 8 public routes at 390px                 | None                        |
| Per-request CSP nonce / security headers / no-store API caching | Passed                      |
| Anonymous privileged requests / cross-origin writes             | Rejected                    |
| Whitespace / diff checks                                        | Passed                      |

The browser run used the production server and Chromium, with a fresh isolated demo profile. It covered login, registration/persistence/duplicates, saved events, URL filters, posts/replies, tournament creation/editing, CSV standings import/display, withdrawal, moderation hide/restore, cancellation confirmation, nonce rotation/security headers, mobile navigation and anonymous API rejection.

The API suite mocks the Supabase provider boundary and checks AAL2 requirements, current suspension status, organizer scoping, pagination, content type, malformed/oversized requests, origin checks and rejection of live writes in demo mode.

PostgreSQL semantics are tested in PGlite with an isolated Supabase auth-schema shim. Coverage includes the original capacity/payment/eligibility rules and new access changes, suspensions and private RLS reads, versioned tournament edits, cancellation/refund queue idempotence, refund claims/replays, late refunds after re-registration, atomic order linkage, reversible moderation, registration/community pause guards, recorded consent, reviewed participant-only standings, scheduler hold expiry and duplicate-free reminders. The upgrade migration is also reapplied after a fresh schema to check rerunnability. These tests are not a concurrent multi-node load test against a real Supabase tenant.

The release-configuration tests verify explicit mode selection, live-release rejection of demo mode, canonical HTTPS domains, complete payment configuration and redaction of secret values. Validation checks configuration shape; it cannot validate the supplied provider credentials.

## Live activation remains required

No Supabase, Razorpay, SMTP, Vercel or scheduler credentials were connected. No live infrastructure was created and no live payments/emails were sent. Therefore live signup/recovery, real MFA enrollment, actual checkout/capture/refunds/webhooks, staging migration/restore, provider CSP compatibility and production deployment remain **unverified**.

Complete [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before accepting real entries. Supply the operator's legal details and domain, configure provider accounts, apply the correct database installation/upgrade, run acceptance with separate roles and test-mode payments, and then enable the live deployment. The source package is ready for this configuration and release process; a fully operational production service is not claimed without those steps.
