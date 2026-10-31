import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAuth, sealAuth, openAuth } from "../src/lib/auth-server";
import { defaultAuthSettings } from "../src/lib/settings";
const actualFetch = globalThis.fetch;
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let settings = {
  ...defaultAuthSettings,
  google_login_enabled: true,
  microsoft_login_enabled: true,
  discord_login_enabled: true,
};
let calls: string[] = [],
  providerValid = true;
const handoffs = new Map<string, string>();
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(
    JSON.stringify({
      sub: userId,
      session_id: sessionId,
      aal: "aal1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url") +
  ".dGVzdF9zaWduYXR1cmVfbm90X3JlYWw";
const authUser = {
  id: userId,
  email: "test@example.test",
  aud: "authenticated",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
before(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SITE_URL = "https://arena.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public_test_key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server_test_key";
  process.env.AUTH_COOKIE_SECRET =
    "synthetic_auth_cookie_secret_at_least_32_characters";
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    calls.push(url.href);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === "/rest/v1/rpc/consume_rate_limit")
      return Response.json(true);
    if (url.pathname === "/rest/v1/site_settings")
      return Response.json(settings);
    if (url.pathname === "/auth/v1/settings")
      return Response.json({
        external: { email: true, google: true, azure: true, discord: true },
      });
    if (url.pathname === "/auth/v1/token")
      return Response.json({
        access_token: token,
        refresh_token: "synthetic_refresh",
        token_type: "bearer",
        expires_in: 3600,
        provider_token: "synthetic_provider_token",
        user: authUser,
      });
    if (url.pathname === "/rest/v1/rpc/authorize_login_session")
      return Response.json(null);
    if (url.pathname === "/rest/v1/auth_handoffs") {
      handoffs.set(body.token_hash, body.payload);
      return new Response(null, { status: 201 });
    }
    if (url.pathname === "/rest/v1/rpc/consume_auth_handoff") {
      const payload = handoffs.get(body.p_hash) || null;
      handoffs.delete(body.p_hash);
      return Response.json(payload);
    }
    if (
      [
        "openidconnect.googleapis.com",
        "graph.microsoft.com",
        "discord.com",
      ].includes(url.hostname)
    )
      return providerValid
        ? Response.json({ sub: "verified_sub", id: "verified_id" })
        : Response.json({ error: "wrong provider" }, { status: 401 });
    throw new Error("Unexpected test call " + url.pathname);
  };
});
after(() => {
  globalThis.fetch = actualFetch;
});
function request(
  action: string,
  body: unknown = {},
  cookie?: string,
  method = "POST",
) {
  return new NextRequest("https://arena.example.test/api/auth/" + action, {
    method,
    headers: {
      origin: "https://arena.example.test",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
test("email and each provider are blocked on the server when disabled", async () => {
  for (const [provider, flag] of [
    ["email", "email_login_enabled"],
    ["google", "google_login_enabled"],
    ["azure", "microsoft_login_enabled"],
    ["discord", "discord_login_enabled"],
  ] as const) {
    settings[flag] = false;
    calls = [];
    const response = await handleAuth(
      request(
        provider === "email" ? "email" : "oauth",
        provider === "email"
          ? {
              intent: "login",
              email: "test@example.test",
              password: "synthetic",
            }
          : { provider },
      ),
      provider === "email" ? "email" : "oauth",
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "LOGIN_METHOD_DISABLED");
    assert.equal(
      calls.some((c) => c.includes("/auth/v1/token")),
      false,
    );
    settings[flag] = true;
  }
});
test("login pause and signup pause preserve distinct controls", async () => {
  settings.login_enabled = false;
  let response = await handleAuth(
    request("email", {
      intent: "login",
      email: "test@example.test",
      password: "synthetic",
    }),
    "email",
  );
  assert.equal(response.status, 403);
  settings.login_enabled = true;
  settings.signup_enabled = false;
  response = await handleAuth(
    request("email", {
      intent: "signup",
      email: "new@example.test",
      password: "synthetic_password",
    }),
    "email",
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "SIGNUP_PAUSED");
  response = await handleAuth(
    request("email", {
      intent: "login",
      email: "test@example.test",
      password: "synthetic",
    }),
    "email",
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.access_token, token);
  settings.signup_enabled = true;
});
test("Google, Microsoft and Discord use PKCE, secure cookies and one-use handoffs", async () => {
  for (const provider of ["google", "azure", "discord"]) {
    const started = await handleAuth(request("oauth", { provider }), "oauth");
    assert.equal(started.status, 200);
    const url = new URL((await started.json()).url);
    assert.equal(url.searchParams.get("provider"), provider);
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(url.searchParams.get("code_challenge_method"), "s256");
    const cookie = started.cookies.get("__Host-knightfall-oauth")!.value;
    assert.match(started.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(started.headers.get("set-cookie")!, /Secure/);
    const callback = await handleAuth(
      request(
        "callback?code=synthetic_code",
        {},
        "__Host-knightfall-oauth=" + cookie,
        "GET",
      ),
      "callback",
    );
    assert.equal(callback.status, 307);
    assert.equal(
      callback.headers.get("location"),
      "https://arena.example.test/auth/complete",
    );
    assert.doesNotMatch(
      callback.headers.get("location")!,
      /access_token|refresh_token/,
    );
    const handoff = callback.cookies.get("__Host-knightfall-signin")!.value;
    assert.match(handoff, /^[a-f0-9]{64}$/);
    const complete = await handleAuth(
      request("complete", {}, "__Host-knightfall-signin=" + handoff),
      "complete",
    );
    assert.equal(complete.status, 200);
    assert.equal(
      (await complete.json()).session.refresh_token,
      "synthetic_refresh",
    );
    assert.equal(
      (
        await handleAuth(
          request("complete", {}, "__Host-knightfall-signin=" + handoff),
          "complete",
        )
      ).status,
      400,
    );
  }
});
test("OAuth rejects missing, tampered, expired, or mismatched provider flows", async () => {
  const none = await handleAuth(
    request("callback?code=fake", {}, undefined, "GET"),
    "callback",
  );
  assert.match(none.headers.get("location")!, /error=signin_failed/);
  const sealed = sealAuth(
    { provider: "google", storage: {}, expires: 0, issued: 0 },
    "flow",
  );
  const expired = await handleAuth(
    request(
      "callback?code=fake",
      {},
      "__Host-knightfall-oauth=" + sealed,
      "GET",
    ),
    "callback",
  );
  assert.match(expired.headers.get("location")!, /error=signin_failed/);
  assert.throws(() => openAuth("X" + sealed.slice(1), "flow"));
  assert.throws(() => openAuth(sealed, "handoff"));
  const started = await handleAuth(
    request("oauth", { provider: "google" }),
    "oauth",
  );
  const cookie = started.cookies.get("__Host-knightfall-oauth")!.value;
  providerValid = false;
  try {
    const mismatch = await handleAuth(
      request(
        "callback?code=fake",
        {},
        "__Host-knightfall-oauth=" + cookie,
        "GET",
      ),
      "callback",
    );
    assert.match(mismatch.headers.get("location")!, /error=signin_failed/);
    assert.equal(mismatch.cookies.get("__Host-knightfall-signin")?.value, "");
  } finally {
    providerValid = true;
  }
});
test("provider switches are checked again after the external redirect", async () => {
  const started = await handleAuth(
    request("oauth", { provider: "discord" }),
    "oauth",
  );
  const cookie = started.cookies.get("__Host-knightfall-oauth")!.value;
  settings.discord_login_enabled = false;
  calls = [];
  try {
    const denied = await handleAuth(
      request(
        "callback?code=fake",
        {},
        "__Host-knightfall-oauth=" + cookie,
        "GET",
      ),
      "callback",
    );
    assert.match(denied.headers.get("location")!, /error=signin_failed/);
    assert.equal(
      calls.some((c) => c.includes("/auth/v1/token")),
      false,
    );
  } finally {
    settings.discord_login_enabled = true;
  }
});
