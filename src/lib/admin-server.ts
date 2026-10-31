import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  db,
  organizer,
  administrator,
  checked,
  rate,
  HttpError,
} from "./server";
import type { Profile } from "./types";

export async function adminCollection(
  req: NextRequest,
  p: Profile,
  resource: string,
) {
  administrator(p);
  if (
    ![
      "tournaments",
      "registrations",
      "refunds",
      "users",
      "posts",
      "logs",
      "reports",
      "comments",
    ].includes(resource)
  )
    return null;
  if (["users", "posts", "logs", "reports", "comments"].includes(resource))
    administrator(p);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.nextUrl.searchParams.get("page") || 1);
  const search = z
    .string()
    .trim()
    .max(80)
    .parse(req.nextUrl.searchParams.get("q") || "");
  const event = req.nextUrl.searchParams.get("tournament_id");
  if (event) await organizer(p, z.string().uuid().parse(event));
  const table =
    { users: "profiles", logs: "audit_logs", refunds: "payment_orders" }[
      resource as "users" | "logs" | "refunds"
    ] || resource;
  const scoped = ["registrations", "refunds"].includes(resource);
  let query = db()
    .from(table)
    .select(
      scoped
        ? "*,tournament:tournaments!inner(organizer_id,title)"
        : resource === "reports"
          ? "*,post:posts(title,body,hidden,locked)"
          : "*",
      { count: "exact" },
    );
  if (resource === "comments")
    query = query.eq(
      "post_id",
      z.string().uuid().parse(req.nextUrl.searchParams.get("post_id")),
    );
  if (p.role !== "ADMIN")
    query = query.eq(scoped ? "tournament.organizer_id" : "organizer_id", p.id);
  if (event && scoped) query = query.eq("tournament_id", event);
  const fields: Record<string, string> = {
    users: "display_name",
    posts: "title",
    logs: "action",
    registrations: "username",
    tournaments: "title",
    refunds: "order_id",
    reports: "reason",
  };
  const field = fields[resource];
  if (search && field)
    query =
      resource === "users" && z.string().uuid().safeParse(search).success
        ? query.eq("id", search)
        : query.ilike(field, "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
  if (resource === "refunds")
    query = query.eq("payment_status", "refund_requested");
  if (resource === "reports") query = query.eq("status", "open");
  const result = await query
    .order("created_at", { ascending: false })
    .order(resource === "refunds" ? "order_id" : "id")
    .range((page - 1) * 50, page * 50 - 1);
  const rows = checked(result) || [];
  return NextResponse.json({
    rows,
    total: result.count || 0,
    page,
    page_size: 50,
  });
}

export async function exportRegistrations(req: NextRequest, p: Profile) {
  administrator(p);
  await rate("export:" + p.id, 3, 300);
  const id = z
    .string()
    .uuid()
    .parse(req.nextUrl.searchParams.get("tournament_id"));
  await organizer(p, id);
  const count = await db()
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id);
  checked(count);
  if ((count.count || 0) > 10000)
    throw new HttpError(
      413,
      "This event exceeds 10,000 historical entries. Use a database export for its complete history.",
    );
  const rows: unknown[][] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const batch =
      checked(
        await db()
          .from("registrations")
          .select("username,rating,status,payment_status,created_at")
          .eq("tournament_id", id)
          .order("id")
          .range(offset, offset + 499),
      ) || [];
    rows.push(
      ...batch.map((r) => [
        r.username,
        r.rating,
        r.status,
        r.payment_status,
        r.created_at,
      ]),
    );
    if (batch.length < 500) break;
  }
  return NextResponse.json({
    headers: ["Player", "Rating", "Status", "Payment", "Submitted at"],
    rows,
  });
}
