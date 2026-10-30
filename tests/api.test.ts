import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/[...path]/route";
const realFetch = globalThis.fetch;
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let role = "ADMIN",
  status = "active";
let calls: string[] = [];
before(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_not_real";
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    calls.push(url.href);
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id,
        email: "test@example.test",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
      });
    if (
      url.pathname === "/rest/v1/profiles" &&
      url.searchParams.get("id") === "eq." + id
    )
      return Response.json({ id, role, status, display_name: "Test account" });
    if (url.pathname === "/rest/v1/rpc/consume_rate_limit")
      return Response.json(true);
    if (
      [
        "/rest/v1/profiles",
        "/rest/v1/registrations",
        "/rest/v1/comments",
        "/rest/v1/posts",
      ].includes(url.pathname)
    )
      return Response.json([], { headers: { "Content-Range": "0-0/0" } });
    throw new Error("Unexpected test request: " + url.pathname);
  };
});
after(() => {
  globalThis.fetch = realFetch;
});
function request(
  path: string,
  options: {
    aal?: string;
    method?: string;
    raw?: string;
    headers?: Record<string, string>;
    auth?: boolean;
  } = {},
) {
  const token =
    "e30." +
    Buffer.from(
      JSON.stringify({ sub: id, aal: options.aal || "aal1" }),
    ).toString("base64url") +
    ".test";
  return new NextRequest("https://arena.example.test/api/" + path, {
    method: options.method || "GET",
    headers: {
      ...(options.auth === false ? {} : { authorization: "Bearer " + token }),
      ...(options.method === "POST"
        ? { "content-type": "application/json" }
        : {}),
      ...options.headers,
    },
    ...(options.raw !== undefined ? { body: options.raw } : {}),
  });
}
async function invoke(
  path: string,
  options: Parameters<typeof request>[1] = {},
) {
  const req = request(path, options);
  return (options.method === "POST" ? POST : GET)(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
}
test("API returns MFA_REQUIRED for password-only administrators", async () => {
  const response = await invoke("admin/users");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "MFA_REQUIRED");
});
test("API denies suspended accounts even when the auth session remains valid", async () => {
  status = "suspended";
  try {
    const response = await invoke("me", { aal: "aal2" });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ACCOUNT_SUSPENDED");
  } finally {
    status = "active";
  }
});
test("admin pagination is bounded and organizer queries are owner-scoped", async () => {
  role = "ORGANIZER";
  calls = [];
  try {
    const response = await invoke("admin/registrations?page=3&q=knight", {
      aal: "aal2",
    });
    assert.equal(response.status, 200);
    const query = new URL(
      calls.find((c) => c.includes("/rest/v1/registrations"))!,
    );
    assert.equal(query.searchParams.get("tournament.organizer_id"), "eq." + id);
    assert.equal(query.searchParams.get("offset"), "100");
    assert.equal(query.searchParams.get("limit"), "50");
    assert.equal((await invoke("admin/users", { aal: "aal2" })).status, 403);
  } finally {
    role = "ADMIN";
  }
});
test("API rejects cross-origin writes, malformed JSON and oversized streams", async () => {
  assert.equal(
    (
      await invoke("profile", {
        method: "POST",
        raw: "{}",
        headers: { origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await invoke("profile", { method: "POST", raw: "[" })).status,
    400,
  );
  assert.equal(
    (
      await invoke("profile", {
        method: "POST",
        raw: "{}",
        headers: { "content-type": "text/plain" },
      })
    ).status,
    415,
  );
  assert.equal(
    (await invoke("profile", { method: "POST", raw: "x".repeat(1048577) }))
      .status,
    413,
  );
  assert.equal((await invoke("admin", { auth: false })).status, 401);
});
test("demo mode rejects authenticated live writes", async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  try {
    assert.equal(
      (
        await invoke("profile", {
          method: "POST",
          raw: '{"display_name":"Test"}',
        })
      ).status,
      503,
    );
  } finally {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  }
});
