"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Heart,
  MessageSquare,
  ArrowUpRight,
  Flag,
  Lock,
  Search,
  Send,
  Pin,
  Users,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "./provider";
import { Modal, Badge, Empty } from "./ui";
import { api } from "@/lib/supabase";
import { date } from "@/lib/data";
import type { Post, Comment } from "@/lib/types";
const categories = [
  "All discussions",
  "General",
  "Tournament Discussion",
  "Announcements",
  "Looking for Players",
  "Chess Discussion",
];
export function Community() {
  const app = useApp(),
    params = useSearchParams();
  const [category, setCategory] = useState(
      params.get("category") || "All discussions",
    ),
    [sort, setSort] = useState("latest"),
    [search, setSearch] = useState(""),
    [compose, setCompose] = useState(false),
    [selected, setSelected] = useState<Post | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const filtered = app.posts
    .filter(
      (p) =>
        (!params.get("tournament") ||
          p.tournament_id === params.get("tournament")) &&
        (category === "All discussions" || p.category === category) &&
        (p.title + " " + p.body).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "trending"
        ? b.likes - a.likes
        : b.created_at.localeCompare(a.created_at),
    );
  async function react(post: Post) {
    if (!app.requireAuth()) return;
    try {
      let likes = post.likes;
      if (app.demo) {
        const key = "liked-" + post.id;
        const liked = localStorage.getItem(key);
        likes = Math.max(0, post.likes + (liked ? -1 : 1));
        if (liked) localStorage.removeItem(key);
        else localStorage.setItem(key, "true");
      } else
        likes = (
          await api("posts/react", {
            method: "POST",
            body: JSON.stringify({ id: post.id }),
          })
        ).likes;
      app.update({
        posts: app.posts.map((p) => (p.id === post.id ? { ...p, likes } : p)),
      });
    } catch (e) {
      app.notify((e as Error).message, true);
    }
  }
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">THE CONVERSATION BEYOND THE BOARD</div>
          <h1>
            Find your chess people<span className="orange-text">.</span>
          </h1>
          <p>Good games start with a great community. Pull up a chair.</p>
        </div>
        <button
          className="button"
          onClick={() => {
            if (app.requireAuth()) setCompose(true);
          }}
        >
          <Plus size={17} />
          Start a discussion
        </button>
      </div>
      <div className="community-layout">
        <aside className="community-filters panel">
          <div className="sidebar-label">EXPLORE DISCUSSIONS</div>
          {categories.map((c) => (
            <button
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
              key={c}
            >
              {c}
            </button>
          ))}
          <div className="divider" />
          <ShieldCheck size={24} className="orange-text" />
          <h3>Keep it a good game.</h3>
          <p>
            Be helpful. Respect other players. No spam, harassment, or engine
            assistance.
          </p>
        </aside>
        <div>
          <div className="feed-toolbar">
            <div className="tabs">
              <button
                className={sort === "latest" ? "active" : ""}
                onClick={() => setSort("latest")}
              >
                Latest
              </button>
              <button
                className={sort === "trending" ? "active" : ""}
                onClick={() => setSort("trending")}
              >
                Trending
              </button>
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Search discussions"
                placeholder="Search discussions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {filtered.length ? (
            filtered.map((p) => (
              <article className="post panel" key={p.id}>
                <div className="post-author">
                  <span
                    className={
                      "avatar " +
                      (p.category === "Announcements" ? "orange-avatar" : "")
                    }
                  >
                    {p.author_name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <strong>
                      {p.author_name}
                      {p.category === "Announcements" && (
                        <ShieldCheck size={13} />
                      )}
                    </strong>
                    <small>
                      {date(p.created_at, true)} ·{" "}
                      {app.demo ? "Demo community" : "Community member"}
                    </small>
                  </div>
                  <Badge color={p.category === "Announcements" ? "orange" : ""}>
                    {p.category}
                  </Badge>
                </div>
                <button className="post-title" onClick={() => setSelected(p)}>
                  <h2>
                    {p.title}
                    {p.locked && <Lock size={15} />}
                  </h2>
                </button>
                <p>{p.body}</p>
                <div className="post-actions">
                  <button
                    onClick={() => react(p)}
                    aria-label={"Like " + p.title}
                  >
                    <Heart size={16} />
                    {p.likes}
                  </button>
                  <button onClick={() => setSelected(p)}>
                    <MessageSquare size={16} />
                    Discuss
                  </button>
                  <button className="post-more" onClick={() => setSelected(p)}>
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Empty
              title="Start the conversation"
              description="No discussions match this filter. Share a question or introduce yourself."
            />
          )}
        </div>
      </div>
      {compose && (
        <Modal title="Start a conversation" onClose={() => setCompose(false)}>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget),
                v = {
                  title: String(f.get("title")),
                  body: String(f.get("body")),
                  category: String(f.get("category")),
                  tournament_id: params.get("tournament") || undefined,
                };
              try {
                if (app.demo)
                  app.update({
                    posts: [
                      {
                        ...v,
                        id: crypto.randomUUID(),
                        author_id: app.profile!.id,
                        author_name: app.profile!.display_name,
                        created_at: new Date().toISOString(),
                        likes: 0,
                      },
                      ...app.posts,
                    ],
                  });
                else {
                  await api("posts", {
                    method: "POST",
                    body: JSON.stringify(v),
                  });
                  await app.refresh();
                }
                setCompose(false);
                app.notify("Your discussion is live.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Category
              <select name="category">
                {categories
                  .slice(1)
                  .filter(
                    (c) =>
                      c !== "Announcements" || app.profile?.role !== "USER",
                  )
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
            </label>
            <label>
              Title
              <input
                name="title"
                required
                minLength={5}
                maxLength={160}
                placeholder="What’s on your mind?"
              />
            </label>
            <label>
              Your post
              <textarea
                name="body"
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                placeholder="Share an idea, ask a question, or find your next practice partner."
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="button" disabled={busy}>
              <Send size={16} />
              Publish discussion
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Discussion
          post={app.posts.find((p) => p.id === selected.id) || selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function Discussion({ post, onClose }: { post: Post; onClose: () => void }) {
  const app = useApp();
  const [comments, setComments] = useState<Comment[]>([]),
    [report, setReport] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (app.demo) {
      try {
        setComments(
          JSON.parse(localStorage.getItem("comments-" + post.id) || "[]"),
        );
      } catch {}
    } else
      api("comments?post_id=" + post.id)
        .then(setComments)
        .catch((e) => setError(e.message));
  }, [post.id, app.demo]);
  return (
    <Modal title="Community discussion" onClose={onClose} wide>
      <Badge>{post.category}</Badge>
      <h2 className="discussion-title">{post.title}</h2>
      <p className="muted small-text">
        By {post.author_name} · {date(post.created_at)}
      </p>
      <p className="post-full-body">{post.body}</p>
      <button
        className="text-button muted"
        onClick={() => {
          if (app.requireAuth()) setReport(!report);
        }}
      >
        <Flag size={13} />
        Report post
      </button>
      {report && (
        <form
          className="stack-form report-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const reason = String(
                new FormData(e.currentTarget).get("reason"),
              );
              if (!app.demo)
                await api("posts/report", {
                  method: "POST",
                  body: JSON.stringify({ id: post.id, reason }),
                });
              else localStorage.setItem("report-" + post.id, reason);
              setReport(false);
              app.notify(
                app.demo
                  ? "Demo report saved in this browser."
                  : "Report submitted for review.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Why are you reporting this?
            <input
              name="reason"
              minLength={5}
              maxLength={500}
              required
              placeholder="Describe the issue"
            />
          </label>
          <button className="button secondary">Submit report</button>
        </form>
      )}
      <div className="divider" />
      <h3>{comments.length} replies</h3>
      {comments.map((c) => (
        <div className="comment" key={c.id}>
          <span className="avatar">
            {c.author_name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{c.author_name}</strong>
            <p>{c.body}</p>
            <small>{date(c.created_at, true)}</small>
            {app.profile?.role === "ADMIN" && (
              <button
                className="text-button danger"
                onClick={async () => {
                  try {
                    if (!app.demo)
                      await api("admin/moderate", {
                        method: "POST",
                        body: JSON.stringify({
                          id: c.id,
                          action: "delete_comment",
                        }),
                      });
                    const next = comments.filter((x) => x.id !== c.id);
                    setComments(next);
                    if (app.demo)
                      localStorage.setItem(
                        "comments-" + post.id,
                        JSON.stringify(next),
                      );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Remove comment
              </button>
            )}
          </div>
        </div>
      ))}
      {!comments.length && (
        <p className="muted">Be the first to add a thoughtful reply.</p>
      )}
      {post.locked ? (
        <div className="info-panel">
          <Lock size={16} />
          This discussion has been locked by a moderator.
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!app.requireAuth()) return;
            setBusy(true);
            setError("");
            const form = e.currentTarget,
              body = String(new FormData(form).get("body"));
            try {
              const c = app.demo
                ? {
                    id: crypto.randomUUID(),
                    post_id: post.id,
                    author_name: app.profile!.display_name,
                    body,
                    created_at: new Date().toISOString(),
                  }
                : await api("comments", {
                    method: "POST",
                    body: JSON.stringify({ post_id: post.id, body }),
                  });
              const next = [...comments, c];
              setComments(next);
              if (app.demo)
                localStorage.setItem(
                  "comments-" + post.id,
                  JSON.stringify(next),
                );
              form.reset();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Add to the discussion
            <textarea
              name="body"
              rows={3}
              minLength={2}
              maxLength={2000}
              required
              placeholder="Share your perspective…"
            />
          </label>
          <button className="button" disabled={busy}>
            <Send size={15} />
            Post reply
          </button>
        </form>
      )}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
