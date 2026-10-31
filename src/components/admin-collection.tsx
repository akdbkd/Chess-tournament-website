"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { date, money } from "@/lib/data";
import { downloadCsv } from "@/lib/csv";
import type { Tournament } from "@/lib/types";
import { useApp } from "./provider";
import { Modal, Badge, Empty } from "./ui";

type Resource =
  | "users"
  | "posts"
  | "logs"
  | "reports"
  | "registrations"
  | "tournaments"
  | "refunds";
type Row = Record<string, any>;
export function AdminCollection({
  resource,
  onEdit,
  onImport,
  onCommand,
  onCancel,
  revision = 0,
}: {
  resource: Resource;
  revision?: number;
  onEdit?: (t: Tournament) => void;
  onImport?: (id: string) => void;
  onCommand?: (id: string, action: string) => void;
  onCancel?: (id: string) => void;
}) {
  const app = useApp();
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [change, setChange] = useState<{
      path: string;
      body: Row;
      title: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const [comments, setComments] = useState<{
    post: Row;
    rows: Row[];
    page: number;
    total: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (app.demo) {
          const values: Row[] =
            resource === "users"
              ? app.profile
                ? [app.profile]
                : []
              : resource === "posts"
                ? app.posts
                : resource === "tournaments"
                  ? app.tournaments
                  : resource === "registrations"
                    ? app.registrations
                    : [];
          const matching = values.filter((r) =>
            JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
          );
          setRows(matching.slice((page - 1) * 50, page * 50));
          setTotal(matching.length);
        } else {
          const result = await api(
            `admin/${resource}?page=${page}&q=${encodeURIComponent(search)}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setRows(result.rows);
          setTotal(result.total);
        }
        setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    resource,
    page,
    search,
    reload,
    revision,
    app.demo,
    app.posts,
    app.tournaments,
    app.registrations,
    app.profile,
  ]);
  function propose(path: string, body: Row, title: string) {
    setReason("");
    setChange({ path, body, title });
  }
  async function mutate() {
    if (!change) return;
    setBusy(true);
    try {
      if (app.demo) {
        if (change.path === "admin/moderate")
          app.update({
            posts: app.posts.map((p) =>
              p.id === change.body.id
                ? {
                    ...p,
                    ...(change.body.action === "hide"
                      ? { hidden: true }
                      : change.body.action === "restore"
                        ? { hidden: false }
                        : { locked: change.body.action === "lock" }),
                  }
                : p,
            ),
          });
      } else
        await api(change.path, {
          method: "POST",
          body: JSON.stringify({ ...change.body, reason }),
        });
      setChange(null);
      setReload((n) => n + 1);
      await app.refresh();
      app.notify("Change saved.");
    } catch (e) {
      app.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function loadComments(post: Row, commentPage = 1) {
    try {
      const result = await api(
        `admin/comments?post_id=${post.id}&page=${commentPage}`,
      );
      setComments({
        post,
        rows: result.rows,
        page: commentPage,
        total: result.total,
      });
    } catch (e) {
      app.notify((e as Error).message, true);
    }
  }
  const titles = {
    users: "People & permissions",
    posts: "Community moderation",
    logs: "Audit trail",
    reports: "Open reports",
    registrations: "Player registrations",
    tournaments: "Manage tournaments",
    refunds: "Payment refund queue",
  };
  return (
    <section className="panel admin-collection">
      <h2>{titles[resource]}</h2>
      <div className="collection-controls">
        <label>
          Search {resource}
          <input
            type="search"
            maxLength={80}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={
              resource === "users"
                ? "Display name or full user ID"
                : `Search ${resource}`
            }
          />
        </label>
        <button
          className="button small secondary"
          onClick={() => setReload((n) => n + 1)}
        >
          Refresh
        </button>
      </div>
      {resource === "registrations" && (
        <p className="muted">
          Export all entries for an event from Manage tournaments. Search and
          paging here cover every entry.
        </p>
      )}
      {resource === "refunds" && (
        <p className="muted">
          Full refunds use the original payment method. Retry after two minutes
          to reconcile an interrupted request. The final state is confirmed by
          Razorpay.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading {resource}…</p>
      ) : (
        <>
          {!rows.length && (
            <Empty
              title="No matching records"
              description="Try another search or refresh this list."
            />
          )}
          {rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      {resource === "logs" ? "Action / entity" : "Record"}
                    </th>
                    <th>Details</th>
                    <th>{resource === "logs" ? "Time / actor" : "Manage"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id || row.order_id}>
                      <td>
                        <strong>
                          {row.display_name ||
                            row.title ||
                            row.username ||
                            row.action ||
                            row.reason ||
                            row.order_id}
                        </strong>
                        <small>{row.id || row.order_id}</small>
                        {row.created_at && (
                          <small>{date(row.created_at)}</small>
                        )}
                      </td>
                      <td>
                        {resource === "users" && (
                          <>
                            <Badge
                              color={
                                row.status === "suspended" ? "red" : "green"
                              }
                            >
                              {row.status || "active"}
                            </Badge>
                            <p>{row.role}</p>
                            {row.suspension_reason && (
                              <p>{row.suspension_reason}</p>
                            )}
                          </>
                        )}
                        {resource === "posts" && (
                          <>
                            <Badge>
                              {row.hidden ? "Hidden" : "Visible"} ·{" "}
                              {row.locked ? "Locked" : "Open"}
                            </Badge>
                            <p>
                              {row.author_name} · {row.category}
                            </p>
                            <details>
                              <summary>Read post</summary>
                              <p className="preserve-lines">{row.body}</p>
                            </details>
                          </>
                        )}
                        {resource === "reports" && (
                          <>
                            <p>{row.post?.title}</p>
                            <p className="preserve-lines">{row.post?.body}</p>
                            <small>Reporter: {row.user_id}</small>
                          </>
                        )}
                        {resource === "logs" && (
                          <>
                            <p>{row.entity_id}</p>
                            <details>
                              <summary>Change details</summary>
                              <pre className="audit-details">
                                {JSON.stringify(row.details, null, 2)}
                              </pre>
                            </details>
                          </>
                        )}
                        {resource === "registrations" && (
                          <>
                            <p>
                              {row.tournament?.title ||
                                app.tournaments.find(
                                  (t) => t.id === row.tournament_id,
                                )?.title}
                            </p>
                            <Badge>{row.status.replaceAll("_", " ")}</Badge>
                            <p>
                              {row.payment_status.replaceAll("_", " ")} ·{" "}
                              {row.rating ?? "Unrated"}
                            </p>
                          </>
                        )}
                        {resource === "tournaments" && (
                          <>
                            <Badge>{row.status}</Badge>
                            <p>
                              {row.participants}/{row.capacity} entries ·{" "}
                              {money(row.fee_paise)}
                            </p>
                            <p>{date(row.starts_at)}</p>
                          </>
                        )}
                        {resource === "refunds" && (
                          <>
                            <p>{row.tournament?.title}</p>
                            <p>{money(row.amount_paise)}</p>
                            <small>{row.payment_id}</small>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="table-actions collection-actions">
                          {resource === "users" &&
                            row.id !== app.profile?.id && (
                              <>
                                <label>
                                  Role
                                  <select
                                    aria-label={`Role for ${row.display_name}`}
                                    value={row.role}
                                    onChange={(e) =>
                                      propose(
                                        "admin/role",
                                        { id: row.id, role: e.target.value },
                                        `Change ${row.display_name}'s role to ${e.target.value}?`,
                                      )
                                    }
                                  >
                                    {["USER", "ORGANIZER", "ADMIN"].map((r) => (
                                      <option key={r}>{r}</option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  className="text-button danger"
                                  onClick={() =>
                                    propose(
                                      "admin/account",
                                      {
                                        id: row.id,
                                        status:
                                          row.status === "suspended"
                                            ? "active"
                                            : "suspended",
                                      },
                                      row.status === "suspended"
                                        ? "Restore this account?"
                                        : "Suspend this account?",
                                    )
                                  }
                                >
                                  {row.status === "suspended"
                                    ? "Restore access"
                                    : "Suspend account"}
                                </button>
                              </>
                            )}
                          {resource === "users" &&
                            row.id === app.profile?.id && <span>You</span>}
                          {resource === "posts" && (
                            <>
                              {[
                                row.locked ? "unlock" : "lock",
                                row.hidden ? "restore" : "hide",
                              ].map((action) => (
                                <button
                                  key={action}
                                  className="text-button"
                                  onClick={() =>
                                    propose(
                                      "admin/moderate",
                                      { id: row.id, action },
                                      `${action[0].toUpperCase() + action.slice(1)} this post?`,
                                    )
                                  }
                                >
                                  {action}
                                </button>
                              ))}
                              {!app.demo && (
                                <button
                                  className="text-button"
                                  onClick={() => loadComments(row)}
                                >
                                  Review replies
                                </button>
                              )}
                            </>
                          )}
                          {resource === "reports" && (
                            <>
                              <button
                                className="text-button"
                                onClick={() =>
                                  propose(
                                    "admin/moderate",
                                    { id: row.id, action: "resolve_report" },
                                    "Resolve this report?",
                                  )
                                }
                              >
                                Resolve report
                              </button>
                              <button
                                className="text-button danger"
                                onClick={() =>
                                  propose(
                                    "admin/moderate",
                                    { id: row.post_id, action: "hide" },
                                    "Hide the reported post?",
                                  )
                                }
                              >
                                Hide post
                              </button>
                            </>
                          )}
                          {resource === "logs" && (
                            <small>{row.actor_id || "Payment provider"}</small>
                          )}
                          {resource === "registrations" && (
                            <>
                              {row.status === "pending" && (
                                <button
                                  className="text-button"
                                  onClick={() => onCommand?.(row.id, "approve")}
                                >
                                  Approve
                                </button>
                              )}
                              {["approved", "pending"].includes(row.status) && (
                                <button
                                  className="text-button danger"
                                  onClick={() => onCommand?.(row.id, "reject")}
                                >
                                  Reject
                                </button>
                              )}
                            </>
                          )}
                          {resource === "refunds" && (
                            <button
                              className="text-button"
                              onClick={() =>
                                onCommand?.(row.order_id, "payment_refund")
                              }
                            >
                              Issue / check full refund
                            </button>
                          )}
                          {resource === "tournaments" && (
                            <>
                              <button
                                className="text-button"
                                onClick={() => onEdit?.(row as Tournament)}
                              >
                                Edit
                              </button>
                              <button
                                className="text-button"
                                onClick={() => onImport?.(row.id)}
                              >
                                Import standings
                              </button>
                              <button
                                className="text-button"
                                onClick={async () => {
                                  try {
                                    const result = app.demo
                                      ? {
                                          headers: [
                                            "Player",
                                            "Rating",
                                            "Status",
                                            "Payment",
                                            "Submitted at",
                                          ],
                                          rows: app.registrations
                                            .filter(
                                              (r) => r.tournament_id === row.id,
                                            )
                                            .map((r) => [
                                              r.username,
                                              r.rating,
                                              r.status,
                                              r.payment_status,
                                              r.created_at,
                                            ]),
                                        }
                                      : await api(
                                          `admin/export?tournament_id=${row.id}`,
                                        );
                                    downloadCsv(
                                      `${row.slug}-registrations.csv`,
                                      result.headers,
                                      result.rows,
                                    );
                                  } catch (e) {
                                    app.notify((e as Error).message, true);
                                  }
                                }}
                              >
                                Export entries
                              </button>
                              {!["cancelled", "completed", "archived"].includes(
                                row.status,
                              ) && (
                                <button
                                  className="text-button danger"
                                  onClick={() => onCancel?.(row.id)}
                                >
                                  Cancel event
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="collection-pagination">
            <span>
              {total} records · Page {page} of{" "}
              {Math.max(1, Math.ceil(total / 50))}
            </span>
            <button
              className="button secondary small"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button secondary small"
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {change && (
        <Modal title={change.title} onClose={() => !busy && setChange(null)}>
          <p>
            {change.path === "admin/role"
              ? "Administrator and organizer roles can manage sensitive data. Two-factor verification is required before they can use the studio."
              : "This change is recorded in the audit trail."}
          </p>
          {change.body.status === "suspended" && (
            <label>
              Reason for suspension
              <textarea
                value={reason}
                minLength={5}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setChange(null)}
            >
              Keep current state
            </button>
            <button
              className="button"
              disabled={
                busy ||
                (change.body.status === "suspended" && reason.trim().length < 5)
              }
              onClick={mutate}
            >
              {busy ? "Saving…" : "Confirm change"}
            </button>
          </div>
        </Modal>
      )}
      {comments && (
        <Modal
          title={`Replies: ${comments.post.title}`}
          onClose={() => setComments(null)}
          wide
        >
          {!comments.rows.length && <p>No replies.</p>}
          {comments.rows.map((c) => (
            <article className="info-panel" key={c.id}>
              <div>
                <strong>{c.author_name}</strong>
                <p className="preserve-lines">{c.body}</p>
                <button
                  className="text-button danger"
                  onClick={() => {
                    setComments(null);
                    propose(
                      "admin/moderate",
                      { id: c.id, action: "delete_comment" },
                      "Delete this reply permanently?",
                    );
                  }}
                >
                  Delete reply
                </button>
              </div>
            </article>
          ))}
          <div className="collection-pagination">
            <button
              className="button small secondary"
              disabled={comments.page <= 1}
              onClick={() => loadComments(comments.post, comments.page - 1)}
            >
              Previous replies
            </button>
            <button
              className="button small secondary"
              disabled={comments.page * 50 >= comments.total}
              onClick={() => loadComments(comments.post, comments.page + 1)}
            >
              Next replies
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
