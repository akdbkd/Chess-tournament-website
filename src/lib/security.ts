export function contentSecurityPolicy(nonce: string, development = false) {
  let supabase = "";
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (
      url.protocol === "https:" ||
      (development &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      supabase = url.origin;
  } catch {}
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${supabase.replace(/^http/, "ws")} https://*.razorpay.com https://*.razorpay.in${development ? " ws: http://localhost:*" : ""}`,
    "frame-src https://*.razorpay.com https://*.razorpay.in",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.razorpay.com https://*.razorpay.in",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
