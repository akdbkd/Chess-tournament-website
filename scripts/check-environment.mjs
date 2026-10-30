// Validate configuration without printing credentials or their contents.
const strict = process.argv.includes("--production");
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const problems = [];
if (demo && strict)
  problems.push("NEXT_PUBLIC_DEMO_MODE must be false for a live release.");
if (!demo) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false")
    problems.push(
      "Set NEXT_PUBLIC_DEMO_MODE explicitly to false (live) or true (demo).",
    );
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ])
    if (!process.env[name]) problems.push(`${name} is required.`);
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    try {
      const url = new URL(process.env[name]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
        throw 0;
    } catch {
      problems.push(`${name} must be a canonical HTTPS origin.`);
    }
  }
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY ===
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    problems.push(
      "The service-role key must be different from the public anon key.",
    );
  const paymentNames = [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ];
  if (
    paymentNames.some((n) => process.env[n]) &&
    paymentNames.some((n) => !process.env[n])
  )
    problems.push(
      "Configure all three Razorpay variables together, or leave all unset for free events.",
    );
  if (
    process.env.RAZORPAY_KEY_ID &&
    !/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(process.env.RAZORPAY_KEY_ID)
  )
    problems.push(
      "RAZORPAY_KEY_ID must be a provider-issued test or live key ID.",
    );
  if (
    process.env.RAZORPAY_WEBHOOK_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET.length < 32
  )
    problems.push(
      "Use a separate Razorpay webhook secret of at least 32 characters.",
    );
  if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32)
    problems.push("CRON_SECRET must contain at least 32 random characters.");
}
if (problems.length) {
  console.error(
    "Configuration check failed:\n" + problems.map((p) => `- ${p}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    demo
      ? "Demo configuration verified. This build cannot accept live account actions."
      : "Live configuration shape verified. Provider integration tests are still required.",
  );
