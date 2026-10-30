# Verification record

Verified 30 October 2026.

| Check | Result |
|---|---|
| Next.js production build | Passed |
| TypeScript / generated route types | Passed |
| Unit and PostgreSQL integration tests | 26 passed |
| Desktop browser walkthrough | Passed |
| Mobile layout across 8 routes | Passed, no horizontal overflow |
| Browser JavaScript errors | None in completed walkthrough |
| Public Chess.com lookup | HTTP 200; real username and Blitz rating returned |
| Anonymous admin / registration requests | Rejected with HTTP 401 |
| Invalid Chess.com username | Rejected with HTTP 400 |

Browser workflows tested: demo login; eligible player registration; persistence after reload; duplicate entry rejection; saved tournaments; URL filters; community post/comment; organizer tournament creation/editing; CSV standings import and display; withdrawal confirmation; mobile navigation.

Database tests include: profile role defaults, RLS isolation, case-insensitive usernames, capacity enforcement, account-age/rating validation, unauthorized organizer actions, payment amount validation, idempotent confirmation, refunds after withdrawal, immutable late-payment recovery, check-in windows, effective counts excluding expired holds, and rate limiting.

The PostgreSQL suite runs the migration in PGlite with isolated auth fixtures. It is not a test against a connected Supabase tenant or a multi-node load test.

Not externally verified: Supabase signup/email verification/password recovery and SMTP; real Razorpay checkout/capture/refund/webhook delivery; Vercel deployment. No service credentials or Vercel connection were available. Follow README.md to configure and test these before accepting live registrations.

The application is delivered in demo mode. Sample events, counts, prizes and local entries are illustrative. Chess.com tournament creation and standings synchronization are not automated; organizers supply lobby URLs and import reviewed results. Operational policies must be completed with the platform operator's details before launch.
