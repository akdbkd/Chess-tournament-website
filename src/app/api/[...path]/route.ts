import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  db,
  user,
  organizer,
  administrator,
  rate,
  checked,
  audit,
  validSignature,
  razor,
  chessPlayer,
  HttpError,
} from "@/lib/server";
import {
  registrationSchema,
  tournamentSchema,
  eligibility,
} from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const uuid = z.string().uuid();
const demoLookupLimits = new Map<string, { n: number; until: number }>();
async function handle(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/"),
      method = req.method;
    if (method !== "GET" && path !== "payments/webhook") {
      const origin = req.headers.get("origin");
      if (
        origin &&
        origin !== req.nextUrl.origin &&
        origin !== process.env.NEXT_PUBLIC_SITE_URL
      )
        throw new HttpError(403, "Request origin not allowed.");
    }
    if (path === "chess/player" && method === "GET") {
      const key =
        "lookup:" +
        (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown");
      if (
        process.env.NEXT_PUBLIC_DEMO_MODE !== "false" &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        const v = demoLookupLimits.get(key);
        if (v && v.until > Date.now()) {
          if (++v.n > 20)
            throw new HttpError(
              429,
              "Please wait a minute before looking up more players.",
            );
        } else {
          if (demoLookupLimits.size > 1000) demoLookupLimits.clear();
          demoLookupLimits.set(key, { n: 1, until: Date.now() + 60000 });
        }
      } else await rate(key, 20);
      return NextResponse.json(
        await chessPlayer(
          req.nextUrl.searchParams.get("username") || "",
          z
            .enum(["Rapid", "Blitz", "Bullet", "Classical"])
            .parse(req.nextUrl.searchParams.get("category") || "Rapid"),
        ),
      );
    }
    if (path === "payments/webhook" && method === "POST") {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) throw new HttpError(503, "Webhook is not configured.");
      const raw = await req.text();
      if (
        !validSignature(
          raw,
          req.headers.get("x-razorpay-signature") || "",
          secret,
        )
      )
        throw new HttpError(401, "Invalid webhook signature.");
      const event = JSON.parse(raw);
      if (event.event === "payment.captured") {
        const p = event.payload.payment.entity;
        if (p.currency !== "INR" || p.status !== "captured")
          throw new HttpError(400, "Invalid payment currency or state.");
        checked(
          await db().rpc("confirm_payment", {
            p_order: p.order_id,
            p_payment: p.id,
            p_amount: p.amount,
          }),
        );
      }
      if (event.event === "refund.processed") {
        const r = event.payload.refund.entity;
        const row = checked(
          await db()
            .from("payment_orders")
            .select("*")
            .eq("payment_id", r.payment_id)
            .maybeSingle(),
        );
        if (row && r.amount === row.amount_paise) {
          checked(
            await db()
              .from("payment_orders")
              .update({ payment_status: "refunded" })
              .eq("order_id", row.order_id),
          );
          checked(
            await db()
              .from("registrations")
              .update({ payment_status: "refunded", status: "withdrawn" })
              .eq("payment_id", r.payment_id),
          );
        }
      }
      return NextResponse.json({ received: true });
    }
    if (path === "tournaments" && method === "GET") {
      const rows =
        checked(
          await db()
            .from("tournament_catalog")
            .select("*")
            .not("status", "in", "(draft,archived)")
            .order("starts_at"),
        ) || [];
      return NextResponse.json(
        rows.map(({ active_participants, ...t }) => ({
          ...t,
          participants: active_participants,
        })),
      );
    }
    if (path === "settings/public" && method === "GET")
      return NextResponse.json(
        checked(
          await db()
            .from("site_settings")
            .select("support_email,community_enabled")
            .single(),
        ),
      );
    if (path === "posts" && method === "GET")
      return NextResponse.json(
        checked(
          await db()
            .from("posts")
            .select("*")
            .eq("hidden", false)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    if (path === "tournament/details" && method === "GET") {
      const id = uuid.parse(req.nextUrl.searchParams.get("id"));
      const t = checked(
        await db()
          .from("tournaments")
          .select("id,status")
          .eq("id", id)
          .single(),
      );
      if (!t || ["draft", "archived"].includes(t.status))
        throw new HttpError(404, "Tournament not found.");
      const participants = checked(
        await db()
          .from("registrations")
          .select("username,rating,status")
          .eq("tournament_id", id)
          .in("status", ["approved", "checked_in"]),
      );
      const standings = checked(
        await db()
          .from("standings")
          .select("*")
          .eq("tournament_id", id)
          .order("score", { ascending: false })
          .order("tiebreak", { ascending: false }),
      );
      return NextResponse.json({ participants, standings });
    }
    if (path === "comments" && method === "GET") {
      const id = uuid.parse(req.nextUrl.searchParams.get("post_id"));
      const post = checked(
        await db().from("posts").select("hidden").eq("id", id).single(),
      );
      if (!post || post.hidden) throw new HttpError(404, "Post unavailable.");
      return NextResponse.json(
        checked(
          await db()
            .from("comments")
            .select("id,post_id,author_name,body,created_at")
            .eq("post_id", id)
            .order("created_at")
            .limit(200),
        ),
      );
    }
    const p = await user(req);
    await rate("user:" + p.id, 100);
    if (path === "me" && method === "GET") {
      const c = db();
      const registrations = checked(
        await c
          .from("registrations")
          .select("*,tournament:tournaments(*)")
          .eq("registered_by", p.id)
          .order("created_at", { ascending: false }),
      );
      const saved = checked(
        await c
          .from("saved_tournaments")
          .select("tournament_id")
          .eq("user_id", p.id),
      );
      const notices = checked(
        await c
          .from("notifications")
          .select("*")
          .eq("user_id", p.id)
          .order("created_at", { ascending: false })
          .limit(100),
      );
      return NextResponse.json({
        profile: p,
        registrations,
        saved: (saved || []).map((s) => s.tournament_id),
        notices,
      });
    }
    if (path === "admin" && method === "GET") {
      await organizer(p);
      let q = db()
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false });
      if (p.role !== "ADMIN") q = q.eq("organizer_id", p.id);
      const tournaments = checked(await q) || [];
      const ids = tournaments.map((t) => t.id);
      const registrations = ids.length
        ? checked(
            await db()
              .from("registrations")
              .select("*")
              .in("tournament_id", ids)
              .order("created_at", { ascending: false }),
          )
        : [];
      const profiles =
        p.role === "ADMIN"
          ? checked(await db().from("profiles").select("*").limit(200))
          : [];
      const logs =
        p.role === "ADMIN"
          ? checked(
              await db()
                .from("audit_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50),
            )
          : [];
      const reports =
        p.role === "ADMIN"
          ? checked(await db().from("reports").select("*").eq("status", "open"))
          : [];
      const refunds = ids.length
        ? checked(
            await db()
              .from("payment_orders")
              .select("*")
              .in("tournament_id", ids)
              .eq("payment_status", "refund_requested"),
          )
        : [];
      return NextResponse.json({
        tournaments,
        registrations,
        profiles,
        logs,
        reports,
        refunds,
      });
    }
    const body = method === "GET" ? {} : await req.json();
    if (path === "registration" && method === "POST") {
      await rate("registration:" + p.id, 8);
      const v = registrationSchema.parse(body);
      const t = checked(
        await db()
          .from("tournaments")
          .select("*")
          .eq("id", v.tournament_id)
          .single(),
      );
      if (
        t.fee_paise > 0 &&
        (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
      )
        throw new HttpError(
          503,
          "Paid registration is not available yet. No charge has been made.",
        );
      const player = await chessPlayer(v.username, t.category);
      const reasons = eligibility(t, player);
      if (reasons.length) throw new HttpError(400, reasons.join(" "));
      // username uniqueness is case-insensitive via the generated normalized_username column.
      const old = checked(
        await db()
          .from("chess_players")
          .select("id")
          .eq("normalized_username", player.username.toLowerCase())
          .maybeSingle(),
      );
      const playerValues = {
        username: player.username,
        rating: player.rating,
        joined: player.joined,
        country: player.country,
        title: player.title,
        last_synced_at: new Date().toISOString(),
      };
      let cp;
      if (old)
        cp = checked(
          await db()
            .from("chess_players")
            .update(playerValues)
            .eq("id", old.id)
            .select()
            .single(),
        );
      else {
        const insert = await db()
          .from("chess_players")
          .insert(playerValues)
          .select()
          .single();
        if (insert.error?.code === "23505")
          cp = checked(
            await db()
              .from("chess_players")
              .select("id")
              .eq("normalized_username", player.username.toLowerCase())
              .single(),
          );
        else cp = checked(insert);
      }
      const r = checked(
        await db().rpc("reserve_registration", {
          p_tournament: t.id,
          p_user: p.id,
          p_player: cp.id,
          p_username: player.username,
          p_rating: player.rating,
        }),
      );
      if (t.fee_paise === 0) return NextResponse.json({ registration: r });
      try {
        const order = await razor("orders", "POST", {
          amount: r.amount_paise,
          currency: "INR",
          receipt: r.id,
          notes: { registration_id: r.id },
        });
        checked(
          await db().from("payment_orders").insert({
            order_id: order.id,
            registration_id: r.id,
            tournament_id: t.id,
            user_id: p.id,
            amount_paise: r.amount_paise,
            expires_at: r.expires_at,
          }),
        );
        checked(
          await db()
            .from("registrations")
            .update({ order_id: order.id })
            .eq("id", r.id),
        );
        return NextResponse.json({
          registration: { ...r, order_id: order.id },
          order,
          key: process.env.RAZORPAY_KEY_ID,
        });
      } catch (error) {
        await db()
          .from("registrations")
          .update({ status: "withdrawn" })
          .eq("id", r.id)
          .eq("payment_status", "unpaid");
        throw error;
      }
    }
    if (path === "payments/resume" && method === "POST") {
      const r = checked(
        await db()
          .from("registrations")
          .select("*")
          .eq("id", uuid.parse(body.id))
          .eq("registered_by", p.id)
          .single(),
      );
      if (
        r.status !== "pending_payment" ||
        !r.order_id ||
        new Date(r.expires_at).getTime() < Date.now()
      )
        throw new HttpError(
          400,
          "This payment reservation has expired. Please register again.",
        );
      return NextResponse.json({
        registration: r,
        order: await razor("orders/" + encodeURIComponent(r.order_id)),
        key: process.env.RAZORPAY_KEY_ID,
      });
    }
    if (path === "payments/verify" && method === "POST") {
      const v = z
        .object({
          razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
          razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
          razorpay_signature: z.string(),
        })
        .parse(body);
      const r = checked(
        await db()
          .from("payment_orders")
          .select("order_id")
          .eq("order_id", v.razorpay_order_id)
          .eq("user_id", p.id)
          .single(),
      );
      if (!r) throw new HttpError(404, "Registration not found.");
      if (
        !process.env.RAZORPAY_KEY_SECRET ||
        !validSignature(
          v.razorpay_order_id + "|" + v.razorpay_payment_id,
          v.razorpay_signature,
          process.env.RAZORPAY_KEY_SECRET,
        )
      )
        throw new HttpError(400, "Payment verification failed.");
      const payment = await razor("payments/" + v.razorpay_payment_id);
      if (
        payment.order_id !== v.razorpay_order_id ||
        payment.currency !== "INR" ||
        payment.status !== "captured"
      )
        throw new HttpError(
          409,
          "Payment is awaiting capture. Your dashboard will update after confirmation.",
        );
      const registration = checked(
        await db().rpc("confirm_payment", {
          p_order: payment.order_id,
          p_payment: payment.id,
          p_amount: payment.amount,
        }),
      );
      return NextResponse.json({ registration });
    }
    if (path === "registration/action" && method === "POST") {
      const v = z
        .object({
          id: uuid,
          action: z.enum([
            "withdraw",
            "checkin",
            "approve",
            "reject",
            "refund",
          ]),
        })
        .parse(body);
      const r = checked(
        await db().from("registrations").select("*").eq("id", v.id).single(),
      );
      const t = checked(
        await db()
          .from("tournaments")
          .select("*")
          .eq("id", r.tournament_id)
          .single(),
      );
      if (["withdraw", "checkin"].includes(v.action)) {
        if (r.registered_by !== p.id)
          throw new HttpError(
            403,
            "This registration belongs to another user.",
          );
      } else await organizer(p, t.id);
      let update: Record<string, unknown> = {};
      if (v.action === "withdraw") {
        if (new Date(t.starts_at).getTime() <= Date.now())
          throw new HttpError(
            400,
            "The event has started. Contact the organizer.",
          );
        if (
          !["approved", "pending", "pending_payment", "waitlisted"].includes(
            r.status,
          )
        )
          throw new HttpError(400, "This entry cannot be withdrawn.");
        update = {
          status: "withdrawn",
          ...(r.payment_status === "paid"
            ? { payment_status: "refund_requested" }
            : {}),
        };
      }
      if (v.action === "checkin") {
        const delta = new Date(t.starts_at).getTime() - Date.now();
        if (r.status !== "approved" || delta > 1800000 || delta < 0)
          throw new HttpError(
            400,
            "Check-in opens 30 minutes before the event for approved entries.",
          );
        update = {
          status: "checked_in",
          checked_in_at: new Date().toISOString(),
        };
      }
      if (v.action === "approve") {
        if (
          r.status !== "pending" ||
          !["paid", "free"].includes(r.payment_status)
        )
          throw new HttpError(
            400,
            "Only pending, paid or free entries can be approved.",
          );
        update = { status: "approved" };
      }
      if (v.action === "reject") {
        if (!["pending", "approved"].includes(r.status))
          throw new HttpError(400, "This entry cannot be rejected.");
        update = {
          status: "rejected",
          ...(r.payment_status === "paid"
            ? { payment_status: "refund_requested" }
            : {}),
        };
      }
      if (v.action === "refund") {
        if (
          !r.payment_id ||
          !["paid", "refund_requested"].includes(r.payment_status) ||
          !["withdrawn", "rejected"].includes(r.status)
        )
          throw new HttpError(
            400,
            "Withdraw or reject a paid entry before refunding.",
          );
        const existing = await razor("payments/" + r.payment_id + "/refunds");
        if (
          existing.items?.some(
            (x: { status: string; amount: number }) =>
              x.amount === r.amount_paise && x.status !== "failed",
          )
        )
          throw new HttpError(409, "A refund already exists for this payment.");
        await razor("payments/" + r.payment_id + "/refund", "POST", {
          amount: r.amount_paise,
          notes: { registration_id: r.id },
        });
        update = { payment_status: "refund_requested" };
      }
      const updated =
        v.action === "refund"
          ? checked(
              await db()
                .from("registrations")
                .update(update)
                .eq("id", r.id)
                .select()
                .single(),
            )
          : checked(
              await db().rpc("transition_registration", {
                p_id: r.id,
                p_actor: p.id,
                p_action: v.action,
              }),
            );
      if (v.action === "refund") await audit(p, "registration.refund", r.id);
      return NextResponse.json(updated);
    }
    if (path === "payments/refund" && method === "POST") {
      const orderId = z
        .string()
        .regex(/^order_[a-zA-Z0-9]+$/)
        .parse(body.order_id);
      const o = checked(
        await db()
          .from("payment_orders")
          .select("*")
          .eq("order_id", orderId)
          .single(),
      );
      await organizer(p, o.tournament_id);
      if (o.payment_status !== "refund_requested" || !o.payment_id)
        throw new HttpError(400, "This payment is not awaiting a refund.");
      const existing = await razor("payments/" + o.payment_id + "/refunds");
      if (
        existing.items?.some(
          (x: { status: string; amount: number }) =>
            x.amount === o.amount_paise && x.status !== "failed",
        )
      )
        throw new HttpError(409, "A refund is already in progress.");
      await razor("payments/" + o.payment_id + "/refund", "POST", {
        amount: o.amount_paise,
        notes: { order_id: o.order_id },
      });
      await audit(p, "payment.refund_requested", o.order_id);
      return NextResponse.json({ ok: true });
    }
    if (path === "saved" && method === "POST") {
      const id = uuid.parse(body.id);
      const c = db();
      const existing = checked(
        await c
          .from("saved_tournaments")
          .select("*")
          .eq("user_id", p.id)
          .eq("tournament_id", id)
          .maybeSingle(),
      );
      if (existing)
        checked(
          await c
            .from("saved_tournaments")
            .delete()
            .eq("user_id", p.id)
            .eq("tournament_id", id),
        );
      else
        checked(
          await c
            .from("saved_tournaments")
            .insert({ user_id: p.id, tournament_id: id }),
        );
      return NextResponse.json({ saved: !existing });
    }
    if (path === "notifications/read" && method === "POST") {
      checked(
        await db()
          .from("notifications")
          .update({ read: true })
          .eq("user_id", p.id),
      );
      return NextResponse.json({ ok: true });
    }
    if (path === "profile" && method === "POST") {
      const display_name = z
        .string()
        .trim()
        .min(2)
        .max(80)
        .parse(body.display_name);
      checked(
        await db().from("profiles").update({ display_name }).eq("id", p.id),
      );
      return NextResponse.json({ ok: true });
    }
    if (path === "tournaments/save" && method === "POST") {
      const id = body.id ? uuid.parse(body.id) : undefined;
      await organizer(p, id);
      const v = tournamentSchema.parse(body);
      if (id) {
        const current = checked(
          await db()
            .from("tournaments")
            .select("fee_paise,capacity")
            .eq("id", id)
            .single(),
        );
        const entries = checked(
          await db()
            .from("registrations")
            .select("id")
            .eq("tournament_id", id)
            .in("status", [
              "approved",
              "pending",
              "checked_in",
              "pending_payment",
            ]),
        );
        if (entries?.length && current?.fee_paise !== v.fee_paise)
          throw new HttpError(
            400,
            "Entry fee cannot change after registrations begin.",
          );
        if (v.capacity < (entries?.length || 0))
          throw new HttpError(
            400,
            "Capacity cannot be below the active registration count.",
          );
      }
      const result = id
        ? checked(
            await db()
              .from("tournaments")
              .update(v)
              .eq("id", id)
              .select()
              .single(),
          )
        : checked(
            await db()
              .from("tournaments")
              .insert({
                ...v,
                organizer_id: p.id,
                organizer_name: p.display_name,
              })
              .select()
              .single(),
          );
      await audit(
        p,
        id ? "tournament.updated" : "tournament.created",
        result.id,
      );
      return NextResponse.json(result);
    }
    if (path === "standings/import" && method === "POST") {
      const id = uuid.parse(body.tournament_id);
      await organizer(p, id);
      const rows = z
        .array(
          z.object({
            username: z.string().regex(/^[\w-]{3,25}$/),
            score: z.number().min(0).max(1000),
            wins: z.number().int().min(0),
            draws: z.number().int().min(0),
            losses: z.number().int().min(0),
            tiebreak: z.number().min(0),
          }),
        )
        .max(10000)
        .parse(body.rows);
      checked(
        await db()
          .from("standings")
          .upsert(
            rows.map((r) => ({ ...r, tournament_id: id })),
            { onConflict: "tournament_id,username" },
          ),
      );
      await audit(p, "standings.imported", id, { rows: rows.length });
      return NextResponse.json({ count: rows.length });
    }
    if (path === "posts" && method === "POST") {
      await rate("post:" + p.id, 5, 300);
      const settings = checked(
        await db().from("site_settings").select("*").single(),
      );
      if (!settings.community_enabled)
        throw new HttpError(403, "Community posting is temporarily paused.");
      const v = z
        .object({
          tournament_id: uuid.optional(),
          title: z.string().trim().min(5).max(160),
          body: z.string().trim().min(10).max(5000),
          category: z.enum([
            "General",
            "Tournament Discussion",
            "Announcements",
            "Looking for Players",
            "Chess Discussion",
          ]),
        })
        .parse(body);
      if (v.tournament_id) {
        const tournament = checked(
          await db()
            .from("tournaments")
            .select("id,status")
            .eq("id", v.tournament_id)
            .single(),
        );
        if (!tournament || ["draft", "archived"].includes(tournament.status))
          throw new HttpError(404, "Tournament unavailable.");
      }
      if (v.category === "Announcements") await organizer(p, v.tournament_id);
      const post = checked(
        await db()
          .from("posts")
          .insert({ ...v, author_id: p.id, author_name: p.display_name })
          .select()
          .single(),
      );
      if (v.category === "Announcements" && v.tournament_id) {
        const recipients =
          checked(
            await db()
              .from("registrations")
              .select("registered_by")
              .eq("tournament_id", v.tournament_id)
              .in("status", ["approved", "pending", "checked_in"]),
          ) || [];
        const ids = [...new Set(recipients.map((r) => r.registered_by))];
        if (ids.length)
          checked(
            await db()
              .from("notifications")
              .insert(
                ids.map((user_id) => ({
                  user_id,
                  title: v.title,
                  body: v.body.slice(0, 500),
                })),
              ),
          );
      }
      return NextResponse.json(post);
    }

    if (path === "comments" && method === "POST") {
      await rate("comment:" + p.id, 10, 300);
      const v = z
        .object({ post_id: uuid, body: z.string().trim().min(2).max(2000) })
        .parse(body);
      const post = checked(
        await db().from("posts").select("*").eq("id", v.post_id).single(),
      );
      if (post.hidden || post.locked)
        throw new HttpError(403, "This discussion is closed.");
      return NextResponse.json(
        checked(
          await db()
            .from("comments")
            .insert({ ...v, author_id: p.id, author_name: p.display_name })
            .select()
            .single(),
        ),
      );
    }
    if (path === "posts/react" && method === "POST")
      return NextResponse.json({
        likes: checked(
          await db().rpc("toggle_reaction", {
            p_post: uuid.parse(body.id),
            p_user: p.id,
          }),
        ),
      });
    if (path === "posts/report" && method === "POST") {
      await rate("report:" + p.id, 5, 300);
      checked(
        await db()
          .from("reports")
          .insert({
            post_id: uuid.parse(body.id),
            user_id: p.id,
            reason: z.string().trim().min(5).max(500).parse(body.reason),
          }),
      );
      return NextResponse.json({ ok: true });
    }
    if (path === "admin/moderate" && method === "POST") {
      administrator(p);
      const id = uuid.parse(body.id);
      const action = z
        .enum(["hide", "lock", "delete_comment", "resolve_report"])
        .parse(body.action);
      if (action === "hide")
        checked(await db().from("posts").update({ hidden: true }).eq("id", id));
      if (action === "lock")
        checked(await db().from("posts").update({ locked: true }).eq("id", id));
      if (action === "delete_comment")
        checked(await db().from("comments").delete().eq("id", id));
      if (action === "resolve_report")
        checked(
          await db()
            .from("reports")
            .update({ status: "resolved" })
            .eq("id", id),
        );
      await audit(p, "community." + action, id);
      return NextResponse.json({ ok: true });
    }
    if (path === "admin/role" && method === "POST") {
      administrator(p);
      const id = uuid.parse(body.id);
      if (id === p.id)
        throw new HttpError(400, "You cannot change your own role.");
      const role = z.enum(["USER", "ORGANIZER", "ADMIN"]).parse(body.role);
      checked(await db().from("profiles").update({ role }).eq("id", id));
      await audit(p, "user.role_changed", id, { role });
      return NextResponse.json({ ok: true });
    }
    if (path === "admin/settings" && method === "POST") {
      administrator(p);
      const v = z
        .object({
          support_email: z.string().email(),
          community_enabled: z.boolean(),
        })
        .parse(body);
      checked(await db().from("site_settings").update(v).eq("id", true));
      await audit(p, "settings.updated", "site");
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
export const GET = handle;
export const POST = handle;
