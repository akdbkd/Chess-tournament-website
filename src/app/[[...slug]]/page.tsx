import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthComplete } from "@/components/auth-complete";
import { Home } from "@/components/home";
import {
  Tournaments,
  TournamentDetail,
  Leaderboard,
} from "@/components/tournaments";
import { Dashboard } from "@/components/dashboard";
import { Admin } from "@/components/admin";
import { Community } from "@/components/community";
import { About, Help, Legal } from "@/components/info";
import { ResetPassword } from "@/components/forms";
import { tournaments } from "@/lib/data";
type Props = { params: Promise<{ slug?: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = (await params).slug || [];
  if (!s.length) return {};
  let title = s[0].charAt(0).toUpperCase() + s[0].slice(1);
  if (s[0] === "tournaments" && s[1]) {
    title = tournaments.find((t) => t.slug === s[1])?.title || "Tournament";
    if (
      process.env.NEXT_PUBLIC_DEMO_MODE === "false" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const { db } = await import("@/lib/server");
        const { data } = await db()
          .from("tournaments")
          .select("title,description")
          .eq("slug", s[1])
          .not("status", "in", "(draft,archived)")
          .single();
        if (data)
          return {
            title: data.title,
            description: data.description.slice(0, 160),
          };
      } catch {}
    }
  }
  return {
    title,
    robots: ["dashboard", "admin", "reset-password", "auth"].includes(s[0])
      ? { index: false, follow: false }
      : undefined,
  };
}
export default async function Page({ params }: Props) {
  const s = (await params).slug || [];
  if (s.length === 0) return <Home />;
  if (s.length === 1) {
    switch (s[0]) {
      case "tournaments":
        return <Tournaments />;
      case "dashboard":
        return <Dashboard />;
      case "admin":
        return <Admin />;
      case "community":
        return <Community />;
      case "leaderboard":
        return <Leaderboard />;
      case "about":
        return <About />;
      case "help":
        return <Help />;
      case "reset-password":
        return <ResetPassword />;
    }
  }
  if (
    s.length === 2 &&
    s[0] === "auth" &&
    ["complete", "confirmed"].includes(s[1])
  )
    return <AuthComplete confirmed={s[1] === "confirmed"} />;
  if (s.length === 2 && s[0] === "tournaments") {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      const { db, checked } = await import("@/lib/server");
      const found = checked(
        await db()
          .from("tournaments")
          .select("id")
          .eq("slug", s[1])
          .not("status", "in", "(draft,archived)")
          .maybeSingle(),
      );
      if (!found) notFound();
    }
    return <TournamentDetail slug={s[1]} />;
  }
  if (
    s.length === 2 &&
    s[0] === "legal" &&
    ["terms", "privacy", "refunds", "fair-play"].includes(s[1])
  )
    return <Legal slug={s[1]} />;
  notFound();
}
