"use client";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  Trophy,
  Bookmark,
  Bell,
  Settings,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { useApp } from "./provider";
import { Empty, TournamentCard, Badge, Modal, DownloadCalendar } from "./ui";
import { api, supabase } from "@/lib/supabase";
import { date, time, money } from "@/lib/data";
import { openPayment } from "./forms";
export function Dashboard() {
  const app = useApp(),
    params = useSearchParams(),
    router = useRouter(),
    tab = params.get("tab") || "registrations";
  const [withdraw, setWithdraw] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  if (!app.profile)
    return (
      <div className="page">
        <Empty
          title="Your next chapter starts here"
          description="Sign in to manage the player registrations you submit, save tournaments, and follow your progress."
          action={
            <button className="button" onClick={() => app.setAuthOpen(true)}>
              Sign in to your playbook
              <ArrowUpRight size={17} />
            </button>
          }
        />
      </div>
    );
  const registrations = app.registrations.filter(
    (r) => r.registered_by === app.profile?.id,
  );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">YOUR PLAYBOOK</div>
          <h1>
            Good to see you, {app.profile.display_name.split(" ")[0]}
            <span className="orange-text">.</span>
          </h1>
          <p>
            Every player you register. Every tournament you’re looking forward
            to.
          </p>
        </div>
        <Link className="button" href="/tournaments">
          Find a tournament
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="dashboard-stats">
        {[
          {
            n: registrations.filter((r) =>
              ["approved", "pending", "checked_in"].includes(r.status),
            ).length,
            label: "Active registrations",
            icon: Trophy,
          },
          { n: app.saved.length, label: "Saved tournaments", icon: Bookmark },
          {
            n: app.notices.filter((n) => !n.read).length,
            label: "Unread notifications",
            icon: Bell,
          },
        ].map((s) => (
          <div className="panel" key={s.label}>
            <s.icon size={22} />
            <strong>{s.n}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="tabs dashboard-tabs">
        {[
          {
            id: "registrations",
            label: "My registrations",
            icon: CalendarDays,
          },
          { id: "saved", label: "Saved tournaments", icon: Bookmark },
          { id: "notifications", label: "Notifications", icon: Bell },
          { id: "settings", label: "Account settings", icon: Settings },
        ].map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() =>
              router.replace("/dashboard?tab=" + t.id, { scroll: false })
            }
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "registrations" && (
        <>
          <p className="muted small-text">
            These are entries you submitted. The Chess.com players may belong to
            you or someone else.
          </p>
          {registrations.length ? (
            <div className="registration-list">
              {registrations.map((r) => {
                const t =
                  app.tournaments.find((t) => t.id === r.tournament_id) ||
                  r.tournament;
                if (!t) return null;
                return (
                  <article className="panel registration-item" key={r.id}>
                    <div className="registration-item-head">
                      <div>
                        <Badge
                          color={
                            ["approved", "checked_in"].includes(r.status)
                              ? "green"
                              : r.status === "withdrawn" ||
                                  r.status === "rejected"
                                ? "red"
                                : ""
                          }
                        >
                          {r.status.replaceAll("_", " ")}
                        </Badge>
                        <Link href={"/tournaments/" + t.slug}>
                          <h2>{t.title}</h2>
                        </Link>
                        <p>
                          {date(t.starts_at)} · {time(t.starts_at)}
                        </p>
                        <small className="registration-reference">
                          ID: {r.id}
                        </small>
                      </div>
                      <div className="registration-player">
                        <small>CHESS.COM PLAYER</small>
                        <strong>{r.username}</strong>
                        <span>
                          {r.rating ?? "Unrated"} {t.category}
                        </span>
                      </div>
                    </div>
                    <div className="registration-item-footer">
                      <span className="muted small-text">
                        {app.demo ? "Demo entry · " : ""}
                        {r.payment_status.replaceAll("_", " ")} ·{" "}
                        {t.fee_paise ? money(t.fee_paise) : "Free"}
                      </span>
                      <div>
                        {r.status === "approved" && (
                          <button
                            className="button small secondary"
                            onClick={() => app.action(r.id, "checkin")}
                          >
                            <CheckCircle2 size={15} />
                            Check in
                          </button>
                        )}
                        {t.chess_url &&
                          ["approved", "checked_in"].includes(r.status) && (
                            <a
                              className="button small"
                              target="_blank"
                              rel="noreferrer"
                              href={t.chess_url}
                            >
                              Chess.com lobby
                              <ExternalLink size={14} />
                            </a>
                          )}
                        {!t.chess_url &&
                          ["approved", "checked_in"].includes(r.status) && (
                            <span className="muted small-text">
                              Lobby link pending
                            </span>
                          )}
                        {r.status === "pending_payment" && !app.demo && (
                          <button
                            className="button small"
                            onClick={async () => {
                              try {
                                const result = await api("payments/resume", {
                                  method: "POST",
                                  body: JSON.stringify({ id: r.id }),
                                });
                                await openPayment(
                                  result,
                                  () => {
                                    void app.refresh();
                                    app.notify("Payment confirmed.");
                                  },
                                  (m) => app.notify(m, true),
                                  app.profile?.email,
                                );
                              } catch (e) {
                                app.notify((e as Error).message, true);
                              }
                            }}
                          >
                            <Wallet size={14} />
                            Resume payment
                          </button>
                        )}
                        {["approved", "pending", "pending_payment"].includes(
                          r.status,
                        ) && (
                          <button
                            className="text-button danger"
                            onClick={() => setWithdraw(r.id)}
                          >
                            Withdraw
                          </button>
                        )}
                        <DownloadCalendar t={t} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Your first tournament is calling"
              description="Once you register a player, their entry and match-day details will appear here."
              action={
                <Link className="button" href="/tournaments">
                  Explore tournaments
                  <ArrowUpRight size={16} />
                </Link>
              }
            />
          )}
        </>
      )}
      {tab === "saved" &&
        (app.saved.length ? (
          <div className="tournament-grid">
            {app.tournaments
              .filter((t) => app.saved.includes(t.id))
              .map((t) => (
                <TournamentCard key={t.id} t={t} />
              ))}
          </div>
        ) : (
          <Empty
            title="Keep your next move close"
            description="Tap the bookmark on any tournament to save it here."
            action={
              <Link className="button secondary" href="/tournaments">
                Find a tournament
              </Link>
            }
          />
        ))}
      {tab === "notifications" && (
        <div className="panel">
          <div className="section-title">
            <h2>Your updates</h2>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  if (!app.demo)
                    await api("notifications/read", {
                      method: "POST",
                      body: "{}",
                    });
                  app.update({
                    notices: app.notices.map((n) => ({ ...n, read: true })),
                  });
                  app.notify("Notifications marked as read.");
                } catch (e) {
                  app.notify((e as Error).message, true);
                }
              }}
            >
              Mark all as read
            </button>
          </div>
          {app.notices.length ? (
            app.notices.map((n) => (
              <div className={"notice " + (!n.read ? "unread" : "")} key={n.id}>
                <Bell size={18} />
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>
                    {date(n.created_at)} · {time(n.created_at)}
                  </small>
                </div>
                {!n.read && <span className="status-dot green" />}
              </div>
            ))
          ) : (
            <Empty
              title="You’re all caught up"
              description="Registration updates and organizer notifications will appear here."
            />
          )}
        </div>
      )}
      {tab === "settings" && (
        <div className="panel settings-panel">
          <h2>Account settings</h2>
          <p className="muted">
            Your website identity is separate from any Chess.com player you
            register.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const name = String(
                  new FormData(e.currentTarget).get("display_name"),
                );
                if (!app.demo)
                  await api("profile", {
                    method: "POST",
                    body: JSON.stringify({ display_name: name }),
                  });
                app.setProfile({ ...app.profile!, display_name: name });
                app.notify("Profile updated.");
              } catch (e) {
                app.notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={app.profile.display_name}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              Email
              <input
                value={app.profile.email || "Signed-in account"}
                disabled
              />
            </label>
            <label>
              Account role
              <input value={app.profile.role} disabled />
            </label>
            <button className="button" disabled={busy}>
              Save changes
            </button>
          </form>
          <div className="divider" />
          <button
            className="button secondary"
            onClick={async () => {
              if (app.demo) {
                app.notify(
                  "Password changes are available on live Supabase accounts.",
                );
                return;
              }
              if (app.profile?.email) {
                const { error } = await supabase!.auth.resetPasswordForEmail(
                  app.profile.email,
                  { redirectTo: window.location.origin + "/reset-password" },
                );
                app.notify(
                  error?.message || "Password reset email sent.",
                  !!error,
                );
              }
            }}
          >
            Send password reset email
          </button>
        </div>
      )}
      {withdraw && (
        <Modal title="Withdraw this player?" onClose={() => setWithdraw(null)}>
          <p>
            This releases the entry. Paid entries will be marked for refund
            review by the organizer; a refund is not instant.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setWithdraw(null)}
            >
              Keep registration
            </button>
            <button
              className="button danger-button"
              onClick={async () => {
                await app.action(withdraw, "withdraw");
                setWithdraw(null);
              }}
            >
              Withdraw player
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
