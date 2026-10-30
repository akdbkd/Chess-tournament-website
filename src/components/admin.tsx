"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Download,
  Upload,
  ArrowUpRight,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Check,
  X,
  Pencil,
  Settings,
  Activity,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useApp } from "./provider";
import { Empty, Modal, Badge } from "./ui";
import { api } from "@/lib/supabase";
import type { Tournament, Registration, Profile } from "@/lib/types";
import { date, money } from "@/lib/data";
import { tournamentSchema } from "@/lib/validation";
import { downloadCsv, standingsCsv } from "@/lib/csv";
type AdminData = {
  tournaments: Tournament[];
  registrations: Registration[];
  profiles: Profile[];
  logs: { id: string; action: string; entity_id: string; created_at: string }[];
  reports: { id: string; post_id: string; reason: string }[];
  refunds: {
    order_id: string;
    payment_id: string;
    tournament_id: string;
    amount_paise: number;
    created_at: string;
  }[];
};
export function Admin() {
  const app = useApp();
  const [data, setData] = useState<AdminData>({
      tournaments: [],
      registrations: [],
      profiles: [],
      logs: [],
      reports: [],
      refunds: [],
    }),
    [tab, setTab] = useState("Overview"),
    [editing, setEditing] = useState<Tournament | "new" | null>(null),
    [importId, setImportId] = useState(""),
    [importText, setImportText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<{ id: string; action: string } | null>(
      null,
    );
  async function refresh() {
    if (app.demo) {
      setData({
        tournaments: app.tournaments,
        registrations: app.registrations,
        profiles: app.profile ? [app.profile] : [],
        logs: [],
        reports: [],
        refunds: [],
      });
      return;
    }
    try {
      setData(await api("admin"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (app.profile && (app.demo || app.profile.role !== "USER"))
      void refresh();
  }, [app.profile, app.tournaments, app.registrations]);
  if (!app.profile || app.profile.role === "USER")
    return (
      <div className="page">
        <Empty
          title="Your tournament. Your arena."
          description="The organizer studio brings registration management, event publishing, payments, and standings into one place. Organizer access is assigned by an administrator."
          action={
            <div className="button-row">
              {!app.profile && (
                <button
                  className="button"
                  onClick={() => app.setAuthOpen(true)}
                >
                  Sign in
                  <ArrowUpRight size={16} />
                </button>
              )}
              {app.demo && (
                <button
                  className="button secondary"
                  onClick={() =>
                    app.setProfile({
                      id: "demo-user",
                      display_name: app.profile?.display_name || "Alex Morgan",
                      role: "ADMIN",
                      email: "demo@example.com",
                    })
                  }
                >
                  Explore the demo studio
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  async function command(id: string, action: string) {
    setBusy(true);
    try {
      if (app.demo) await app.action(id, action);
      else {
        await api(
          action === "payment_refund"
            ? "payments/refund"
            : "registration/action",
          {
            method: "POST",
            body: JSON.stringify(
              action === "payment_refund" ? { order_id: id } : { id, action },
            ),
          },
        );
        await refresh();
        await app.refresh();
        app.notify("Registration updated.");
      }
      setConfirm(null);
    } catch (e) {
      app.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const tabs =
    app.profile.role === "ADMIN"
      ? [
          "Overview",
          "Tournaments",
          "Registrations",
          "Refunds",
          "Players",
          "Community",
          "Users",
          "Settings",
          "Audit log",
        ]
      : ["Overview", "Tournaments", "Registrations", "Refunds", "Players"];
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={14} />
            {app.demo ? "DEMO ORGANIZER WORKSPACE" : "ORGANIZER WORKSPACE"}
          </div>
          <h1>
            Behind every great game<span className="orange-text">.</span>
          </h1>
          <p>Your command center for a well-run tournament.</p>
        </div>
        <button className="button" onClick={() => setEditing("new")}>
          <Plus size={18} />
          Create tournament
        </button>
      </div>
      {error && (
        <div className="form-error">
          {error}
          <button className="text-button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      <div className="admin-layout">
        <nav className="admin-nav">
          {tabs.map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="admin-main">
          {tab === "Overview" && (
            <>
              <div className="dashboard-stats">
                {[
                  {
                    icon: Trophy,
                    n: data.tournaments.length,
                    label: "Your tournaments",
                  },
                  {
                    icon: Users,
                    n: data.registrations.length,
                    label: "Player registrations",
                  },
                  {
                    icon: Wallet,
                    n: money(
                      data.registrations
                        .filter((r) => r.payment_status === "paid")
                        .reduce(
                          (n, r) =>
                            n +
                            (data.tournaments.find(
                              (t) => t.id === r.tournament_id,
                            )?.fee_paise || 0),
                          0,
                        ),
                    ),
                    label: app.demo
                      ? "Demo collections"
                      : "Collected entry fees",
                  },
                ].map((s) => (
                  <div className="panel" key={s.label}>
                    <s.icon size={22} />
                    <strong>{s.n}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="section-title">
                  <h2>Event readiness</h2>
                  <span className="muted small-text">
                    Before the first move
                  </span>
                </div>
                {data.tournaments
                  .filter((t) => t.status === "open")
                  .map((t) => (
                    <div className="readiness-row" key={t.id}>
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {date(t.starts_at)} · {t.participants}/{t.capacity}{" "}
                          players
                        </p>
                      </div>
                      <Badge color={t.chess_url ? "green" : "amber"}>
                        {t.chess_url ? "Lobby ready" : "Add Chess.com lobby"}
                      </Badge>
                      <button
                        className="icon-button"
                        aria-label={"Edit " + t.title}
                        onClick={() => setEditing(t)}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  ))}
              </div>
              <div className="info-panel">
                <ShieldCheck />
                <div>
                  <strong>Live event checklist</strong>
                  <p>
                    Configure your Chess.com club tournament, publish the lobby
                    URL, verify entry rules and prize terms, and check Razorpay
                    capture/webhook delivery before opening paid registration.
                  </p>
                </div>
              </div>
            </>
          )}
          {tab === "Tournaments" && (
            <div className="panel">
              <div className="section-title">
                <h2>Manage tournaments</h2>
                <button
                  className="text-button"
                  onClick={() => setEditing("new")}
                >
                  <Plus size={15} />
                  New event
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Status</th>
                      <th>Entries</th>
                      <th>Entry fee</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tournaments.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.title}</strong>
                          <small>{date(t.starts_at)}</small>
                        </td>
                        <td>
                          <Badge color={t.status === "open" ? "green" : ""}>
                            {t.status}
                          </Badge>
                        </td>
                        <td>
                          {t.participants}/{t.capacity}
                        </td>
                        <td>{t.fee_paise ? money(t.fee_paise) : "Free"}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="icon-button"
                              title="Edit tournament"
                              onClick={() => setEditing(t)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Import standings"
                              onClick={() => setImportId(t.id)}
                            >
                              <Upload size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "Registrations" && (
            <div className="panel">
              <div className="section-title">
                <h2>Player registrations</h2>
                <button
                  className="button secondary small"
                  onClick={() =>
                    downloadCsv(
                      "registrations.csv",
                      [
                        "Tournament",
                        "Player",
                        "Rating",
                        "Status",
                        "Payment",
                        "Submitted at",
                      ],
                      data.registrations.map((r) => [
                        data.tournaments.find((t) => t.id === r.tournament_id)
                          ?.title,
                        r.username,
                        r.rating,
                        r.status,
                        r.payment_status,
                        r.created_at,
                      ]),
                    )
                  }
                >
                  <Download size={15} />
                  Export CSV
                </button>
              </div>
              {data.registrations.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Player / tournament</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.registrations.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.username}</strong>
                            <small>
                              {
                                data.tournaments.find(
                                  (t) => t.id === r.tournament_id,
                                )?.title
                              }
                            </small>
                          </td>
                          <td>
                            <Badge>{r.status.replaceAll("_", " ")}</Badge>
                          </td>
                          <td>{r.payment_status.replaceAll("_", " ")}</td>
                          <td>
                            <div className="table-actions">
                              {r.status === "pending" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setConfirm({ id: r.id, action: "approve" })
                                  }
                                >
                                  Approve
                                </button>
                              )}
                              {["pending", "approved"].includes(r.status) && (
                                <button
                                  className="text-button danger"
                                  onClick={() =>
                                    setConfirm({ id: r.id, action: "reject" })
                                  }
                                >
                                  Reject
                                </button>
                              )}
                              {r.payment_status === "refund_requested" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setConfirm({ id: r.id, action: "refund" })
                                  }
                                >
                                  Issue refund
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Ready for your first entries"
                  description="Player registrations will appear here as they arrive."
                />
              )}
            </div>
          )}
          {tab === "Refunds" && (
            <div className="panel">
              <h2>Payment refund queue</h2>
              <p className="muted">
                Withdrawals, rejected entries, and payments captured after a
                reservation expired. A payment stays here until Razorpay
                confirms its refund.
              </p>
              {data.refunds.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Payment / event</th>
                        <th>Amount</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.refunds.map((o) => (
                        <tr key={o.order_id}>
                          <td>
                            <strong>{o.payment_id}</strong>
                            <small>
                              {
                                data.tournaments.find(
                                  (t) => t.id === o.tournament_id,
                                )?.title
                              }
                            </small>
                          </td>
                          <td>{money(o.amount_paise)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConfirm({
                                  id: o.order_id,
                                  action: "payment_refund",
                                })
                              }
                            >
                              Issue full refund
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No payments awaiting a refund"
                  description="Refund requests and late captured payments will appear here."
                />
              )}
            </div>
          )}
          {tab === "Players" && (
            <div className="panel">
              <h2>Your player field</h2>
              <p className="muted">
                Public Chess.com profiles, independent of website accounts.
              </p>
              {data.registrations.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Chess.com player</th>
                        <th>Rating at registration</th>
                        <th>Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(
                        new Map(
                          data.registrations.map((r) => [
                            r.username.toLowerCase(),
                            r,
                          ]),
                        ).values(),
                      ).map((r) => (
                        <tr key={r.username}>
                          <td>{r.username}</td>
                          <td>{r.rating ?? "Unrated"}</td>
                          <td>
                            <a
                              className="text-link"
                              href={
                                "https://www.chess.com/member/" +
                                encodeURIComponent(r.username)
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              View profile
                              <ArrowUpRight size={14} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No players yet"
                  description="Registered Chess.com players will appear here."
                />
              )}
            </div>
          )}
          {tab === "Community" && (
            <div className="panel">
              <h2>Community moderation</h2>
              <p className="muted">
                Review reported content, hide posts, or lock discussions.
              </p>
              {data.reports.map((r) => (
                <div className="info-panel" key={r.id}>
                  <div>
                    <strong>Report: {r.reason}</strong>
                    <p>Post ID: {r.post_id}</p>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await api("admin/moderate", {
                            method: "POST",
                            body: JSON.stringify({
                              id: r.id,
                              action: "resolve_report",
                            }),
                          });
                          await refresh();
                          app.notify("Report resolved.");
                        } catch (e) {
                          app.notify((e as Error).message, true);
                        }
                      }}
                    >
                      Resolve report
                    </button>
                  </div>
                </div>
              ))}
              {app.posts.map((post) => (
                <div className="readiness-row" key={post.id}>
                  <div>
                    <strong>{post.title}</strong>
                    <p>
                      {post.author_name} ·{" "}
                      {post.locked ? "Locked" : post.category}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        if (app.demo)
                          app.update({
                            posts: app.posts.map((p) =>
                              p.id === post.id ? { ...p, locked: true } : p,
                            ),
                          });
                        else {
                          await api("admin/moderate", {
                            method: "POST",
                            body: JSON.stringify({
                              id: post.id,
                              action: "lock",
                            }),
                          });
                          await app.refresh();
                        }
                        app.notify("Discussion locked.");
                      } catch (e) {
                        app.notify((e as Error).message, true);
                      }
                    }}
                  >
                    Lock
                  </button>
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      try {
                        if (app.demo)
                          app.update({
                            posts: app.posts.filter((p) => p.id !== post.id),
                          });
                        else {
                          await api("admin/moderate", {
                            method: "POST",
                            body: JSON.stringify({
                              id: post.id,
                              action: "hide",
                            }),
                          });
                          await app.refresh();
                        }
                        app.notify("Post hidden.");
                      } catch (e) {
                        app.notify((e as Error).message, true);
                      }
                    }}
                  >
                    Hide
                  </button>
                </div>
              ))}
            </div>
          )}
          {tab === "Users" && (
            <div className="panel">
              <h2>People & permissions</h2>
              <p className="muted">
                Organizer access applies only to the tournaments they own.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Website user</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.profiles.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.display_name}
                          <small>
                            {p.id === app.profile?.id ? "You" : p.id}
                          </small>
                        </td>
                        <td>
                          <select
                            aria-label={"Role for " + p.display_name}
                            value={p.role}
                            disabled={p.id === app.profile?.id}
                            onChange={async (e) => {
                              try {
                                await api("admin/role", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    id: p.id,
                                    role: e.target.value,
                                  }),
                                });
                                await refresh();
                                app.notify("Role updated.");
                              } catch (e) {
                                app.notify((e as Error).message, true);
                              }
                            }}
                          >
                            {["USER", "ORGANIZER", "ADMIN"].map((role) => (
                              <option key={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "Settings" && (
            <div className="panel">
              <h2>Platform settings</h2>
              <p className="muted">
                Payment credentials are managed securely in your hosting
                environment.
              </p>
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    if (!app.demo)
                      await api("admin/settings", {
                        method: "POST",
                        body: JSON.stringify({
                          support_email: f.get("email"),
                          community_enabled: f.get("community") === "on",
                        }),
                      });
                    app.notify(
                      app.demo
                        ? "Demo settings reviewed. Live settings require Supabase."
                        : "Settings saved.",
                    );
                  } catch (e) {
                    app.notify((e as Error).message, true);
                  }
                }}
              >
                <label>
                  Support email
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="Your organizer support email"
                  />
                </label>
                <label className="checkbox-label">
                  <input name="community" type="checkbox" defaultChecked />
                  <span>Allow community posts</span>
                </label>
                <button className="button">Save settings</button>
              </form>
              <div className="divider" />
              <div className="integration-status">
                <strong>Supabase</strong>
                <Badge color={app.demo ? "amber" : "green"}>
                  {app.demo ? "Setup required" : "Configured"}
                </Badge>
              </div>
              <div className="integration-status">
                <strong>Razorpay</strong>
                <span>Server-side orders, verification & webhooks</span>
              </div>
              <div className="integration-status">
                <strong>Vercel</strong>
                <span>Deploy-ready Next.js application</span>
              </div>
            </div>
          )}
          {tab === "Audit log" && (
            <div className="panel">
              <h2>Audit trail</h2>
              {data.logs.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.logs.map((l) => (
                        <tr key={l.id}>
                          <td>{l.action}</td>
                          <td>{l.entity_id}</td>
                          <td>{date(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="A clear record of every change"
                  description="Administrative actions are recorded in Supabase in live mode."
                />
              )}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <TournamentEditor
          value={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            if (app.demo) {
              app.update({
                tournaments: app.tournaments.some((x) => x.id === t.id)
                  ? app.tournaments.map((x) => (x.id === t.id ? t : x))
                  : [t, ...app.tournaments],
              });
            } else {
              await refresh();
              await app.refresh();
            }
            setEditing(null);
            app.notify("Tournament saved.");
          }}
        />
      )}
      {importId && (
        <Modal
          title="Import reviewed standings"
          onClose={() => setImportId("")}
        >
          <p className="muted">
            Paste CSV exported from your reviewed results. Existing player rows
            are updated.
          </p>
          <label className="stack-form">
            CSV data
            <textarea
              rows={9}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                "username,score,wins,draws,losses,tiebreak\ntacticalrook,7,7,0,0,32"
              }
            />
          </label>
          <div className="modal-actions">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const rows = standingsCsv(importText);
                  if (!rows.length)
                    throw new Error("Add at least one result row.");
                  if (app.demo) {
                    localStorage.setItem(
                      "standings-" + importId,
                      JSON.stringify(
                        rows.map((r) => ({ ...r, tournament_id: importId })),
                      ),
                    );
                  } else
                    await api("standings/import", {
                      method: "POST",
                      body: JSON.stringify({ tournament_id: importId, rows }),
                    });
                  app.notify(rows.length + " standings imported.");
                  setImportId("");
                  setImportText("");
                } catch (e) {
                  app.notify((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Upload size={16} />
              Import standings
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            ["refund", "payment_refund"].includes(confirm.action)
              ? "Issue a full refund?"
              : confirm.action === "reject"
                ? "Reject this entry?"
                : "Approve this entry?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {["refund", "payment_refund"].includes(confirm.action)
              ? "This sends a full refund request to Razorpay for the original payment. The webhook updates the final status."
              : confirm.action === "reject"
                ? "This removes the player from the active field. Paid entries move to refund review."
                : "The player will receive an approval notification."}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => command(confirm.id, confirm.action)}
            >
              Confirm {confirm.action.replace("payment_", "")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function TournamentEditor({
  value,
  onClose,
  onSave,
}: {
  value: Tournament | null;
  onClose: () => void;
  onSave: (t: Tournament) => void;
}) {
  const app = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const localDate = (s: string) => {
    const d = new Date(s);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      n = (k: string) => Number(f.get(k)),
      s = (k: string) => String(f.get(k) || "");
    try {
      const title = s("title");
      const v = tournamentSchema.parse({
        title,
        slug:
          value?.slug ||
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        description: s("description"),
        category: s("category"),
        format: s("format"),
        time_control: s("time_control"),
        starts_at: new Date(s("starts_at")).toISOString(),
        registration_closes: new Date(s("registration_closes")).toISOString(),
        capacity: n("capacity"),
        fee_paise: Math.round(n("fee") * 100),
        prize_paise: Math.round(n("prize") * 100),
        min_rating: n("min_rating"),
        max_rating: n("max_rating"),
        min_account_days: n("min_account_days"),
        chess_url: s("chess_url"),
        auto_approve: f.get("auto_approve") === "on",
        featured: f.get("featured") === "on",
        status: s("status"),
        color: s("color"),
      });
      if (app.demo)
        onSave({
          ...v,
          id: value?.id || crypto.randomUUID(),
          participants: value?.participants || 0,
          organizer_id: app.profile!.id,
          organizer_name: app.profile!.display_name,
        });
      else
        onSave(
          await api("tournaments/save", {
            method: "POST",
            body: JSON.stringify({ ...v, ...(value ? { id: value.id } : {}) }),
          }),
        );
    } catch (e) {
      setError(
        (e as { issues?: { message: string }[] }).issues?.[0]?.message ||
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={value ? "Edit tournament" : "Create your next tournament"}
      onClose={onClose}
      wide
    >
      <form className="stack-form" onSubmit={submit}>
        <label>
          Tournament name
          <input
            name="title"
            defaultValue={value?.title}
            required
            minLength={5}
            maxLength={100}
            placeholder="Give your event a memorable name"
          />
        </label>
        <label>
          Description & prize distribution
          <textarea
            name="description"
            defaultValue={value?.description}
            required
            minLength={20}
            maxLength={5000}
            rows={4}
            placeholder="Describe the tournament, prize distribution, and organizer contact details."
          />
        </label>
        <div className="form-grid">
          <label>
            Time control category
            <select name="category" defaultValue={value?.category || "Rapid"}>
              {["Rapid", "Blitz", "Bullet", "Classical"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select name="format" defaultValue={value?.format || "Swiss"}>
              {["Swiss", "Arena", "Round Robin", "Knockout"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Clock (minutes + increment)
            <input
              name="time_control"
              defaultValue={value?.time_control || "10 + 0"}
              pattern="[0-9]+ \+ [0-9]+"
              required
            />
          </label>
          <label>
            Maximum players
            <input
              name="capacity"
              type="number"
              min={2}
              max={10000}
              defaultValue={value?.capacity || 64}
              required
            />
          </label>
          <label>
            Starts (your local time)
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={value ? localDate(value.starts_at) : undefined}
              required
            />
          </label>
          <label>
            Registration closes (local time)
            <input
              name="registration_closes"
              type="datetime-local"
              defaultValue={
                value ? localDate(value.registration_closes) : undefined
              }
              required
            />
          </label>
          <label>
            Entry fee (₹)
            <input
              name="fee"
              type="number"
              min={0}
              max={10000}
              step="0.01"
              defaultValue={(value?.fee_paise || 0) / 100}
              required
            />
          </label>
          <label>
            Prize pool (₹)
            <input
              name="prize"
              type="number"
              min={0}
              max={1000000}
              step="0.01"
              defaultValue={(value?.prize_paise || 0) / 100}
              required
            />
          </label>
          <label>
            Minimum rating
            <input
              name="min_rating"
              type="number"
              min={0}
              max={4000}
              defaultValue={value?.min_rating || 0}
              required
            />
          </label>
          <label>
            Maximum rating
            <input
              name="max_rating"
              type="number"
              min={0}
              max={4000}
              defaultValue={value?.max_rating ?? 3000}
              required
            />
          </label>
          <label>
            Minimum account age (days)
            <input
              name="min_account_days"
              type="number"
              min={0}
              max={3650}
              defaultValue={value?.min_account_days ?? 30}
              required
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={value?.status || "draft"}>
              {["draft", "open", "closed", "live", "completed", "archived"].map(
                (x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <label>
          Chess.com tournament lobby URL
          <input
            name="chess_url"
            type="url"
            defaultValue={value?.chess_url}
            placeholder="https://www.chess.com/tournament/..."
          />
        </label>
        <label>
          Event artwork
          <select name="color" defaultValue={value?.color || "orange"}>
            {["orange", "purple", "green", "blue"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <label className="checkbox-label">
            <input
              name="auto_approve"
              type="checkbox"
              defaultChecked={value?.auto_approve ?? true}
            />
            <span>Automatically approve eligible paid/free entries</span>
          </label>
          <label className="checkbox-label">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={value?.featured}
            />
            <span>Featured event</span>
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy && <Loader2 className="spin" size={16} />}Save tournament
          </button>
        </div>
      </form>
    </Modal>
  );
}
