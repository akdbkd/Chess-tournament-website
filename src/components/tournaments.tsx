"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowLeft,
  Clock3,
  Users,
  Trophy,
  CalendarDays,
  ShieldCheck,
  Bookmark,
  Share2,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "./provider";
import { TournamentCard, Empty, ChessArt, Badge, DownloadCalendar } from "./ui";
import { RegistrationModal } from "./forms";
import { date, time, money, sampleStandings } from "@/lib/data";
import { api } from "@/lib/supabase";
import type { Tournament, Standing } from "@/lib/types";
export function Tournaments() {
  const app = useApp(),
    params = useSearchParams(),
    router = useRouter();
  const [search, setSearch] = useState(params.get("q") || ""),
    [advanced, setAdvanced] = useState(false);
  const category = params.get("category") || "All",
    status = params.get("status") || "all",
    entry = params.get("entry") || "all",
    format = params.get("format") || "all",
    sort = params.get("sort") || "soonest",
    rating = params.get("rating") || "",
    when = params.get("when") || "all";
  const page = Number(params.get("page") || 1);
  useEffect(() => setSearch(params.get("q") || ""), [params]);
  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (value === "all" || value === "All" || !value) next.delete(key);
    else next.set(key, value);
    router.replace("/tournaments?" + next.toString(), { scroll: false });
  }
  const filtered = app.tournaments
    .filter((t) => {
      const now = Date.now(),
        days = (new Date(t.starts_at).getTime() - now) / 86400000;
      return (
        t.title.toLowerCase().includes((params.get("q") || "").toLowerCase()) &&
        (category === "All" || t.category === category) &&
        (status === "all" || t.status === status) &&
        (entry === "all" ||
          (entry === "free" ? t.fee_paise === 0 : t.fee_paise > 0)) &&
        (format === "all" || t.format === format) &&
        (!rating ||
          (Number(rating) >= t.min_rating && Number(rating) <= t.max_rating)) &&
        (when === "all" || (days >= 0 && days < Number(when)))
      );
    })
    .sort((a, b) =>
      sort === "prize"
        ? b.prize_paise - a.prize_paise
        : sort === "popular"
          ? b.participants - a.participants
          : sort === "latest"
            ? b.starts_at.localeCompare(a.starts_at)
            : sort === "deadline"
              ? a.registration_closes.localeCompare(b.registration_closes)
              : a.starts_at.localeCompare(b.starts_at),
    );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">PICK YOUR PACE. FIND YOUR PEOPLE.</div>
          <h1>
            Find your next challenge<span className="orange-text">.</span>
          </h1>
          <p>
            From your first open to the grand prize. There’s a board for you.
          </p>
        </div>
        <Link className="button secondary" href="/admin">
          Host a tournament
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="discovery-banner">
        <Trophy size={30} />
        <div>
          <strong>The November circuit is open</strong>
          <span>
            Rapid, blitz, and everything in between. Make this your month.
          </span>
        </div>
        <Badge color="green">
          {app.tournaments.filter((t) => t.status === "open").length} OPEN
          EVENTS
        </Badge>
      </div>
      <div className="filter-bar">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", search);
          }}
        >
          <Search size={18} />
          <input
            placeholder="Search tournaments..."
            aria-label="Search tournament name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="text-button">Search</button>
        </form>
        <select
          aria-label="Tournament status"
          value={status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Registration open</option>
          <option value="live">Live now</option>
          <option value="completed">Completed</option>
        </select>
        <select
          aria-label="Entry fee filter"
          value={entry}
          onChange={(e) => set("entry", e.target.value)}
        >
          <option value="all">Any entry fee</option>
          <option value="free">Free entry</option>
          <option value="paid">Paid entry</option>
        </select>
        <button
          className={"button secondary " + (advanced ? "selected" : "")}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Format
            <select
              value={format}
              onChange={(e) => set("format", e.target.value)}
            >
              <option value="all">Any format</option>
              {["Swiss", "Arena", "Round Robin", "Knockout"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Player rating
            <input
              type="number"
              min="0"
              max="4000"
              placeholder="e.g. 1500"
              value={rating}
              onChange={(e) => set("rating", e.target.value)}
            />
          </label>
          <label>
            Starting
            <select value={when} onChange={(e) => set("when", e.target.value)}>
              <option value="all">Any time</option>
              <option value="1">Next 24 hours</option>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
            </select>
          </label>
        </div>
      )}
      <div className="filter-tabs">
        <div className="tabs">
          {["All", "Rapid", "Blitz", "Bullet", "Classical"].map((x) => (
            <button
              key={x}
              className={category === x ? "active" : ""}
              onClick={() => set("category", x)}
            >
              {x === "All" ? "All tournaments" : x}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort tournaments"
          value={sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="soonest">Soonest first</option>
          <option value="latest">Latest first</option>
          <option value="popular">Most popular</option>
          <option value="deadline">Closing soon</option>
          <option value="prize">Highest prize pool</option>
        </select>
      </div>
      <div className="results-summary">
        <span>
          {filtered.length} tournaments{" "}
          <span className="muted">· All times IST</span>
        </span>
        {params.toString() && (
          <button
            className="text-button"
            onClick={() => router.replace("/tournaments")}
          >
            Clear all filters
          </button>
        )}
      </div>
      {filtered.length ? (
        <div className="tournament-grid">
          {filtered.slice((page - 1) * 6, page * 6).map((t) => (
            <TournamentCard t={t} key={t.id} />
          ))}
        </div>
      ) : (
        <Empty
          title="No tournaments match just yet"
          description="Try a different time control or clear your filters."
          action={
            <button
              className="button secondary"
              onClick={() => router.replace("/tournaments")}
            >
              Clear filters
            </button>
          }
        />
      )}
      <div className="pagination">
        {Array.from({ length: Math.ceil(filtered.length / 6) }, (_, i) => (
          <button
            key={i}
            className={page === i + 1 ? "active" : ""}
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.set("page", String(i + 1));
              router.replace("/tournaments?" + next.toString());
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
export function TournamentDetail({ slug }: { slug: string }) {
  const app = useApp(),
    t = app.tournaments.find((t) => t.slug === slug);
  const [tab, setTab] = useState("Overview"),
    [registration, setRegistration] = useState(false),
    [participants, setParticipants] = useState<
      { username: string; rating: number | null; status: string }[]
    >([]),
    [standings, setStandings] = useState<Standing[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!t) return;
    if (app.demo) {
      setParticipants(
        app.registrations.filter((r) => r.tournament_id === t.id),
      );
      setStandings(
        JSON.parse(localStorage.getItem("standings-" + t.id) || "null") ||
          (t.status === "completed" ? sampleStandings : []),
      );
    } else
      api("tournament/details?id=" + t.id)
        .then((d) => {
          setParticipants(d.participants);
          setStandings(d.standings);
        })
        .catch((e) => setError(e.message));
  }, [t, app.demo, app.registrations]);
  if (!t)
    return (
      <div className="page">
        <Empty
          title={app.ready ? "Tournament not found" : "Loading tournament…"}
          description="Explore the arena to find your next challenge."
          action={
            <Link className="button" href="/tournaments">
              Browse tournaments
            </Link>
          }
        />
      </div>
    );
  const closed =
    t.status !== "open" ||
    new Date(t.registration_closes).getTime() < Date.now() ||
    t.participants >= t.capacity;
  return (
    <div className="page">
      <Link className="back-link" href="/tournaments">
        <ArrowLeft size={15} />
        All tournaments
      </Link>
      <section className="detail-banner">
        <ChessArt variant={t.color} />
        <div>
          <Badge color={t.status === "open" ? "green" : ""}>
            {t.status === "open" ? "REGISTRATION OPEN" : t.status.toUpperCase()}
          </Badge>
          <h1>{t.title}</h1>
          <p>
            Organized by <strong>{t.organizer_name}</strong>
            <ShieldCheck size={15} />
          </p>
          <div className="detail-tags">
            <Badge>{t.format}</Badge>
            <Badge>
              {t.time_control} {t.category}
            </Badge>
            <Badge>
              {t.max_rating < 3000
                ? `${t.min_rating}–${t.max_rating} rating`
                : "Open to all ratings"}
            </Badge>
          </div>
        </div>
      </section>
      <div className="detail-layout">
        <div>
          <div className="tabs detail-tabs">
            {[
              "Overview",
              "Participants",
              "Rules",
              "Schedule",
              "Standings",
              "Community",
            ].map((x) => (
              <button
                key={x}
                className={tab === x ? "active" : ""}
                onClick={() => setTab(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {error && <div className="form-error">{error}</div>}
          {tab === "Overview" && (
            <div className="detail-content">
              <div className="eyebrow">THE CHALLENGE</div>
              <h2>A great game starts here.</h2>
              <p>{t.description}</p>
              <div className="detail-info-grid">
                <div>
                  <CalendarDays />
                  <small>DATE & TIME</small>
                  <strong>{date(t.starts_at)}</strong>
                  <span>{time(t.starts_at)}</span>
                </div>
                <div>
                  <Clock3 />
                  <small>TIME CONTROL</small>
                  <strong>
                    {t.time_control} {t.category}
                  </strong>
                  <span>{t.format} format</span>
                </div>
                <div>
                  <Users />
                  <small>PLAYER FIELD</small>
                  <strong>{t.capacity} players</strong>
                  <span>
                    {t.max_rating < 3000
                      ? `Rating ${t.min_rating}–${t.max_rating}`
                      : "All ratings welcome"}
                  </span>
                </div>
                <div>
                  <Trophy />
                  <small>PRIZE POOL</small>
                  <strong>
                    {t.prize_paise ? money(t.prize_paise) : "Community event"}
                  </strong>
                  <span>Subject to fair play review</span>
                </div>
              </div>
              <h3>Who can enter?</h3>
              <ul className="check-list">
                <li>
                  <CheckCircle2 />A valid Chess.com account at least{" "}
                  {t.min_account_days} days old.
                </li>
                <li>
                  <CheckCircle2 />
                  {t.max_rating < 3000
                    ? `${t.category} rating between ${t.min_rating} and ${t.max_rating}.`
                    : "Players of all ratings are welcome."}
                </li>
                <li>
                  <CheckCircle2 />
                  One entry per Chess.com player. You may register for someone
                  else.
                </li>
                <li>
                  <CheckCircle2 />
                  All participants must follow the fair play rules.
                </li>
              </ul>
              <div className="info-panel">
                <ShieldCheck size={22} />
                <div>
                  <strong>Registered here. Played on Chess.com.</strong>
                  <p>
                    Registering on Knightfall does not automatically join the
                    Chess.com event. Open the organizer’s lobby link and join
                    before the first round.
                  </p>
                </div>
              </div>
            </div>
          )}
          {tab === "Participants" && (
            <div className="detail-content">
              <h2>The player field</h2>
              <p className="muted">
                {app.demo
                  ? "Demo entries are listed below. Card counts are sample figures."
                  : "Approved players will appear here."}
              </p>
              <div className="search-field">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a player"
                  aria-label="Search participants"
                />
              </div>
              {participants.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Chess.com player</th>
                        <th>Rating</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants
                        .filter((p) =>
                          p.username
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((p) => (
                          <tr key={p.username}>
                            <td>{p.username}</td>
                            <td>{p.rating ?? "Unrated"}</td>
                            <td>
                              <Badge color="green">
                                {p.status.replaceAll("_", " ")}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="The field is taking shape"
                  description="Confirmed entries will appear here. Be among the first."
                />
              )}
            </div>
          )}
          {tab === "Rules" && (
            <div className="detail-content prose">
              <h2>Respect the game.</h2>
              <h3>1. Fair play</h3>
              <p>
                No engines, outside assistance, sandbagging, or account sharing
                during games. Chess.com fair play policies apply. Suspicious
                results may be withheld pending review.
              </p>
              <h3>2. Eligibility & registration</h3>
              <p>
                Players must meet the published rating and account-age
                requirements at registration. Use an accurate Chess.com
                username. One entry per player per tournament.
              </p>
              <h3>3. Attendance</h3>
              <p>
                Check in during the 30-minute window before the scheduled start.
                Join the Chess.com lobby separately. Late arrival may result in
                missed rounds; connection stability is the player’s
                responsibility.
              </p>
              <h3>4. Results & prizes</h3>
              <p>
                The organizer publishes reviewed standings. Chess.com’s event
                format and tie-break rules apply. Prize distribution and payout
                details must be announced by the organizer before entry opens;
                demo prize amounts are illustrative.
              </p>
              <h3>5. Withdrawals</h3>
              <p>
                Withdraw through your dashboard before the event begins.
                Eligible paid withdrawals enter the organizer’s refund review
                queue. See the <Link href="/legal/refunds">refund policy</Link>.
              </p>
            </div>
          )}
          {tab === "Schedule" && (
            <div className="detail-content">
              <h2>Your match-day timeline</h2>
              {[
                {
                  name: "Registration closes",
                  at: t.registration_closes,
                  body: "All player entries and payments must be complete.",
                },
                {
                  name: "Check-in opens",
                  at: new Date(
                    new Date(t.starts_at).getTime() - 1800000,
                  ).toISOString(),
                  body: "Check in from My registrations and open the Chess.com lobby.",
                },
                {
                  name: "First round / arena begins",
                  at: t.starts_at,
                  body: "Pairings and games run on Chess.com. Follow the in-platform round timer.",
                },
              ].map((s, i) => (
                <div className="timeline-item" key={s.name}>
                  <span>{i + 1}</span>
                  <div>
                    <small>
                      {date(s.at, true)} · {time(s.at)}
                    </small>
                    <h3>{s.name}</h3>
                    <p>{s.body}</p>
                  </div>
                </div>
              ))}
              <DownloadCalendar t={t} />
            </div>
          )}
          {tab === "Standings" && (
            <div className="detail-content">
              <h2>Every point counts.</h2>
              <p className="muted">
                {app.demo
                  ? "Illustrative results for completed demo events."
                  : "Standings are imported and reviewed by the organizer."}
              </p>
              <StandingsTable rows={standings} />
            </div>
          )}
          {tab === "Community" && (
            <div className="detail-content">
              <h2>Talk about the tournament</h2>
              <p>
                Find fellow players, ask about the event, or share your
                preparation in tournament discussions.
              </p>
              <Link
                className="button"
                href={
                  "/community?category=Tournament%20Discussion&tournament=" +
                  t.id
                }
              >
                Open tournament discussions
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
        </div>
        <aside className="registration-panel panel">
          <div className="eyebrow">YOUR SEAT AT THE BOARD</div>
          <div className="entry-price">
            {t.fee_paise ? money(t.fee_paise) : "Free"}
            <span>{t.fee_paise ? "per player" : "entry"}</span>
          </div>
          <div className="registration-capacity">
            <Users size={16} />
            <strong>{t.participants}</strong> / {t.capacity} players
          </div>
          <div className="capacity-track">
            <i
              style={{
                width: Math.min(100, (t.participants / t.capacity) * 100) + "%",
              }}
            />
          </div>
          <p className="small-text muted">
            {Math.max(0, t.capacity - t.participants)} spots remaining
          </p>
          <button
            className="button full"
            disabled={closed}
            onClick={() => {
              if (app.requireAuth()) setRegistration(true);
            }}
          >
            {closed ? "Registration unavailable" : "Register a player"}
            <ArrowUpRight size={18} />
          </button>
          <button
            className="button secondary full"
            onClick={() => app.save(t.id)}
          >
            <Bookmark
              size={16}
              fill={app.saved.includes(t.id) ? "currentColor" : "none"}
            />
            {app.saved.includes(t.id)
              ? "Saved to your playbook"
              : "Save for later"}
          </button>
          <div className="deadline">
            <Clock3 size={15} />
            <span>
              Registration closes
              <br />
              <strong>
                {date(t.registration_closes, true)} ·{" "}
                {time(t.registration_closes)}
              </strong>
            </span>
          </div>
          <div className="divider" />
          <div className="chess-lobby">
            <strong>
              Meet you on Chess.com
              <ExternalLink size={14} />
            </strong>
            <p>
              {t.chess_url
                ? "The organizer has shared the event lobby. Join it separately before the first round."
                : "The organizer will add the event lobby before the tournament begins."}
            </p>
            {t.chess_url && (
              <a
                className="text-link"
                href={t.chess_url}
                target="_blank"
                rel="noreferrer"
              >
                Open tournament lobby
                <ArrowUpRight size={14} />
              </a>
            )}
          </div>
          <button
            className="share-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                app.notify("Tournament link copied.");
              } catch {
                app.notify("Copy the tournament URL from your address bar.");
              }
            }}
          >
            <Share2 size={15} />
            Share this tournament
          </button>
        </aside>
      </div>
      {registration && (
        <RegistrationModal t={t} onClose={() => setRegistration(false)} />
      )}
    </div>
  );
}
export function StandingsTable({ rows }: { rows: Standing[] }) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Score</th>
            <th>W / D / L</th>
            <th>Tie-break</th>
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak)
            .map((s, i) => (
              <tr key={s.username}>
                <td>
                  <span className={"rank rank-" + i}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </td>
                <td>{s.username}</td>
                <td>
                  <strong>{s.score}</strong>
                </td>
                <td>
                  {s.wins} / {s.draws} / {s.losses}
                </td>
                <td>{s.tiebreak}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="The story is still being written"
      description="Reviewed results will appear after the organizer publishes standings."
    />
  );
}
export function Leaderboard() {
  const app = useApp();
  const [selected, setSelected] = useState(""),
    [rows, setRows] = useState<Standing[]>([]),
    [error, setError] = useState("");
  const completed = app.tournaments.filter((t) => t.status === "completed");
  useEffect(() => {
    const id = selected || completed[0]?.id;
    if (!id) return;
    if (app.demo)
      setRows(
        JSON.parse(localStorage.getItem("standings-" + id) || "null") ||
          sampleStandings,
      );
    else
      api("tournament/details?id=" + id)
        .then((d) => setRows(d.standings))
        .catch((e) => setError(e.message));
  }, [selected, app.demo, app.tournaments]);
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">EARNED, ONE MOVE AT A TIME</div>
          <h1>
            The leaderboard<span className="orange-text">.</span>
          </h1>
          <p>
            Great games. Standout performances. The players who rose to the top.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>Tournament standings</h2>
          <select
            aria-label="Select tournament standings"
            value={selected || completed[0]?.id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {completed.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        {app.demo && (
          <p className="muted small-text">Sample results · October circuit</p>
        )}
        {error && <div className="form-error">{error}</div>}
        <StandingsTable rows={rows} />
      </div>
    </div>
  );
}
