import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { ChessPlayer, Profile } from "./types";
import { usernameSchema } from "./validation";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new HttpError(503, "Live services are not configured yet.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function user(req: NextRequest): Promise<Profile> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "Please sign in to continue.");
  const client = db();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(401, "Your session expired. Please sign in again.");
  const p = await client
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (p.error) throw new HttpError(403, "Account profile unavailable.");
  return { ...p.data, email: data.user.email };
}
export async function organizer(p: Profile, id?: string) {
  if (p.role === "ADMIN") return;
  if (p.role !== "ORGANIZER")
    throw new HttpError(403, "Organizer access is required.");
  if (id) {
    const { data } = await db()
      .from("tournaments")
      .select("organizer_id")
      .eq("id", id)
      .single();
    if (data?.organizer_id !== p.id)
      throw new HttpError(403, "You can only manage tournaments you organize.");
  }
}
export function administrator(p: Profile) {
  if (p.role !== "ADMIN")
    throw new HttpError(403, "Administrator access is required.");
}
export async function rate(key: string, limit = 20, seconds = 60) {
  const { data, error } = await db().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (error) throw new HttpError(503, "Please try again shortly.");
  if (!data)
    throw new HttpError(
      429,
      "Too many requests. Please try again in a minute.",
    );
}
export function checked<T>(r: {
  data: T;
  error: { message: string } | null;
}): T {
  if (r.error) {
    if (/duplicate|unique/i.test(r.error.message))
      throw new HttpError(409, "This record already exists.");
    if (
      /closed|already registered|rating|too new|full|previous paid/i.test(
        r.error.message,
      )
    )
      throw new HttpError(400, r.error.message);
    throw new HttpError(500, "Unable to save this change. Please try again.");
  }
  return r.data;
}
export async function audit(
  p: Profile,
  action: string,
  id: string,
  details: object = {},
) {
  checked(
    await db()
      .from("audit_logs")
      .insert({ actor_id: p.id, action, entity_id: id, details }),
  );
}
export function validSignature(
  payload: string,
  signature: string,
  secret: string,
) {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return (
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
export async function razor(path: string, method = "GET", body?: object) {
  const key = process.env.RAZORPAY_KEY_ID,
    secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret)
    throw new HttpError(
      503,
      "Payments are not configured. No charge has been made.",
    );
  const r = await fetch("https://api.razorpay.com/v1/" + path, {
    method,
    headers: {
      Authorization:
        "Basic " + Buffer.from(key + ":" + secret).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok)
    throw new HttpError(
      502,
      "The payment provider is unavailable. Please try again.",
    );
  return r.json();
}
const cache = new Map<string, { expires: number; value: ChessPlayer }>();
export async function chessPlayer(
  username: string,
  category = "Rapid",
): Promise<ChessPlayer> {
  username = usernameSchema.parse(username).toLowerCase();
  const key = username + category,
    cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const fetchChess = async (path: string) => {
    let r: Response;
    try {
      r = await fetch("https://api.chess.com/pub/player/" + username + path, {
        headers: {
          "User-Agent": "KnightfallArena/1.0 (tournament eligibility)",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
    } catch {
      throw new HttpError(
        503,
        "Chess.com is temporarily unavailable. Try again shortly.",
      );
    }
    if (r.status === 404)
      throw new HttpError(404, "That Chess.com player could not be found.");
    if (!r.ok)
      throw new HttpError(503, "Chess.com is busy. Please try again shortly.");
    return r.json();
  };
  const profile = await fetchChess(""),
    stats = await fetchChess("/stats");
  if (
    profile.status === "closed:fair_play_violations" ||
    profile.status === "closed:abuse"
  )
    throw new HttpError(400, "This Chess.com account is closed.");
  const rating =
    stats[
      "chess_" + (category === "Classical" ? "rapid" : category.toLowerCase())
    ]?.last?.rating ?? null;
  const value = {
    username: profile.username,
    rating,
    joined: profile.joined,
    title: profile.title,
    country: profile.country?.split("/").pop(),
    url: profile.url,
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { expires: Date.now() + 60000, value });
  return value;
}
