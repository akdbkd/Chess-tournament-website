import { z } from "zod";
import type { ChessPlayer, Tournament } from "./types";
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(25)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use a valid Chess.com username.");
export const registrationSchema = z.object({
  tournament_id: z.string().uuid(),
  username: usernameSchema,
  accepted_rules: z.literal(true),
});
export const tournamentSchema = z
  .object({
    title: z.string().trim().min(5).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(["Rapid", "Blitz", "Bullet", "Classical"]),
    format: z.enum(["Swiss", "Arena", "Round Robin", "Knockout"]),
    time_control: z.string().regex(/^\d{1,3} \+ \d{1,3}$/),
    starts_at: z.string().datetime(),
    registration_closes: z.string().datetime(),
    capacity: z.number().int().min(2).max(10000),
    fee_paise: z.number().int().min(0).max(1000000),
    prize_paise: z.number().int().min(0).max(100000000),
    min_rating: z.number().int().min(0).max(4000),
    max_rating: z.number().int().min(0).max(4000),
    min_account_days: z.number().int().min(0).max(3650),
    chess_url: z
      .string()
      .refine(
        (v) => !v || isChessUrl(v),
        "Use an HTTPS Chess.com tournament URL.",
      ),
    auto_approve: z.boolean(),
    status: z.enum([
      "draft",
      "open",
      "closed",
      "live",
      "completed",
      "archived",
    ]),
    featured: z.boolean(),
    color: z.enum(["orange", "purple", "green", "blue"]),
  })
  .refine(
    (v) => v.max_rating >= v.min_rating,
    "Maximum rating must be at least the minimum.",
  )
  .refine(
    (v) => new Date(v.registration_closes) <= new Date(v.starts_at),
    "Registration must close before the event starts.",
  );
export function isChessUrl(v: string) {
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      (u.hostname === "www.chess.com" || u.hostname === "chess.com") &&
      /^\/(tournament|play|club|events)\//.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export function eligibility(
  t: Pick<
    Tournament,
    | "status"
    | "registration_closes"
    | "min_rating"
    | "max_rating"
    | "min_account_days"
  >,
  p: ChessPlayer,
  now = Date.now(),
): string[] {
  const reasons: string[] = [];
  if (t.status !== "open" || new Date(t.registration_closes).getTime() <= now)
    reasons.push("Registration has closed.");
  if (p.rating === null && (t.min_rating > 0 || t.max_rating < 3000))
    reasons.push(
      "This player needs an established rating in this time control.",
    );
  if (p.rating !== null && (p.rating < t.min_rating || p.rating > t.max_rating))
    reasons.push(
      `Rating must be between ${t.min_rating} and ${t.max_rating}. Current rating: ${p.rating}.`,
    );
  if ((now - p.joined * 1000) / 86400000 < t.min_account_days)
    reasons.push(
      `Chess.com account must be at least ${t.min_account_days} days old.`,
    );
  return reasons;
}
