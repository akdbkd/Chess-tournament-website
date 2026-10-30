import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
function check(env: Record<string, string>, strict = false) {
  return spawnSync(
    process.execPath,
    ["scripts/check-environment.mjs", ...(strict ? ["--production"] : [])],
    { env: { NODE_ENV: "test", ...env }, encoding: "utf8" },
  );
}
test("release configuration fails closed without explicit setup", () => {
  assert.equal(check({}).status, 1);
  assert.equal(check({ NEXT_PUBLIC_DEMO_MODE: "true" }).status, 0);
  assert.equal(check({ NEXT_PUBLIC_DEMO_MODE: "true" }, true).status, 1);
});
test("configuration validation rejects insecure domains and does not print secrets", () => {
  const env = {
    NEXT_PUBLIC_DEMO_MODE: "false",
    NEXT_PUBLIC_SITE_URL: "https://arena.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public_test_key",
    SUPABASE_SERVICE_ROLE_KEY: "private_test_key",
  };
  assert.equal(check(env, true).status, 0);
  for (const url of [
    "http://arena.example",
    "https://user:pass@arena.example",
    "https://arena.example/?secret=test",
    "https://localhost",
  ])
    assert.equal(check({ ...env, NEXT_PUBLIC_SITE_URL: url }, true).status, 1);
  const bad = check({ ...env, RAZORPAY_KEY_SECRET: "private_do_not_print" });
  assert.equal(bad.status, 1);
  assert.doesNotMatch(bad.stderr, /private_do_not_print/);
});
