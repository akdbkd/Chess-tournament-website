import type { MetadataRoute } from "next";
import { db, checked } from "@/lib/server";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return [];
  const origin = process.env.NEXT_PUBLIC_SITE_URL!;
  const rows =
    checked(
      await db()
        .from("tournaments")
        .select("slug,updated_at")
        .not("status", "in", "(draft,archived)")
        .order("starts_at", { ascending: false })
        .limit(1000),
    ) || [];
  return [
    "",
    "/tournaments",
    "/community",
    "/leaderboard",
    "/about",
    "/help",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refunds",
    "/legal/fair-play",
  ]
    .map((path) => ({ url: origin + path }))
    .concat(
      rows.map((t) => ({
        url: origin + "/tournaments/" + encodeURIComponent(t.slug),
        lastModified: t.updated_at,
      })),
    );
}
