import { tournaments } from "../src/lib/data";
export const localAccounts = [
  { name: "Local Admin", email: "admin@knightfall.test", role: "ADMIN" },
  {
    name: "Local Organizer",
    email: "organizer@knightfall.test",
    role: "ORGANIZER",
  },
  { name: "Local Player", email: "player@knightfall.test", role: "USER" },
  { name: "Local Suspended", email: "suspended@knightfall.test", role: "USER" },
] as const;
export function assertLocalSeedTarget(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Local seeding requires a plain HTTP loopback Supabase URL. Hosted projects are refused.",
    );
  return url.origin;
}
const id = (group: number, n: number) =>
  `${group}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function localFixtures(
  users: { admin: string; organizer: string; player: string },
  now = Date.now(),
) {
  const iso = (minutes: number) =>
    new Date(now + minutes * 60000).toISOString();
  const events = tournaments.map((t, i) => ({
    ...t,
    id: id(9, i + 1),
    slug: `local-test-${i + 1}`,
    title: `[LOCAL TEST] ${t.title}`,
    description:
      "Local-only fixture. Player identities, entries and payments are synthetic. No real Chess.com event or payment was created.",
    organizer_id: users.admin,
    organizer_name: "Local Admin",
    participants: 0,
    starts_at: iso((i + 1) * 1440),
    registration_closes: iso((i + 1) * 1440 - 60),
    status: "open",
    fee_paise: 0,
    prize_paise: 0,
    capacity: 8,
    chess_url: "",
    min_account_days: i === 2 ? 90 : 30,
  }));
  events[1].auto_approve = false;
  events[3] = {
    ...events[3],
    starts_at: iso(15),
    registration_closes: iso(-1),
    status: "closed",
  };
  events[4] = {
    ...events[4],
    starts_at: iso(-1440),
    registration_closes: iso(-1500),
    status: "completed",
  };
  events[5] = { ...events[5], fee_paise: 9900, status: "closed" };
  events[6] = {
    ...events[6],
    status: "draft",
    organizer_id: users.organizer,
    organizer_name: "Local Organizer",
  };
  const players = [
    "local_seed_rook",
    "local_seed_knight",
    "local_seed_new",
  ].map((username, i) => ({
    id: id(8, i + 1),
    username,
    rating: 1200 + i * 200,
    joined: Math.floor(now / 1000) - (i === 2 ? 7 : 365) * 86400,
  }));
  const registrations = [
    {
      id: id(7, 1),
      tournament_id: events[0].id,
      chess_player_id: players[0].id,
      registered_by: users.player,
      username: players[0].username,
      rating: 1200,
      status: "approved",
      payment_status: "free",
      amount_paise: 0,
    },
    {
      id: id(7, 2),
      tournament_id: events[1].id,
      chess_player_id: players[1].id,
      registered_by: users.player,
      username: players[1].username,
      rating: 1400,
      status: "pending",
      payment_status: "free",
      amount_paise: 0,
    },
    {
      id: id(7, 3),
      tournament_id: events[3].id,
      chess_player_id: players[0].id,
      registered_by: users.player,
      username: players[0].username,
      rating: 1200,
      status: "approved",
      payment_status: "free",
      amount_paise: 0,
    },
    {
      id: id(7, 4),
      tournament_id: events[4].id,
      chess_player_id: players[0].id,
      registered_by: users.player,
      username: players[0].username,
      rating: 1200,
      status: "checked_in",
      payment_status: "free",
      amount_paise: 0,
    },
    {
      id: id(7, 5),
      tournament_id: events[5].id,
      chess_player_id: players[0].id,
      registered_by: users.player,
      username: players[0].username,
      rating: 1200,
      status: "withdrawn",
      payment_status: "refund_requested",
      amount_paise: 9900,
      order_id: "order_localseed01",
      payment_id: "pay_localseed01",
    },
  ];
  for (const t of events)
    t.participants = registrations.filter(
      (r) =>
        r.tournament_id === t.id &&
        ["approved", "pending", "checked_in"].includes(r.status),
    ).length;
  return {
    tournaments: events,
    chess_players: players,
    registrations,
    payment_orders: [
      {
        order_id: "order_localseed01",
        registration_id: id(7, 5),
        tournament_id: events[5].id,
        user_id: users.player,
        amount_paise: 9900,
        expires_at: iso(-60),
        payment_id: "pay_localseed01",
        payment_status: "refund_requested",
      },
    ],
    posts: [
      {
        id: id(6, 1),
        author_id: users.player,
        author_name: "Local Player",
        title: "[LOCAL TEST] Practice partners",
        body: "A synthetic discussion for testing replies, reports, locking and hiding.",
        category: "General",
      },
    ],
    comments: [
      {
        id: id(5, 1),
        post_id: id(6, 1),
        author_id: users.admin,
        author_name: "Local Admin",
        body: "Local moderation test reply.",
      },
    ],
    reports: [
      {
        id: id(4, 1),
        post_id: id(6, 1),
        user_id: users.admin,
        reason: "Synthetic moderation report for local testing.",
        status: "open",
      },
    ],
    standings: [
      {
        tournament_id: events[4].id,
        username: players[0].username,
        score: 3,
        wins: 3,
        draws: 0,
        losses: 0,
        tiebreak: 5,
      },
    ],
    saved_tournaments: [{ user_id: users.player, tournament_id: events[2].id }],
    notifications: [
      {
        id: id(3, 1),
        user_id: users.player,
        title: "Local fixture account ready",
        body: "Test approval, check-in, standings and notifications. Payments are synthetic.",
        read: false,
      },
    ],
  };
}
