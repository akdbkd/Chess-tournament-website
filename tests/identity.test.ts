import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { defaultAuthSettings } from "../src/lib/settings";
const pg = new PGlite();
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  session = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
async function one(sql: string, args: unknown[] = []) {
  return (await pg.query<Record<string, any>>(sql, args)).rows[0];
}
before(async () => {
  await pg.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  await pg.exec(
    (
      await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")
    ).replace("create extension if not exists pgcrypto;", ""),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261031010000_identity_controls.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.query("insert into auth.users(id) values($1),($2)", [admin, user]);
  await pg.query("update profiles set role='ADMIN' where id=$1", [admin]);
});
after(() => pg.close());
test("only admins can change login controls and changes have audit records", async () => {
  await assert.rejects(
    () =>
      pg.query("select save_auth_settings($1,$2)", [user, defaultAuthSettings]),
    /Not authorized/,
  );
  await pg.query("select save_auth_settings($1,$2)", [
    admin,
    { ...defaultAuthSettings, google_login_enabled: true },
  ]);
  assert.equal(
    (await one("select * from site_settings")).google_login_enabled,
    true,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from audit_logs where action='auth.settings_updated'",
      )
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      pg.query("select save_auth_settings($1,$2)", [
        admin,
        { ...defaultAuthSettings, email_login_enabled: false },
      ]),
    /Enable a sign-in method/,
  );
});
test("new-account switches block direct Auth inserts and disabled providers", async () => {
  await pg.exec("update site_settings set signup_enabled=false");
  await assert.rejects(
    () => pg.query("insert into auth.users(id) values(gen_random_uuid())"),
    /New accounts/,
  );
  await pg.exec(
    "update site_settings set signup_enabled=true,discord_login_enabled=false",
  );
  await assert.rejects(
    () =>
      pg.query(
        'insert into auth.users(id,raw_app_meta_data) values(gen_random_uuid(),\'{"provider":"discord"}\')',
      ),
    /method is disabled/,
  );
  await pg.exec("update site_settings set discord_login_enabled=true");
  await pg.query(
    'insert into auth.users(id,raw_app_meta_data) values(gen_random_uuid(),\'{"provider":"discord"}\')',
  );
});
test("private RLS reads require an app-authorized session; raw provider tokens cannot bypass", async () => {
  await pg.query(
    "insert into notifications(user_id,title,body) values($1,'Private','For this user only')",
    [user],
  );
  await pg.exec(
    "grant usage on schema public,auth to authenticated;grant select on all tables in schema public to authenticated;",
  );
  await pg.exec(
    `set role authenticated;set request.jwt.claim.sub='${user}';set request.jwt.claims='{"session_id":"${session}"}';`,
  );
  try {
    assert.equal(
      (await pg.query("select * from notifications")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        pg.query("select authorize_login_session($1,$2,'email')", [
          session,
          user,
        ]),
      /permission denied/,
    );
  } finally {
    await pg.exec("reset role;");
  }
  await pg.query("select authorize_login_session($1,$2,'email')", [
    session,
    user,
  ]);
  await pg.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  try {
    assert.equal(
      (await pg.query("select * from notifications")).rows.length,
      1,
    );
  } finally {
    await pg.exec("reset role;");
  }
});
test("pausing logins blocks new sessions while existing sessions remain usable", async () => {
  await pg.query("select save_auth_settings($1,$2)", [
    admin,
    { ...defaultAuthSettings, login_enabled: false },
  ]);
  await assert.rejects(
    () =>
      pg.query("select authorize_login_session(gen_random_uuid(),$1,'email')", [
        user,
      ]),
    /paused/,
  );
  await pg.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  try {
    assert.equal(
      (await pg.query("select * from notifications")).rows.length,
      1,
    );
  } finally {
    await pg.exec("reset role;");
  }
  await pg.query("select save_auth_settings($1,$2)", [
    admin,
    defaultAuthSettings,
  ]);
});
test("OAuth handoffs are consumed once and expired handoffs cannot be used", async () => {
  await pg.exec(
    "insert into auth_handoffs values('one','encrypted',now()+interval '1 minute'),('expired','encrypted',now()-interval '1 minute')",
  );
  assert.equal(
    (await one("select consume_auth_handoff('one') as result")).result,
    "encrypted",
  );
  assert.equal(
    (await one("select consume_auth_handoff('one') as result")).result,
    null,
  );
  assert.equal(
    (await one("select consume_auth_handoff('expired') as result")).result,
    null,
  );
});
