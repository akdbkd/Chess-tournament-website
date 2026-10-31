import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  assertLocalSeedTarget,
  localFixtures,
  localAccounts,
} from "../scripts/local-seed-data";
import { contentSecurityPolicy } from "../src/lib/security";
test("local seed rejects hosted and ambiguous target URLs", () => {
  for (const url of [
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])
    assert.ok(assertLocalSeedTarget(url));
  for (const url of [
    "https://project.supabase.co",
    "http://localhost.example:54321",
    "http://user:pass@localhost:54321",
    "http://localhost:54321/path",
    "http://localhost:54321?target=remote",
  ])
    assert.throws(() => assertLocalSeedTarget(url));
});
test("local Supabase connections are allowed only by the development CSP", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  try {
    assert.match(
      contentSecurityPolicy("test", true),
      /http:\/\/127.0.0.1:54321/,
    );
    assert.doesNotMatch(contentSecurityPolicy("test", false), /127\.0\.0\.1/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});
test("fresh CLI migrations accept all local fixtures and support rerunning them", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    );
    for (const file of [
      "20261030000000_initial_schema.sql",
      "20261031000000_production_hardening.sql",
      "20261031010000_identity_controls.sql",
    ]) {
      await pg.exec(
        (
          await readFile(
            new URL("../supabase/migrations/" + file, import.meta.url),
            "utf8",
          )
        ).replace("create extension if not exists pgcrypto;", ""),
      );
    }
    const ids = localAccounts.map(
      (_, i) => `a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await pg.query("insert into auth.users(id) values($1)", [id]);
    const fixtures = localFixtures({
      admin: ids[0],
      organizer: ids[1],
      player: ids[2],
    });
    for (let run = 0; run < 2; run++)
      for (const [table, rows] of Object.entries(fixtures)) {
        // Keep real defaults: insert only the supplied fixture columns.
        for (const row of rows) {
          const keys = Object.keys(row);
          await pg.query(
            `insert into ${table} (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) on conflict do nothing`,
            Object.values(row),
          );
        }
      }
    assert.equal((await pg.query("select * from tournaments")).rows.length, 8);
    assert.equal(
      (await pg.query("select * from registrations")).rows.length,
      5,
    );
    assert.equal(
      (
        await pg.query(
          "select * from payment_orders where payment_status='refund_requested'",
        )
      ).rows.length,
      1,
    );
    assert.equal((await pg.query("select * from posts")).rows.length, 1);
  } finally {
    await pg.close();
  }
});
