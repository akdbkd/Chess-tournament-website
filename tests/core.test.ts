import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  eligibility,
  tournamentSchema,
  isChessUrl,
  usernameSchema,
} from "../src/lib/validation";
import { tournaments } from "../src/lib/data";
import { validSignature } from "../src/lib/server";
import { csvCell, standingsCsv } from "../src/lib/csv";
const event = {
  ...tournaments[0],
  registration_closes: "2099-01-01T00:00:00Z",
  starts_at: "2099-01-02T00:00:00Z",
};
const player = {
  username: "eligible_player",
  rating: 1420,
  joined: 1500000000,
  url: "https://www.chess.com/member/eligible_player",
};
test("eligible existing player is accepted", () =>
  assert.deepEqual(eligibility(event, player), []));
test("rating cap is enforced", () =>
  assert.match(
    eligibility({ ...event, max_rating: 1200 }, player).join(),
    /Rating must/,
  ));
test("unrated players cannot bypass rating restrictions", () =>
  assert.match(
    eligibility(
      { ...event, max_rating: 1800 },
      { ...player, rating: null },
    ).join(),
    /established rating/,
  ));
test("deadline and status enforced", () => {
  assert.match(
    eligibility({ ...event, registration_closes: "2000-01-01" }, player).join(),
    /closed/,
  );
  assert.match(
    eligibility({ ...event, status: "draft" }, player).join(),
    /closed/,
  );
});
test("account-age requirement enforced", () =>
  assert.match(
    eligibility(event, { ...player, joined: Date.now() / 1000 }).join(),
    /30 days/,
  ));
test("username validator rejects paths and whitespace", () => {
  for (const s of ["../admin", "bad name", "<script>"])
    assert.equal(usernameSchema.safeParse(s).success, false);
});
test("Chess.com lobby accepts only exact host and supported event paths", () => {
  assert.equal(isChessUrl("https://www.chess.com/tournament/live/test"), true);
  for (const url of [
    "https://chess.com.evil.org/tournament/test",
    "javascript:alert(1)",
    "http://chess.com/tournament/x",
    "https://www.chess.com@evil.org/play/x",
    "https://www.chess.com/member/foo",
  ])
    assert.equal(isChessUrl(url), false);
});
test("tournament dates, negative fees and rating range validated", () => {
  assert.equal(tournamentSchema.safeParse(event).success, true);
  assert.equal(
    tournamentSchema.safeParse({ ...event, fee_paise: -10 }).success,
    false,
  );
  assert.equal(
    tournamentSchema.safeParse({ ...event, min_rating: 2000, max_rating: 1200 })
      .success,
    false,
  );
});
test("HMAC verifies exact payload and rejects replay with altered order", () => {
  const raw = "order_abc|pay_xyz",
    secret = "test_secret_only",
    sig = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(validSignature(raw, sig, secret), true);
  assert.equal(validSignature("order_different|pay_xyz", sig, secret), false);
  assert.equal(validSignature(raw, "00", secret), false);
  assert.equal(validSignature(raw, sig, "other"), false);
});
test("webhook HMAC is sensitive to raw whitespace", () => {
  const raw = '{"event":"payment.captured"}',
    sig = createHmac("sha256", "test").update(raw).digest("hex");
  assert.equal(validSignature(raw, sig, "test"), true);
  assert.equal(validSignature(raw + " ", sig, "test"), false);
});
test("CSV export neutralizes spreadsheet formula injection", () => {
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("standings CSV rejects invalid rows and fractional wins", () => {
  assert.deepEqual(
    standingsCsv(
      "username,score,wins,draws,losses,tiebreak\nplayer_one,6.5,6,1,0,31",
    )[0],
    {
      username: "player_one",
      score: 6.5,
      wins: 6,
      draws: 1,
      losses: 0,
      tiebreak: 31,
    },
  );
  assert.throws(() =>
    standingsCsv(
      "username,score,wins,draws,losses,tiebreak\nplayer_one,2,1.5,0,0,1",
    ),
  );
  assert.throws(() => standingsCsv("wrong,header"));
});
