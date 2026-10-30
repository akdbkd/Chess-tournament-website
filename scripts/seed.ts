import { createClient } from "@supabase/supabase-js";
import { tournaments, posts } from "../src/lib/data";
async function main() {
  // Run only against an intentional demo/staging Supabase project.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Set Supabase URL and service role key in .env.local.");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const organizerId = process.env.SEED_ORGANIZER_ID;
  if (!organizerId)
    throw new Error(
      "Set SEED_ORGANIZER_ID to an existing ORGANIZER or ADMIN profile UUID. No default passwords are created.",
    );
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", organizerId)
    .single();
  if (
    profileError ||
    !profile ||
    !["ORGANIZER", "ADMIN"].includes(profile.role)
  )
    throw new Error("The seed profile must have organizer/admin access.");
  // Production-facing seed events start as drafts with zero claimed entries.
  const rows = tournaments.map((t) => ({
    ...t,
    status: "draft",
    participants: 0,
    organizer_id: organizerId,
    organizer_name: profile.display_name,
  }));
  const { error } = await client
    .from("tournaments")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const { data: existing } = await client.from("posts").select("id").limit(1);
  if (!existing?.length) {
    const { error } = await client.from("posts").insert(
      posts.map(({ id, author_id, author_name, likes, ...p }) => ({
        ...p,
        author_id: organizerId,
        author_name: profile.display_name,
        likes: 0,
      })),
    );
    if (error) throw error;
  }
  console.log(
    "Seeded 8 draft tournament templates and initial discussions. Review dates, prizes, descriptions, and lobby URLs before publishing.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
