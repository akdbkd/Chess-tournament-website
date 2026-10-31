"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Upload,
  ArrowUpRight,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Pencil,
  Loader2,
} from "lucide-react";
import { useApp } from "./provider";
import { Empty, Modal, Badge } from "./ui";
import { api } from "@/lib/supabase";
import type { Tournament, Registration, Profile } from "@/lib/types";
import { date, money } from "@/lib/data";
import { tournamentSchema } from "@/lib/validation";
import { standingsCsv } from "@/lib/csv";
type AdminData = {
  summary?: {
    tournaments: number;
    registrations: number;
    collected_paise: number;
  };
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
import { AccountSecurity } from "./account-security";
import { AdminCollection } from "./admin-collection";
import { PlatformSettings } from "./platform-settings";
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
    [revision, setRevision] = useState(0),
    [cancelling, setCancelling] = useState<string | null>(null),
    [cancelReason, setCancelReason] = useState(""),
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
      setRevision((n) => n + 1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (
      app.profile?.role === "ADMIN" &&
      (app.demo || app.profile.aal === "aal2")
    )
      void refresh();
  }, [app.profile, app.tournaments, app.registrations]);
  if (app.profile?.role !== "ADMIN")
    return (
      <div className="page">
        <Empty
          title="Page unavailable"
          description="This page is not available for your account."
        />
      </div>
    );
  if (!app.demo && app.profile.aal !== "aal2")
    return (
      <div className="page narrow-page">
        <div className="eyebrow">PROTECT YOUR ARENA</div>
        <h1>Verify your authenticator</h1>
        <AccountSecurity />
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
          "Community",
          "Users",
          "Settings",
          "Audit log",
        ]
      : ["Overview", "Tournaments", "Registrations", "Refunds"];
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
                    n: data.summary?.tournaments ?? data.tournaments.length,
                    label: "Your tournaments",
                  },
                  {
                    icon: Users,
                    n: data.summary?.registrations ?? data.registrations.length,
                    label: "Player registrations",
                  },
                  {
                    icon: Wallet,
                    n: money(
                      data.summary?.collected_paise ??
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
                  <h2>Recent event readiness</h2>
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
            <>
              <button
                className="button small"
                onClick={() => setEditing("new")}
              >
                <Plus size={16} /> New event
              </button>
              <AdminCollection
                resource="tournaments"
                revision={revision}
                onEdit={setEditing}
                onImport={setImportId}
                onCancel={(id) => {
                  setCancelReason("");
                  setCancelling(id);
                }}
              />
            </>
          )}
          {tab === "Registrations" && (
            <AdminCollection
              resource="registrations"
              revision={revision}
              onCommand={(id, action) => setConfirm({ id, action })}
            />
          )}
          {tab === "Refunds" && (
            <AdminCollection
              resource="refunds"
              revision={revision}
              onCommand={(id, action) => setConfirm({ id, action })}
            />
          )}
          {tab === "Community" && (
            <>
              <AdminCollection resource="reports" revision={revision} />
              <AdminCollection resource="posts" revision={revision} />
            </>
          )}
          {tab === "Users" && (
            <AdminCollection resource="users" revision={revision} />
          )}
          {tab === "Settings" && <PlatformSettings />}
          {tab === "Audit log" && (
            <AdminCollection resource="logs" revision={revision} />
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
            are updated. For live events, close registration first; results must
            belong to approved players.
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
      {cancelling && (
        <Modal
          title="Cancel this tournament?"
          onClose={() => !busy && setCancelling(null)}
        >
          <p>
            All active entries will be withdrawn. Paid entries move to the
            refund queue, and registered users receive a notification. The event
            cannot reopen.
          </p>
          <label>
            Reason for players
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              minLength={5}
              maxLength={500}
              required
            />
          </label>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setCancelling(null)}
            >
              Keep event
            </button>
            <button
              className="button danger-button"
              disabled={busy || cancelReason.trim().length < 5}
              onClick={async () => {
                setBusy(true);
                try {
                  if (app.demo)
                    app.update({
                      tournaments: app.tournaments.map((t) =>
                        t.id === cancelling
                          ? { ...t, status: "cancelled", participants: 0 }
                          : t,
                      ),
                      registrations: app.registrations.map((r) =>
                        r.tournament_id === cancelling
                          ? {
                              ...r,
                              status: "withdrawn",
                              payment_status:
                                r.payment_status === "paid"
                                  ? "refund_requested"
                                  : r.payment_status,
                            }
                          : r,
                      ),
                    });
                  else
                    await api("tournaments/cancel", {
                      method: "POST",
                      body: JSON.stringify({
                        id: cancelling,
                        reason: cancelReason,
                      }),
                    });
                  await refresh();
                  await app.refresh();
                  setCancelling(null);
                  app.notify(
                    "Tournament cancelled. Paid entries are queued for refund.",
                  );
                } catch (e) {
                  app.notify((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel tournament
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
            body: JSON.stringify({
              ...v,
              ...(value ? { id: value.id, updated_at: value.updated_at } : {}),
            }),
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
            Minimum Chess.com account age (days)
            <input
              name="min_account_days"
              aria-describedby="account-age-help"
              type="number"
              min={0}
              max={3650}
              defaultValue={value?.min_account_days ?? 30}
              required
            />
          </label>
          <p id="account-age-help" className="muted small-text">
            The player’s Chess.com account must be at least this many days old
            on registration day. Use 0 for no minimum. This does not refer to
            their Knightfall account.
          </p>
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
