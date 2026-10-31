"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, UserRound, ShieldCheck } from "lucide-react";
import { Modal, Knight } from "./ui";
import { useApp } from "./provider";
import { api, supabase } from "@/lib/supabase";
import {
  defaultAuthSettings,
  type AuthSettings,
  type LoginMethod,
  methodFlags,
} from "@/lib/settings";
export function AuthModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [options, setOptions] = useState<{
      settings: AuthSettings;
      configured: Record<LoginMethod, boolean>;
    } | null>(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (app.demo) return;
    const controller = new AbortController();
    void api("auth/options", { signal: controller.signal })
      .then(setOptions)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [app.demo, reload]);
  const settings = app.demo
    ? app.settings || defaultAuthSettings
    : options?.settings;
  const configured = app.demo
    ? { email: true, google: true, azure: true, discord: true }
    : options?.configured;
  const enabled = (method: LoginMethod) =>
    !!settings?.login_enabled &&
    !!settings[methodFlags[method]] &&
    !!configured?.[method];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (app.demo)
        throw new Error(
          "Choose a demo session below. Preview accounts do not contact sign-in providers.",
        );
      if (!supabase) throw new Error("Live accounts are not configured yet.");
      const data = new FormData(e.currentTarget);
      const result = await api("auth/email", {
        method: "POST",
        body: JSON.stringify({
          intent: mode,
          email: String(data.get("email")),
          ...(mode !== "forgot"
            ? { password: String(data.get("password")) }
            : {}),
          ...(mode === "signup" ? { name: String(data.get("name")) } : {}),
        }),
      });
      if (result.session) {
        const signed = await supabase.auth.setSession(result.session);
        if (signed.error) throw signed.error;
        await app.refresh();
        onClose();
        app.notify("Welcome to the arena.");
      } else setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function social(provider: "google" | "azure" | "discord") {
    if (app.demo) {
      setError(
        "Provider sign-in is available on the live site. Choose a demo session below to explore.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("auth/oauth", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "login"
          ? "Welcome to the arena"
          : mode === "signup"
            ? "Make your next move"
            : "Reset your password"
      }
      onClose={onClose}
    >
      <div className="auth-emblem">
        <Knight />
      </div>
      <p className="muted">
        {mode === "forgot"
          ? "We’ll send you a secure password reset link."
          : "Discover tournaments. Register players. Find your community."}
      </p>
      {!settings && !error && <p role="status">Loading sign-in options…</p>}
      {settings && !settings.login_enabled && (
        <p className="info-panel">
          New sign-ins are temporarily paused. Please check back later.
        </p>
      )}
      {settings?.login_enabled && mode !== "forgot" && (
        <div className="social-signin">
          {(
            [
              { id: "google", label: "Google", mark: "G" },
              { id: "azure", label: "Microsoft", mark: "M" },
              { id: "discord", label: "Discord", mark: "D" },
            ] as const
          )
            .filter((p) => enabled(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="button secondary full"
                disabled={busy}
                onClick={() => social(p.id)}
              >
                <span className={"provider-mark " + p.id} aria-hidden="true">
                  {p.mark}
                </span>
                Continue with {p.label}
              </button>
            ))}
        </div>
      )}
      {enabled("email") && (
        <>
          <form className="stack-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="What should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "signup" ? 12 : undefined}
                  maxLength={128}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? "At least 12 characters"
                      : "Your password"
                  }
                />
              </label>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-button align-right"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            )}
            <button
              className="button full"
              disabled={
                busy || (mode === "signup" && !settings?.signup_enabled)
              }
            >
              {busy && <Loader2 className="spin" size={18} />}{" "}
              {mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login"
              ? settings?.signup_enabled
                ? "New to Knightfall?"
                : "New accounts are temporarily paused."
              : "Already have an account?"}{" "}
            {(mode !== "login" || settings?.signup_enabled) && (
              <button
                className="text-button"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setMessage("");
                }}
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            )}
          </p>
        </>
      )}
      {settings?.login_enabled &&
        configured &&
        !["email", "google", "azure", "discord"].some((p) =>
          enabled(p as LoginMethod),
        ) && (
          <p>
            No sign-in methods are available right now. Contact platform
            support.
          </p>
        )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!settings && error && (
        <button
          className="text-button"
          onClick={() => {
            setError("");
            setReload((n) => n + 1);
          }}
        >
          Retry sign-in options
        </button>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}
      {app.demo && settings?.login_enabled && (
        <div className="demo-login">
          <span>EXPLORE WITH SAMPLE DATA</span>
          {(["USER", "ADMIN"] as const).map((role) => (
            <button
              key={role}
              className="button secondary full"
              onClick={() => {
                app.setProfile({
                  id: "demo-user",
                  display_name: "Alex Morgan",
                  role,
                  email: "demo@example.com",
                });
                onClose();
                app.notify(
                  "Demo session started. Everything stays in this browser.",
                );
              }}
            >
              {role === "ADMIN" ? (
                <ShieldCheck size={17} />
              ) : (
                <UserRound size={17} />
              )}{" "}
              {role === "ADMIN"
                ? "Explore as a demo admin"
                : "Explore as a demo player"}
            </button>
          ))}
          <small>No account or password needed. Sample data only.</small>
        </div>
      )}
    </Modal>
  );
}
