"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Trophy,
  Users,
  ShieldCheck,
  Zap,
  Globe,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { useApp } from "./provider";
import { ChessArt, TournamentCard, SectionTitle, Badge } from "./ui";
import { date, time, money } from "@/lib/data";
export function Home() {
  const app = useApp(),
    featured = app.tournaments.find((t) => t.featured) || app.tournaments[0];
  return (
    <div className="page home-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span className="status-dot green" />
            THE NEXT CHAPTER OF COMPETITIVE CHESS
          </div>
          <h1>
            Welcome to the arena<span className="orange-text">.</span>
          </h1>
          <p>Find your tournament. Make your move. Leave your mark.</p>
        </div>
        <Link href="/tournaments" className="quiet-link">
          Explore the circuit
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span />
            NOVEMBER CIRCUIT 2026
          </div>
          <h2>
            Your next move.
            <br />
            Your next <em>victory.</em>
          </h2>
          <p>
            Real competition. A level playing field.
            <br />
            Online chess tournaments for the player in you.
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/tournaments">
              Find your tournament
              <ArrowUpRight size={18} />
            </Link>
            <Link className="hero-secondary" href="/about">
              How it works
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-platform">
            <ShieldCheck size={15} />
            <span>
              Organized here. Played on <b>chess.com</b>
              <ArrowUpRight size={11} />
            </span>
          </div>
        </div>
        <ChessArt hero />
        <div className="hero-bottom-label">
          <span className="status-dot green" />
          YOUR COMPETITIVE EDGE STARTS HERE<span>EST. 2026</span>
        </div>
      </section>
      <div className="stats-row">
        {[
          {
            icon: Trophy,
            value: String(
              app.tournaments.filter((t) => t.status === "open").length,
            ).padStart(2, "0"),
            label: "Open tournaments",
            detail: "Your next challenge awaits",
          },
          {
            icon: Users,
            value: app.demo
              ? "730"
              : String(app.tournaments.reduce((n, t) => n + t.participants, 0)),
            label: app.demo ? "Sample player entries" : "Player entries",
            detail: "One shared love for the game",
          },
          {
            icon: Zap,
            value: money(
              app.tournaments
                .filter((t) => t.status === "open")
                .reduce((n, t) => n + t.prize_paise, 0),
            ),
            label: app.demo ? "Sample prize pools" : "Listed prize pools",
            detail: "Make every move count",
          },
          {
            icon: Globe,
            value: "100% online",
            label: "Play from anywhere",
            detail: "Every game on Chess.com",
          },
        ].map((s, i) => (
          <div className="stat" key={s.label}>
            <span className={"stat-icon stat-" + i}>
              <s.icon size={20} />
            </span>
            <div>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
              <small>{s.detail}</small>
            </div>
          </div>
        ))}
      </div>
      <section className="home-tournaments">
        <SectionTitle
          eyebrow="FIND YOUR NEXT CHALLENGE"
          title="Tournaments in the spotlight"
          href="/tournaments"
          label="All tournaments"
        />
        <div className="spotlight-toolbar">
          <div>
            <span className="live-indicator" />
            <strong>Registration is open</strong>
            <span className="muted">Your seat at the board is waiting.</span>
          </div>
          <span className="time-zone">All times in IST (UTC+5:30)</span>
        </div>
        <div className="tournament-grid">
          {app.tournaments
            .filter((t) => t.status === "open")
            .slice(0, 3)
            .map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
        </div>
        {!app.ready && <div className="loading-line">Loading the arena…</div>}
      </section>
      <div className="home-lower">
        <section className="panel schedule-panel">
          <SectionTitle
            title="On the horizon"
            href="/tournaments"
            label="Full schedule"
          />
          {app.tournaments
            .filter((t) => t.status === "open")
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, 3)
            .map((t) => (
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
                <div>
                  <h3>{t.title}</h3>
                  <p>
                    {t.category} · {t.time_control} · {time(t.starts_at)}
                  </p>
                </div>
                <Badge color={t.fee_paise ? "" : "green"}>
                  {t.fee_paise ? money(t.fee_paise) : "Free"}
                </Badge>
                <ChevronRight size={17} />
              </Link>
            ))}
        </section>
        <section className="community-teaser">
          <div className="eyebrow">BETTER TOGETHER</div>
          <div className="community-avatars">
            <span>AS</span>
            <span>MK</span>
            <span>RV</span>
            <span>
              <Users size={17} />
            </span>
          </div>
          <h2>
            More than a leaderboard.
            <br />
            Find your chess people.
          </h2>
          <p>
            Trade ideas, find practice partners, and talk through the moves that
            mattered.
          </p>
          <Link href="/community" className="text-link">
            Join the conversation
            <ArrowUpRight size={17} />
          </Link>
        </section>
      </div>
      <section className="how-strip">
        <div>
          <div className="eyebrow">FROM FIRST CLICK TO FIRST MOVE</div>
          <h2>Less setup. More chess.</h2>
        </div>
        {[
          {
            n: "01",
            title: "Find your arena",
            body: "Pick your pace, rating, and stakes.",
          },
          {
            n: "02",
            title: "Secure your spot",
            body: "Verify a player and register in minutes.",
          },
          {
            n: "03",
            title: "Make your move",
            body: "Check in and compete on Chess.com.",
          },
        ].map((s) => (
          <div className="how-step" key={s.n}>
            <span>{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>
      <div className="fairplay-strip">
        <ShieldCheck size={22} />
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
