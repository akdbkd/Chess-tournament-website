import { createClient, type Session } from "@supabase/supabase-js";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, checked, rate, HttpError } from "./server";
import { readBody, parseJson } from "./http";
import {
  type AuthSettings,
  type LoginMethod,
  methodFlags,
  authSettingsSchema,
} from "./settings";
const flowCookie = "__Host-knightfall-oauth";
const handoffCookie = "__Host-knightfall-signin";
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};
const oauthProvider = z.enum(["google", "azure", "discord"]);
function key(purpose: string) {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(503, "Secure sign-in is not configured yet.");
  return createHash("sha256")
    .update(purpose + ":" + secret)
    .digest();
}
export function sealAuth(value: unknown, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function openAuth(value: string, purpose: string): unknown {
  try {
    if (value.length > 20000) throw 0;
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(purpose),
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  } catch {
    throw new HttpError(
      400,
      "This sign-in link expired or is invalid. Please try again.",
    );
  }
}
function origin() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new HttpError(503, "The sign-in domain is not configured.");
  return new URL(value).origin;
}
function client(storage?: Map<string, string>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    throw new HttpError(503, "Live sign-in is not configured yet.");
  return createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: !!storage,
      flowType: storage ? "pkce" : "implicit",
      storageKey: "knightfall-oauth",
      ...(storage
        ? {
            storage: {
              getItem: (k: string) => storage.get(k) ?? null,
              setItem: (k: string, v: string) => {
                storage.set(k, v);
              },
              removeItem: (k: string) => {
                storage.delete(k);
              },
            },
          }
        : {}),
    },
  });
}
export async function authSettings(): Promise<AuthSettings> {
  return authSettingsSchema.parse(
    checked(await db().from("site_settings").select("*").single()),
  );
}
export function ensureLogin(
  settings: AuthSettings,
  provider: LoginMethod,
  signup = false,
) {
  if (!settings.login_enabled)
    throw new HttpError(
      403,
      "New sign-ins are temporarily paused.",
      "LOGIN_PAUSED",
    );
  if (!settings[methodFlags[provider]])
    throw new HttpError(
      403,
      "This sign-in method is disabled.",
      "LOGIN_METHOD_DISABLED",
    );
  if (signup && !settings.signup_enabled)
    throw new HttpError(
      403,
      "New accounts are temporarily paused.",
      "SIGNUP_PAUSED",
    );
}
async function configuredProviders() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    throw new HttpError(503, "Live sign-in is not configured yet.");
  const response = await fetch(url + "/auth/v1/settings", {
    headers: { apikey: anon },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new HttpError(503, "Sign-in options are temporarily unavailable.");
  const data = await response.json();
  return {
    email: data.external?.email === true,
    google: data.external?.google === true,
    azure: data.external?.azure === true,
    discord: data.external?.discord === true,
  };
}
async function authorize(session: Session, provider: LoginMethod) {
  // The session is returned by GoTrue's credential/PKCE exchange, never accepted
  // from the browser. Record the trusted method against its immutable session ID.
  const claims = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
  );
  const sessionId = z.string().uuid().parse(claims.session_id);
  if (claims.sub !== session.user.id)
    throw new HttpError(401, "Invalid sign-in session.");
  checked(
    await db().rpc("authorize_login_session", {
      p_session: sessionId,
      p_user: session.user.id,
      p_provider: provider,
    }),
  );
}
async function verifyProvider(
  session: Session,
  provider: "google" | "azure" | "discord",
) {
  // A caller can edit Supabase's authorize URL. Verify the returned provider
  // token against that provider so changing its name cannot bypass a switch,
  // including accounts with multiple linked identities.
  const endpoints = {
    google: "https://openidconnect.googleapis.com/v1/userinfo",
    azure: "https://graph.microsoft.com/oidc/userinfo",
    discord: "https://discord.com/api/users/@me",
  };
  if (!session.provider_token)
    throw new HttpError(401, "The sign-in provider could not be verified.");
  const response = await fetch(endpoints[provider], {
    headers: { Authorization: "Bearer " + session.provider_token },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new HttpError(401, "The sign-in provider could not be verified.");
  const identity = await response.json();
  if (!(provider === "discord" ? identity.id : identity.sub))
    throw new HttpError(401, "The sign-in provider could not be verified.");
}
const flowSchema = z.object({
  provider: oauthProvider,
  storage: z.record(z.string(), z.string()),
  flowId: z.string().nullable().optional(),
  expires: z.number(),
  issued: z.number(),
});
export async function handleAuth(req: NextRequest, action: string) {
  try {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true")
      throw new HttpError(503, "Live sign-in is disabled in the demo.");
    if (action === "callback" && req.method === "GET")
      return await callback(req);
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown")
      .trim()
      .slice(0, 64);
    await rate(
      "auth:" +
        req.method +
        ":" +
        createHash("sha256").update(ip).digest("hex"),
      req.method === "GET" ? 60 : 12,
    );
    if (action === "options" && req.method === "GET")
      return NextResponse.json(
        {
          settings: await authSettings(),
          configured: await configuredProviders(),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    const requestOrigin = req.headers.get("origin");
    if (requestOrigin && requestOrigin !== origin())
      throw new HttpError(403, "Request origin not allowed.");
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new HttpError(415, "Use application/json for sign-in requests.");
    const body = parseJson(await readBody(req, 16384));
    if (action === "complete") {
      const token = req.cookies.get(handoffCookie)?.value;
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new HttpError(
          400,
          "Your sign-in link expired. Please sign in again.",
        );
      const payload = checked(
        await db().rpc("consume_auth_handoff", {
          p_hash: createHash("sha256").update(token).digest("hex"),
        }),
      );
      if (!payload)
        throw new HttpError(
          400,
          "This sign-in link was already used or expired. Please sign in again.",
        );
      const result = z
        .object({
          access_token: z.string(),
          refresh_token: z.string(),
          expires: z.number(),
        })
        .parse(openAuth(payload, "handoff"));
      if (result.expires < Date.now())
        throw new HttpError(
          400,
          "Your sign-in link expired. Please sign in again.",
        );
      const response = NextResponse.json({
        session: {
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        },
      });
      response.cookies.set(handoffCookie, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }
    const settings = await authSettings();
    if (action === "oauth") {
      const provider = oauthProvider.parse(body.provider);
      ensureLogin(settings, provider);
      if (!(await configuredProviders())[provider])
        throw new HttpError(
          503,
          "This sign-in provider has not been configured yet.",
        );
      // Check the encryption key before starting a provider flow.
      key("flow");
      const storage = new Map<string, string>(),
        auth = client(storage);
      const result = await auth.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: origin() + "/api/auth/callback",
          skipBrowserRedirect: true,
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      });
      if (result.error || !result.data.url)
        throw new HttpError(
          503,
          "Unable to start provider sign-in. Please try again.",
        );
      const flow = sealAuth(
        {
          provider,
          storage: Object.fromEntries(storage),
          flowId: result.data.flowId || null,
          expires: Date.now() + 600000,
          issued: Date.now(),
        },
        "flow",
      );
      if (flow.length > 3800)
        throw new HttpError(503, "Unable to create a secure sign-in flow.");
      const response = NextResponse.json({ url: result.data.url });
      response.cookies.set(flowCookie, flow, { ...cookieOptions, maxAge: 600 });
      return response;
    }
    if (action === "email") {
      const v = z
        .object({
          intent: z.enum(["login", "signup", "forgot"]),
          email: z.string().trim().email().max(254),
          password: z.string().max(128).optional(),
          name: z.string().trim().min(2).max(80).optional(),
        })
        .parse(body);
      ensureLogin(settings, "email", v.intent === "signup");
      const auth = client();
      if (v.intent === "forgot") {
        const result = await auth.auth.resetPasswordForEmail(v.email, {
          redirectTo: origin() + "/reset-password",
        });
        if (result.error)
          throw new HttpError(
            503,
            "Unable to send a reset link. Try again shortly.",
          );
        return NextResponse.json({
          message:
            "If an account exists, a password reset link will be sent to your email.",
        });
      }
      const password = z
        .string()
        .min(v.intent === "signup" ? 12 : 1)
        .max(128)
        .parse(v.password);
      const result =
        v.intent === "signup"
          ? await auth.auth.signUp({
              email: v.email,
              password,
              options: {
                data: { display_name: v.name || "Player" },
                emailRedirectTo: origin() + "/auth/confirmed",
              },
            })
          : await auth.auth.signInWithPassword({ email: v.email, password });
      if (result.error)
        throw new HttpError(
          v.intent === "login" ? 401 : 400,
          v.intent === "login"
            ? "Unable to sign in. Check your email, password and email confirmation."
            : "Unable to create an account. Check your details or contact support.",
        );
      if (result.data.session) {
        await authorize(result.data.session, "email");
        return NextResponse.json({
          session: {
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token,
          },
        });
      }
      return NextResponse.json({
        message: "Check your email to confirm your account, then sign in.",
      });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    return NextResponse.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues[0]?.message
              : "Sign-in is temporarily unavailable. Please try again.",
        code: error instanceof HttpError ? error.code : undefined,
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
async function callback(req: NextRequest) {
  let response: NextResponse;
  try {
    if (req.nextUrl.searchParams.has("error"))
      throw new HttpError(400, "Sign-in was cancelled.");
    const raw = req.cookies.get(flowCookie)?.value;
    if (!raw) throw new HttpError(400, "Missing sign-in flow.");
    const flow = flowSchema.parse(openAuth(raw, "flow"));
    if (flow.expires < Date.now())
      throw new HttpError(400, "Expired sign-in flow.");
    ensureLogin(await authSettings(), flow.provider);
    const code = z
      .string()
      .min(1)
      .max(2048)
      .parse(req.nextUrl.searchParams.get("code"));
    const auth = client(new Map(Object.entries(flow.storage)));
    const result = await auth.auth.exchangeCodeForSession(
      code,
      flow.flowId ? { flowId: flow.flowId } : undefined,
    );
    if (result.error || !result.data.session)
      throw new HttpError(400, "Unable to verify sign-in.");
    await verifyProvider(result.data.session, flow.provider);
    await authorize(result.data.session, flow.provider);
    const token = randomBytes(32).toString("hex"),
      expires = Date.now() + 90000;
    checked(
      await db()
        .from("auth_handoffs")
        .insert({
          token_hash: createHash("sha256").update(token).digest("hex"),
          payload: sealAuth(
            {
              access_token: result.data.session.access_token,
              refresh_token: result.data.session.refresh_token,
              expires,
            },
            "handoff",
          ),
          expires_at: new Date(expires).toISOString(),
        }),
    );
    response = NextResponse.redirect(origin() + "/auth/complete");
    response.cookies.set(handoffCookie, token, {
      ...cookieOptions,
      maxAge: 90,
    });
  } catch {
    response = NextResponse.redirect(
      origin() + "/auth/complete?error=signin_failed",
    );
    response.cookies.set(handoffCookie, "", { ...cookieOptions, maxAge: 0 });
  }
  response.cookies.set(flowCookie, "", { ...cookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
