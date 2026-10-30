import test from "node:test";
import assert from "node:assert/strict";
import { readBody, parseJson, HttpError } from "../src/lib/http";
import { contentSecurityPolicy } from "../src/lib/security";
import { organizer, administrator } from "../src/lib/server";
const account = { id: "test", display_name: "Test", role: "ADMIN" as const };
test("privileged operations reject password-only sessions", async () => {
  assert.throws(
    () => administrator(account),
    (e: unknown) => e instanceof HttpError && e.code === "MFA_REQUIRED",
  );
  await assert.rejects(() => organizer(account), /authenticator/);
  assert.doesNotThrow(() => administrator({ ...account, aal: "aal2" }));
  await assert.rejects(
    () => organizer({ ...account, role: "USER", aal: "aal2" }),
    /Organizer access/,
  );
});
test("request limits reject declared and streamed oversized bodies", async () => {
  await assert.rejects(
    () =>
      readBody(
        new Request("https://arena.test", {
          method: "POST",
          headers: { "content-length": "500" },
          body: "a",
        }),
        20,
      ),
    (e: unknown) => e instanceof HttpError && e.status === 413,
  );
  await assert.rejects(
    () =>
      readBody(
        new Request("https://arena.test", {
          method: "POST",
          body: "a".repeat(100),
        }),
        20,
      ),
    /too large/,
  );
  const text = "♞ chess";
  assert.equal(
    await readBody(
      new Request("https://arena.test", { method: "POST", body: text }),
    ),
    text,
  );
});
test("malformed and non-object JSON produce client errors", () => {
  for (const raw of ["", "{", "null", "[]", "true", '"test"'])
    assert.throws(
      () => parseJson(raw),
      (e: unknown) => e instanceof HttpError && e.status === 400,
    );
  assert.deepEqual(parseJson('{"accepted":true}'), { accepted: true });
});
test("production CSP uses nonces and prevents framing and executable objects", () => {
  const csp = contentSecurityPolicy("testNonce");
  assert.match(csp, /'nonce-testNonce'/);
  assert.match(csp, /'strict-dynamic'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(
    csp.split(";").find((x) => x.trim().startsWith("script-src"))!,
    /unsafe-inline/,
  );
  assert.match(contentSecurityPolicy("dev", true), /unsafe-eval/);
});

test("invalid UTF-8 is a client error", async () => {
  await assert.rejects(
    () =>
      readBody(
        new Request("https://arena.test", {
          method: "POST",
          body: new Uint8Array([0xff, 0xff]),
        }),
      ),
    (e: unknown) => e instanceof HttpError && e.status === 400,
  );
});
