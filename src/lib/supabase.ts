"use client";
import { createClient } from "@supabase/supabase-js";
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )
    : null;
export async function api(path: string, options: RequestInit = {}) {
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const res = await fetch("/api/" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
