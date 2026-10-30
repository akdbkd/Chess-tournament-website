"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Trophy,
  Users,
  ShieldCheck,
  Globe,
  ChevronRight,
  PlayCircle,
  Search,
  ClipboardCheck,
  Gamepad2,
  Crown,
  Quote,
  Clock3,
  Flag,
} from "lucide-react";
import { useApp } from "./provider";
import { ChessArt, TournamentCard, SectionTitle, Badge } from "./ui";
import { date, time, money, sampleStandings } from "@/lib/data";
import { api } from "@/lib/supabase";
import type { Standing } from "@/lib/types";
export function Home() {
  const app = useApp();
  const upcoming = app.tournaments
    .filter((t) => t.status === "open")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const next = app.tournaments.find((t) => t.status === "live") || upcoming[0];
  return (
    <div className="page home-page">
      <section className="hero premium-hero">
        <ChessArt hero />
        <div className="hero-copy">
          <div className="hero-kicker">
            <span />
            COMPETITIVE CHESS TOURNAMENTS
          </div>
          <h1>
            <em>A higher</em>
            <br />
            level of chess.
          </h1>
          <p>
            Discover tournaments. Test your skills.
            <br className="mobile-break" /> Compete for glory.
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/tournaments">
              Explore tournaments
              <ArrowRight size={18} />
            </Link>
            <Link className="hero-secondary" href="/about">
              <PlayCircle size={18} />
              How it works
            </Link>
          </div>
          <div className="hero-platform">
            <ShieldCheck size={15} />
            <span>
              Organized here. Played on <b>Chess.com</b>
              <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
        <div className="hero-quote">
          <Quote size={23} />
          <p>
            Not just a game.
            <br />
            <strong>A battlefield of minds.</strong>
          </p>
          <span />
        </div>
        <div className="stats-row hero-stats">
          {[
            {
              icon: Users,
              value: app.demo
                ? "730"
                : String(
                    app.tournaments.reduce((n, t) => n + t.participants, 0),
                  ),
              label: app.demo ? "Sample player entries" : "Player entries",
            },
            {
              icon: Trophy,
              value: String(upcoming.length).padStart(2, "0"),
              label: "Open tournaments",
            },
            {
              icon: Flag,
              value: String(
                app.tournaments.filter((t) => t.status === "completed").length,
              ).padStart(2, "0"),
              label: "Completed events",
            },
            {
              icon: Globe,
              value: money(upcoming.reduce((n, t) => n + t.prize_paise, 0)),
              label: app.demo ? "Sample prize pools" : "Listed prize pools",
            },
          ].map((s) => (
            <div className="stat" key={s.label}>
              <span className="stat-icon">
                <s.icon size={24} />
              </span>
              <div>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="home-tournaments">
        <SectionTitle
          title="Featured tournaments"
          href="/tournaments"
          label="View all tournaments"
        />
        <div className="spotlight-toolbar">
          <p>Handpicked tournaments you won’t want to miss.</p>
          <span className="time-zone">All times in IST · UTC+5:30</span>
        </div>
        <div className="tournament-grid">
          {app.tournaments
            .filter((t) => t.status === "open")
            .slice(0, 3)
            .map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
        </div>
        {!app.ready && !app.demo && (
          <div className="loading-line">Loading the arena…</div>
        )}
      </section>
      {next && (
        <section className="next-arena">
          <SectionTitle
            title={
              next.status === "live" ? "Live in the arena" : "Next in the arena"
            }
            href={
              next.status === "live"
                ? "/tournaments?status=live"
                : "/tournaments"
            }
            label={
              next.status === "live"
                ? "View live events"
                : "Explore the schedule"
            }
          />
          <Link className="arena-feature" href={"/tournaments/" + next.slug}>
            <div className="arena-feature-art">
              <ChessArt variant={next.color} />
              <Badge color={next.status === "live" ? "red" : "orange"}>
                {next.status === "live" ? "● LIVE NOW" : "UP NEXT"}
              </Badge>
            </div>
            <div className="arena-feature-copy">
              <div className="eyebrow">YOUR NEXT CHALLENGE AWAITS</div>
              <h3>{next.title}</h3>
              <div className="arena-tags">
                <Badge>{next.format}</Badge>
                <Badge>{next.time_control}</Badge>
                <Badge>
                  <Globe size={12} />
                  Chess.com
                </Badge>
              </div>
              <p>
                <CalendarDays size={14} />
                {date(next.starts_at, true)}
                <span>·</span>
                {time(next.starts_at)}
              </p>
            </div>
            <div className="arena-feature-prize">
              <small>PLAY FOR SOMETHING BIGGER</small>
              <strong>
                {next.prize_paise
                  ? money(next.prize_paise)
                  : "The love of the game"}
              </strong>
              <span>
                <Users size={14} />
                {next.participants} / {next.capacity} players registered
              </span>
            </div>
            <span className="arena-feature-arrow">
              <ArrowUpRight size={23} />
            </span>
          </Link>
        </section>
      )}
      <div className="home-lower">
        <section className="schedule-panel">
          <SectionTitle
            title="Upcoming tournaments"
            href="/tournaments"
            label="Full schedule"
          />
          <p className="section-subtitle">See what’s coming next.</p>
          <div className="schedule-list">
            {upcoming.slice(0, 4).map((t) => (
              <Link
                href={"/tournaments/" + t.slug}
                className="schedule-row"
                key={t.id}
              >
                <div className="date-tile">
                  <span>
                    {new Date(t.starts_at).toLocaleDateString("en-IN", {
                      month: "short",
                      timeZone: "Asia/Kolkata",
                    })}
                  </span>
                  <strong>
                    {new Date(t.starts_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}
                  </strong>
                </div>
                <div className="schedule-thumb">
                  <ChessArt variant={t.color} />
                </div>
                <div className="schedule-copy">
                  <h3>{t.title}</h3>
                  <p>
                    {t.category} <span>·</span> {t.time_control} <span>·</span>{" "}
                    {time(t.starts_at)}
                  </p>
                </div>
                <Badge color={t.fee_paise ? "" : "green"}>
                  {t.fee_paise ? money(t.fee_paise) : "Free"}
                </Badge>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </section>
        <HomeLeaderboard />
      </div>
      <section className="how-section">
        <SectionTitle title="How it works">
          <span className="section-subtitle">
            Your next great game is just a few moves away.
          </span>
        </SectionTitle>
        <div className="how-strip">
          {[
            {
              n: "01",
              icon: Search,
              title: "Discover",
              body: "Find a tournament that matches your pace and rating.",
            },
            {
              n: "02",
              icon: ClipboardCheck,
              title: "Register",
              body: "Verify a player and secure a seat at the board.",
            },
            {
              n: "03",
              icon: Gamepad2,
              title: "Compete",
              body: "Check in, join Chess.com, and make your moves.",
            },
            {
              n: "04",
              icon: Trophy,
              title: "Rise",
              body: "Track reviewed results. Celebrate every improvement.",
            },
          ].map((s) => (
            <div className="how-step" key={s.n}>
              <span>{s.n}</span>
              <div className="how-icon">
                <s.icon size={26} />
              </div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="fairplay-strip">
        <ShieldCheck size={24} />
        <div>
          <strong>Good chess starts with fair play.</strong>
          <span>Real players. Clear rules. Respect for the game.</span>
        </div>
        <Link href="/legal/fair-play">
          Our fair play promise
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
function HomeLeaderboard() {
  const app = useApp();
  const [rows, setRows] = useState<Standing[]>(app.demo ? sampleStandings : []);
  const completed = app.tournaments.find((t) => t.status === "completed");
  useEffect(() => {
    if (!app.demo && completed)
      api("tournament/details?id=" + completed.id)
        .then((d) => setRows(d.standings))
        .catch(() => setRows([]));
  }, [app.demo, completed]);
  return (
    <section className="home-leaderboard">
      <SectionTitle
        title="Circuit leaderboard"
        href="/leaderboard"
        label="View leaderboard"
      />
      <p className="section-subtitle">
        {app.demo
          ? "October circuit · Sample results"
          : "The latest organizer-reviewed results."}
      </p>
      <div className="leaderboard-panel">
        <div className="leaderboard-heading">
          <span>#</span>
          <span>Player</span>
          <span>Score</span>
        </div>
        {[...rows]
          .sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak)
          .slice(0, 5)
          .map((s, i) => (
            <div className="leaderboard-row" key={s.username}>
              <span className={"podium podium-" + i}>
                {i < 3 ? <Crown size={20} /> : i + 1}
              </span>
              <span className={"leaderboard-avatar avatar-" + i}>
                {s.username.slice(0, 2).toUpperCase()}
              </span>
              <strong>{s.username}</strong>
              <span className="leaderboard-score">{s.score.toFixed(1)}</span>
            </div>
          ))}
        {!rows.length && (
          <p className="leaderboard-empty">
            The next champions are still making their moves. Reviewed standings
            will appear here.
          </p>
        )}
      </div>
    </section>
  );
}
