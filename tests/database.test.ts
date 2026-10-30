import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
const u1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  u2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const t1 = "11111111-1111-4111-8111-111111111111",
  t2 = "22222222-2222-4222-8222-222222222222",
  t3 = "33333333-3333-4333-8333-333333333333";
const c1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  c2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  c3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
async function one(sql: string, args: unknown[] = []) {
  return (await pg.query<Record<string, any>>(sql, args)).rows[0];
}
async function reserve(t: string, u: string, c: string, name: string) {
  return one("select * from reserve_registration($1,$2,$3,$4,1420)", [
    t,
    u,
    c,
    name,
  ]);
}
before(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`,
  );
  const schema = (
    await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")
  ).replace("create extension if not exists pgcrypto;", "");
  await pg.exec(schema);
  await pg.exec(
    `grant usage on schema public,auth to anon,authenticated;grant select,insert,update,delete on all tables in schema public to anon,authenticated;`,
  );
  await pg.query("insert into auth.users(id) values($1),($2)", [u1, u2]);
  await pg.query("update profiles set role='ORGANIZER' where id=$1", [u2]);
  for (const [id, fee] of [
    [t1, 0],
    [t2, 9900],
    [t3, 9900],
  ])
    await pg.query(
      "insert into tournaments(id,slug,title,description,category,format,time_control,starts_at,registration_closes,capacity,fee_paise,organizer_id,organizer_name,status,min_account_days) values($1::uuid,$1::text,'Test event','Test description','Rapid','Swiss','10 + 0',now()+interval '2 days',now()+interval '1 day',2,$2,$3,'Organizer','open',30)",
      [id, fee, u2],
    );
  for (const [id, name] of [
    [c1, "test_knight"],
    [c2, "second_knight"],
    [c3, "third_knight"],
  ])
    await pg.query(
      "insert into chess_players(id,username,rating,joined) values($1,$2,1420,1500000000)",
      [id, name],
    );
});
after(() => pg.close());
test("schema creates profiles without allowing metadata role escalation", async () => {
  const p = await one("select * from profiles where id=$1", [u1]);
  assert.equal(p.role, "USER");
});
test("free entry is atomic and duplicate registration is rejected", async () => {
  const r = await reserve(t1, u1, c1, "test_knight");
  assert.equal(r.status, "approved");
  assert.equal(r.payment_status, "free");
  await assert.rejects(
    () => reserve(t1, u2, c1, "TEST_KNIGHT"),
    /already registered/,
  );
});
test("capacity cannot be exceeded", async () => {
  await reserve(t1, u1, c2, "second_knight");
  await assert.rejects(() => reserve(t1, u1, c3, "third_knight"), /full/);
});
test("Chess.com usernames are case-insensitively unique", async () => {
  await assert.rejects(
    () =>
      pg.query(
        "insert into chess_players(username,joined) values($1,1500000000)",
        ["TEST_KNIGHT"],
      ),
    /unique/,
  );
});
test("server transaction independently enforces eligibility", async () => {
  await pg.query("update tournaments set max_rating=1200 where id=$1", [t3]);
  await assert.rejects(() => reserve(t3, u1, c1, "test_knight"), /rating/);
  await pg.query("update tournaments set max_rating=3000 where id=$1", [t3]);
  await pg.query(
    "update chess_players set joined=extract(epoch from now()) where id=$1",
    [c3],
  );
  await assert.rejects(() => reserve(t3, u1, c3, "third_knight"), /too new/);
});
test("RLS prevents reading other users registrations and writing roles", async () => {
  await pg.exec(`set role authenticated;set request.jwt.claim.sub='${u2}';`);
  try {
    const rows = await pg.query("select * from registrations");
    assert.equal(rows.rows.length, 0);
    const updated = await pg.query(
      "update profiles set role='ADMIN' where id=$1 returning *",
      [u2],
    );
    assert.equal(updated.rows.length, 0);
    await assert.rejects(
      () =>
        pg.query("select reserve_registration($1,$2,$3,$4,1420)", [
          t2,
          u2,
          c2,
          "second_knight",
        ]),
      /permission denied/,
    );
  } finally {
    await pg.exec("reset role;");
  }
});
test("organizer can approve only their own events; user cannot approve", async () => {
  await pg.query("update tournaments set auto_approve=false where id=$1", [t3]);
  const r = await reserve(t3, u1, c2, "second_knight");
  await assert.rejects(
    () =>
      pg.query("select transition_registration($1,$2,'approve')", [r.id, u1]),
    /Not authorized/,
  );
  await assert.rejects(
    () =>
      pg.query("select transition_registration($1,$2,'approve')", [r.id, u2]),
    /cannot be approved/,
  );
});
test("payment amount validated and duplicate callbacks are idempotent", async () => {
  const r = await reserve(t2, u1, c1, "test_knight");
  await pg.query("update registrations set order_id='order_test' where id=$1", [
    r.id,
  ]);
  await pg.query(
    "insert into payment_orders(order_id,registration_id,tournament_id,user_id,amount_paise,expires_at) values('order_test',$1,$2,$3,9900,now()+interval '15 minutes')",
    [r.id, t2, u1],
  );
  await assert.rejects(
    () => pg.query("select confirm_payment('order_test','pay_test',1)"),
    /amount mismatch/,
  );
  const first = await one(
    "select confirm_payment('order_test','pay_test',9900) as result",
  );
  assert.equal(first.result.status, "approved");
  await one("select confirm_payment('order_test','pay_test',9900)");
  const notices = await one(
    "select count(*) as count from notifications where title='Payment confirmed'",
  );
  assert.equal(Number(notices.count), 1);
});
test("withdrawal releases capacity and puts paid entry into refund queue", async () => {
  const r = await one(
    "select * from registrations where order_id='order_test'",
  );
  await pg.query("select transition_registration($1,$2,'withdraw')", [
    r.id,
    u1,
  ]);
  const updated = await one("select * from registrations where id=$1", [r.id]);
  assert.equal(updated.payment_status, "refund_requested");
  assert.equal(updated.status, "withdrawn");
  const order = await one(
    "select * from payment_orders where order_id='order_test'",
  );
  assert.equal(order.payment_status, "refund_requested");
  await assert.rejects(
    () => reserve(t2, u1, c1, "test_knight"),
    /previous paid/,
  );
});
test("late captured payment is recoverable even after a new reservation", async () => {
  const r = await one("select * from registrations where tournament_id=$1", [
    t3,
  ]);
  await pg.query(
    "update registrations set order_id='order_old',expires_at=now()-interval '1 minute' where id=$1",
    [r.id],
  );
  await pg.query(
    "insert into payment_orders(order_id,registration_id,tournament_id,user_id,amount_paise,expires_at) values('order_old',$1,$2,$3,9900,now()-interval '1 minute')",
    [r.id, t3, u1],
  );
  await reserve(t3, u1, c2, "second_knight");
  await pg.query("update registrations set order_id='order_new' where id=$1", [
    r.id,
  ]);
  const result = await one(
    "select confirm_payment('order_old','pay_old',9900) as result",
  );
  assert.equal(result.result.payment_status, "refund_requested");
  const current = await one("select * from registrations where id=$1", [r.id]);
  assert.equal(current.order_id, "order_new");
  assert.equal(current.payment_status, "unpaid");
  assert.equal(current.status, "pending_payment");
  const order = await one(
    "select * from payment_orders where order_id='order_old'",
  );
  assert.equal(order.payment_status, "refund_requested");
});
test("check-in cannot happen before the published window", async () => {
  const r = await one(
    "select * from registrations where tournament_id=$1 and chess_player_id=$2",
    [t1, c1],
  );
  await assert.rejects(
    () =>
      pg.query("select transition_registration($1,$2,'checkin')", [r.id, u1]),
    /closed/,
  );
});
test("database rate limiting enforces the configured bound", async () => {
  assert.equal(
    (await one("select consume_rate_limit('test',2,60) as ok")).ok,
    true,
  );
  assert.equal(
    (await one("select consume_rate_limit('test',2,60) as ok")).ok,
    true,
  );
  assert.equal(
    (await one("select consume_rate_limit('test',2,60) as ok")).ok,
    false,
  );
});

test("organizer cannot mutate an unassigned tournament", async () => {
  await pg.query("update tournaments set organizer_id=null where id=$1", [t1]);
  const r = await one(
    "select * from registrations where tournament_id=$1 limit 1",
    [t1],
  );
  await assert.rejects(
    () =>
      pg.query("select transition_registration($1,$2,'reject')", [r.id, u2]),
    /Not authorized/,
  );
  await pg.query("update tournaments set organizer_id=$1 where id=$2", [
    u2,
    t1,
  ]);
});
test("effective catalog count excludes expired payment holds", async () => {
  await pg.query(
    "update registrations set expires_at=now()-interval '1 minute' where tournament_id=$1 and status='pending_payment'",
    [t3],
  );
  const t = await one(
    "select active_participants from tournament_catalog where id=$1",
    [t3],
  );
  assert.equal(t.active_participants, 0);
});
