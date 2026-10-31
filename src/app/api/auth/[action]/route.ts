import type { NextRequest } from "next/server";
import { handleAuth } from "@/lib/auth-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
async function handle(req: NextRequest, context: Context) {
  return handleAuth(req, (await context.params).action);
}
export const GET = handle;
export const POST = handle;
