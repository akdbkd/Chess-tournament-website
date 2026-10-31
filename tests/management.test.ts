import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  player = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
async function one(sql: string, args: unknown[] = []) {
  return (await pg.query<Record<string, any>>(sql, args)).rows[0];
}
async function event(fee = 0) {
  return await one(
    "insert into tournaments(slug,title,description,category,format,time_control,starts_at,registration_closes,capacity,fee_paise,organizer_id,organizer_name,status,min_account_days) values(gen_random_uuid()::text,'Reviewed test event','A complete test event description','Rapid','Swiss','10 + 0',now()+interval '2 days',now()+interval '1 day',2,$1,$2,'Organizer','open',0) returning *,updated_at::text as version",
    [fee, organizer],
  );
}
async function reserve(t: any) {
  const cp = await one(
    "insert into chess_players(username,rating,joined) values('p_'||left(replace(gen_random_uuid()::text,'-',''),20),1400,1500000000) returning *",
  );
  return one("select * from reserve_registration($1,$2,$3,$4,1400)", [
    t.id,
    player,
    cp.id,
    cp.username,
  ]);
}
async function pay(t: any, r: any, id: string) {
  await pg.query("select attach_payment_order($1,$2,$3,$4)", [
    player,
    r.id,
    "order_" + id,
    r.expires_at,
  ]);
  await pg.query("select confirm_payment($1,$2,$3)", [
    "order_" + id,
    "pay_" + id,
    t.fee_paise,
  ]);
}
before(async () => {
  await pg.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  const schema = (
    await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")
  ).replace("create extension if not exists pgcrypto;", "");
  await pg.exec(schema);
  // Verify the upgrade migration is rerunnable after a fresh installation.
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261031000000_production_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
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
  for (const id of [admin, organizer, player, other])
    await pg.query("insert into auth.users(id) values($1)", [id]);
  await pg.query("update profiles set role='ADMIN' where id=$1", [admin]);
  await pg.query("update profiles set role='ORGANIZER' where id in ($1,$2)", [
    organizer,
    other,
  ]);
});
after(() => pg.close());
test("role changes and suspensions require an active admin and forbid self changes", async () => {
  await assert.rejects(
    () =>
      pg.query("select manage_account($1,$2,'ADMIN',null,'')", [
        organizer,
        player,
      ]),
    /Administrator/,
  );
  await assert.rejects(
    () => pg.query("select manage_account($1,$1,'USER',null,'')", [admin]),
    /own access/,
  );
  await assert.rejects(
    () =>
      pg.query("select manage_account($1,$2,null,'suspended','')", [
        admin,
        player,
      ]),
    /reason/,
  );
  await pg.query(
    "select manage_account($1,$2,null,'suspended','Repeated abuse')",
    [admin, player],
  );
  assert.equal(
    (await one("select * from profiles where id=$1", [player])).status,
    "suspended",
  );
  const t = await event();
  await assert.rejects(() => reserve(t), /suspended/);
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from audit_logs where action='user.access_changed'",
      )
    ).n,
    1,
  );
  await pg.query("select manage_account($1,$2,null,'active','')", [
    admin,
    player,
  ]);
});
test("paused registrations and replies are enforced by database guards", async () => {
  const t = await event();
  await pg.exec("update site_settings set registrations_enabled=false");
  await assert.rejects(() => reserve(t), /paused/);
  await pg.exec("update site_settings set registrations_enabled=true");
  const post = await one(
    "insert into posts(author_id,author_name,title,body,category) values($1,'Player','A test post','A long discussion body','General') returning *",
    [player],
  );
  await pg.exec("update site_settings set community_enabled=false");
  await assert.rejects(
    () =>
      pg.query(
        "insert into comments(post_id,author_id,author_name,body) values($1,$2,'Player','Test reply')",
        [post.id, player],
      ),
    /paused/,
  );
  await assert.rejects(
    () => pg.query("select toggle_reaction($1,$2)", [post.id, player]),
    /paused/,
  );
  await pg.exec("update site_settings set community_enabled=true");
});
test("tournament saves lock ownership, immutable fees, eligibility and concurrent versions", async () => {
  const t = await event();
  await reserve(t);
  await assert.rejects(
    () =>
      pg.query("select save_tournament($1,$2,$3,$4)", [
        other,
        t.id,
        { ...t, title: "Unauthorized update" },
        t.version,
      ]),
    /own tournaments/,
  );
  await assert.rejects(
    () =>
      pg.query("select save_tournament($1,$2,$3,null)", [organizer, t.id, t]),
    /changed/,
  );
  for (const change of [
    { capacity: 1 },
    { fee_paise: 100 },
    { max_rating: 1200 },
    { status: "archived" },
  ])
    await assert.rejects(() =>
      pg.query("select save_tournament($1,$2,$3,$4)", [
        organizer,
        t.id,
        { ...t, ...change },
        t.version,
      ]),
    );
  const saved = await one("select * from save_tournament($1,$2,$3,$4)", [
    organizer,
    t.id,
    { ...t, title: "Updated safely" },
    t.version,
  ]);
  assert.equal(saved.title, "Updated safely");
  await assert.rejects(
    () =>
      pg.query("select save_tournament($1,$2,$3,$4)", [
        organizer,
        t.id,
        t,
        t.version,
      ]),
    /changed/,
  );
});
test("cancellation queues paid entries and notifies each user once", async () => {
  const t = await event(9900),
    r = await reserve(t);
  await pay(t, r, "cancel");
  await assert.rejects(
    () =>
      pg.query("select cancel_tournament($1,$2,'Venue unavailable')", [
        other,
        t.id,
      ]),
    /Not authorized/,
  );
  await pg.query("select cancel_tournament($1,$2,'Venue unavailable')", [
    organizer,
    t.id,
  ]);
  await pg.query("select cancel_tournament($1,$2,'Venue unavailable')", [
    organizer,
    t.id,
  ]);
  assert.equal(
    (await one("select * from tournaments where id=$1", [t.id])).status,
    "cancelled",
  );
  assert.equal(
    (await one("select * from registrations where id=$1", [r.id]))
      .payment_status,
    "refund_requested",
  );
  assert.equal(
    (await one("select * from payment_orders where registration_id=$1", [r.id]))
      .payment_status,
    "refund_requested",
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from notifications where title='Tournament cancelled'",
      )
    ).n,
    1,
  );
});
test("refund claims prevent duplicates and processed callbacks commit once", async () => {
  const first = await one("select claim_refund($1,'order_cancel') as result", [
    organizer,
  ]);
  assert.equal(first.result.claimed, true);
  await assert.rejects(
    () => pg.query("select claim_refund($1,'order_cancel')", [organizer]),
    /in progress/,
  );
  await pg.exec(
    "update refund_requests set updated_at=now()-interval '3 minutes' where order_id='order_cancel'",
  );
  const retry = await one("select claim_refund($1,'order_cancel') as result", [
    organizer,
  ]);
  assert.equal(retry.result.request_id, first.result.request_id);
  await assert.rejects(
    () => pg.query("select process_refund('pay_cancel','rfnd_cancel',1)"),
    /amount mismatch/,
  );
  await pg.query("select process_refund('pay_cancel','rfnd_cancel',9900)");
  await pg.query("select process_refund('pay_cancel','rfnd_cancel',9900)");
  assert.equal(
    (await one("select * from payment_orders where order_id='order_cancel'"))
      .payment_status,
    "refunded",
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from notifications where title='Refund processed'",
      )
    ).n,
    1,
  );
});
test("an old refund never overwrites a later registration", async () => {
  const t = await event(500),
    r = await reserve(t);
  await pay(t, r, "old");
  await pg.query("select transition_registration($1,$2,'withdraw')", [
    r.id,
    player,
  ]);
  await pg.query("select process_refund('pay_old','rfnd_old',500)");
  const cp = await one("select * from chess_players where id=$1", [
    r.chess_player_id,
  ]);
  const next = await one(
    "select * from reserve_registration($1,$2,$3,$4,1400)",
    [t.id, player, cp.id, cp.username],
  );
  await pg.query("select process_refund('pay_old','rfnd_old',500)");
  assert.equal(
    (await one("select * from registrations where id=$1", [next.id])).status,
    "pending_payment",
  );
});
test("payment-order linkage rejects stale reservations and unauthorized owners", async () => {
  const t = await event(500),
    r = await reserve(t);
  await assert.rejects(
    () =>
      pg.query("select attach_payment_order($1,$2,'order_wrong',$3)", [
        other,
        r.id,
        r.expires_at,
      ]),
    /changed/,
  );
  await assert.rejects(
    () =>
      pg.query(
        "select attach_payment_order($1,$2,'order_stale',now()-interval '1 day')",
        [player, r.id],
      ),
    /changed/,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from payment_orders where registration_id=$1",
        [r.id],
      )
    ).n,
    0,
  );
});
test("moderation restores hidden posts and unlocks threads with audit history", async () => {
  const p = await one("select * from posts limit 1");
  await assert.rejects(
    () => pg.query("select moderate_content($1,$2,'hide')", [organizer, p.id]),
    /Not authorized/,
  );
  for (const action of ["hide", "lock", "restore", "unlock"])
    await pg.query("select moderate_content($1,$2,$3)", [admin, p.id, action]);
  const current = await one("select * from posts where id=$1", [p.id]);
  assert.equal(current.hidden, false);
  assert.equal(current.locked, false);
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from audit_logs where action like 'community.%'",
      )
    ).n,
    4,
  );
});
test("scheduled reminders and payment-hold expiry are idempotent", async () => {
  const t = await event();
  await reserve(t);
  await pg.query(
    "update tournaments set registration_closes=now()+interval '1 hour',starts_at=now()+interval '2 hours' where id=$1",
    [t.id],
  );
  const paid = await event(500),
    r = await reserve(paid);
  await pg.query(
    "update registrations set expires_at=now()-interval '1 minute' where id=$1",
    [r.id],
  );
  const first = await one("select run_maintenance() as result");
  assert.equal(first.result.reminders_sent, 1);
  assert.equal(first.result.expired_reservations, 1);
  const second = await one("select run_maintenance() as result");
  assert.equal(second.result.reminders_sent, 0);
  assert.equal(second.result.expired_reservations, 0);
  await pg.query(
    "update tournaments set registration_closes=now()+interval '5 minutes',starts_at=now()+interval '20 minutes' where id=$1",
    [t.id],
  );
  assert.equal(
    (await one("select run_maintenance() as result")).result.reminders_sent,
    1,
  );
});
test("suspended users cannot read private records through RLS", async () => {
  await pg.exec(
    "grant usage on schema public,auth to authenticated;grant select on all tables in schema public to authenticated;",
  );
  await pg.query(
    "select manage_account($1,$2,null,'suspended','Repeated abuse')",
    [admin, player],
  );
  await pg.exec(
    `set role authenticated;set request.jwt.claim.sub='${player}';`,
  );
  try {
    assert.equal(
      (await pg.query("select * from registrations")).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("select * from notifications")).rows.length,
      0,
    );
    await assert.rejects(
      () => pg.query("select run_maintenance()"),
      /permission denied/,
    );
  } finally {
    await pg.exec("reset role;");
  }
  await pg.query("select manage_account($1,$2,null,'active','')", [
    admin,
    player,
  ]);
});

test("consent is recorded and reviewed standings require registered players", async () => {
  const t = await event(),
    r = await reserve(t);
  assert.ok(r.rules_accepted_at);
  assert.equal(r.policy_version, "2026-10-31");
  const rows = [
    {
      username: r.username.toUpperCase(),
      score: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      tiebreak: 1,
    },
  ];
  await assert.rejects(
    () =>
      pg.query("select import_standings($1,$2,$3)", [organizer, t.id, rows]),
    /Close registration/,
  );
  await pg.query("update tournaments set status='closed' where id=$1", [t.id]);
  await assert.rejects(
    () =>
      pg.query("select import_standings($1,$2,$3)", [
        organizer,
        t.id,
        [{ ...rows[0], username: "unknown_player" }],
      ]),
    /approved tournament/,
  );
  await pg.query("select import_standings($1,$2,$3)", [organizer, t.id, rows]);
  await pg.query("select import_standings($1,$2,$3)", [organizer, t.id, rows]);
  const standings = await pg.query(
    "select * from standings where tournament_id=$1",
    [t.id],
  );
  assert.equal(standings.rows.length, 1);
  assert.equal((standings.rows[0] as any).username, r.username.toLowerCase());
});
