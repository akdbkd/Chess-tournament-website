"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  X,
  ArrowUpRight,
  Clock3,
  Users,
  CalendarDays,
  Bookmark,
  ChevronRight,
  Trophy,
} from "lucide-react";
import { useApp } from "./provider";
import type { Tournament } from "@/lib/types";
import { money, date, time } from "@/lib/data";
export function Knight({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 120"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22 97h59l6 13H16l6-13Zm8-8c3-21 19-28 23-42L34 62 15 54l7-17L45 17 50 5l13 12c23 8 27 33 16 53l-8 19H30Z" />
      <path d="m30 42 10-4-5 8z" fill="var(--eye,#151715)" />
    </svg>
  );
}
export function ChessArt({
  variant = "orange",
  hero = false,
}: {
  variant?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={"chess-art " + variant + (hero ? " hero-art" : "")}
      aria-hidden="true"
    >
      <img
        className="chess-photograph"
        src={
          hero
            ? "/art/golden-knight.webp"
            : variant === "purple" || variant === "blue"
              ? "/art/silver-knight.webp"
              : "/art/golden-king.webp"
        }
        alt=""
        loading={hero ? "eager" : "lazy"}
        decoding="async"
      />
      <div className="photograph-shade" />
    </div>
  );
}
export function Badge({
  children,
  color = "",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return <span className={"badge " + color}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,textarea,[tabindex="0"]',
          ) || [],
        ).filter((x) => !x.hasAttribute("disabled"));
        const first = all[0],
          last = all[all.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function TournamentCard({ t }: { t: Tournament }) {
  const app = useApp();
  const status =
    t.status === "open"
      ? "Registration open"
      : t.status === "completed"
        ? "Completed"
        : t.status === "live"
          ? "Live now"
          : t.status === "draft"
            ? "Draft"
            : "Registration closed";
  return (
    <article className={"tournament-card tournament-" + t.color}>
      <Link
        href={"/tournaments/" + t.slug}
        className="card-art-link"
        aria-label={"View " + t.title}
      >
        <ChessArt variant={t.color} />
        <div className="card-art-label">
          <Badge color={t.status === "open" ? "green" : ""}>
            {status.toUpperCase()}
          </Badge>
          <Badge>{t.format.toUpperCase()}</Badge>
        </div>
        <span className="card-art-bottom">
          {t.time_control} <i /> {t.category}
        </span>
      </Link>
      <div className="card-body">
        <Link href={"/tournaments/" + t.slug}>
          <h3>{t.title}</h3>
        </Link>
        <div className="card-meta">
          <span>
            <CalendarDays size={14} />
            {date(t.starts_at, true)}
          </span>
          <span>
            <Clock3 size={14} />
            {time(t.starts_at)}
          </span>
        </div>
        <div className="card-metrics">
          <div>
            <strong>{t.prize_paise ? money(t.prize_paise) : "Glory"}</strong>
            <small>Prize pool</small>
          </div>
          <div>
            <strong>{t.fee_paise ? money(t.fee_paise) : "Free"}</strong>
            <small>Entry fee</small>
          </div>
          <div>
            <strong>
              {t.participants}
              <em>/{t.capacity}</em>
            </strong>
            <small>Registered</small>
          </div>
        </div>
        <div className="capacity-track">
          <i
            style={{
              width: Math.min(100, (t.participants / t.capacity) * 100) + "%",
            }}
          />
        </div>
        <div className="card-bottom">
          <Link href={"/tournaments/" + t.slug} className="button">
            View tournament
            <ArrowUpRight size={17} />
          </Link>
          <button
            className={
              "icon-button bookmark " +
              (app.saved.includes(t.id) ? "active" : "")
            }
            aria-label={
              (app.saved.includes(t.id) ? "Unsave " : "Save ") + t.title
            }
            onClick={() => app.save(t.id)}
          >
            <Bookmark
              size={18}
              fill={app.saved.includes(t.id) ? "currentColor" : "none"}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Trophy size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  href,
  label = "View all",
  children,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="text-link">
          {label}
          <ChevronRight size={16} />
        </Link>
      ) : (
        children
      )}
    </div>
  );
}
export function DownloadCalendar({ t }: { t: Tournament }) {
  function download() {
    const start = new Date(t.starts_at),
      end = new Date(start.getTime() + 7200000),
      fmt = (d: Date) =>
        d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const clean = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Knightfall//Arena//EN",
      "BEGIN:VEVENT",
      `UID:${t.id}@knightfall`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${clean(t.title)}`,
      `DESCRIPTION:${clean("Check in 30 minutes before start. Games are played on Chess.com.")}`,
      `URL:${t.chess_url || window.location.href}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/calendar" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = t.slug + ".ics";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button className="button secondary" onClick={download}>
      <CalendarDays size={16} />
      Add to calendar
    </button>
  );
}
