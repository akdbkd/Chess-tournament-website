import { createClient } from "@supabase/supabase-js";
import {
  assertLocalSeedTarget,
  localAccounts,
  localFixtures,
} from "./local-seed-data";
async function main() {
  const url = assertLocalSeedTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error(
      "Set the LOCAL Supabase service_role key in .env.local. Get it with supabase status.",
    );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checked = <
    T extends { data: unknown; error: { message: string } | null },
  >(
    result: T,
  ): T["data"] => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  // These are intentional fixture settings. Never run against a remote project.
  checked(
    await client
      .from("site_settings")
      .update({
        login_enabled: true,
        signup_enabled: true,
        email_login_enabled: true,
        community_enabled: true,
        registrations_enabled: true,
        support_email: "support@knightfall.test",
        operator_name: "Local Test Operator",
        jurisdiction: "Local development only",
        announcement:
          "LOCAL TEST DATA — synthetic players and payment references.",
      })
      .eq("id", true),
  );
  const existing = [];
  for (let page = 1; ; page++) {
    const result = checked(
      await client.auth.admin.listUsers({ page, perPage: 1000 }),
    );
    existing.push(...result.users);
    if (result.users.length < 1000) break;
  }
  const ids: Record<string, string> = {};
  for (const account of localAccounts) {
    let user = existing.find((u) => u.email === account.email);
    if (user && !user.user_metadata.local_seed)
      throw new Error(
        `Refusing to change an existing non-fixture account: ${account.email}`,
      );
    if (!user) {
      const result = checked(
        await client.auth.admin.createUser({
          email: account.email,
          password: "LocalChess!2026",
          email_confirm: true,
          user_metadata: { display_name: account.name, local_seed: true },
        }),
      );
      user = result.user!;
    }
    checked(
      await client
        .from("profiles")
        .update({
          display_name: account.name,
          role: account.role,
          status: account.email.startsWith("suspended")
            ? "suspended"
            : "active",
          suspension_reason: account.email.startsWith("suspended")
            ? "Local suspension test fixture"
            : "",
        })
        .eq("id", user.id),
    );
    ids[account.email.split("@")[0]] = user.id;
  }
  const fixtures = localFixtures({
    admin: ids.admin,
    organizer: ids.organizer,
    player: ids.player,
  });
  for (const [table, rows] of Object.entries(fixtures))
    checked(await client.from(table).upsert(rows as Record<string, unknown>[]));
  console.log(
    "Local seed complete. Re-running refreshes fixture records without duplicating accounts.",
  );
  console.table(
    localAccounts.map((a) => ({
      email: a.email,
      role: a.role,
      status: a.email.startsWith("suspended") ? "suspended" : "active",
    })),
  );
  console.log(
    "Fixture password: LocalChess!2026 (new accounts only). Admin MFA must still be enrolled normally.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
