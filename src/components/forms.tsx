"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { Modal, Badge, Knight } from "./ui";
import { useApp } from "./provider";
import { api, supabase } from "@/lib/supabase";
import { money, date, time } from "@/lib/data";
import { eligibility, usernameSchema } from "@/lib/validation";
import type { Tournament, ChessPlayer } from "@/lib/types";
export function AuthModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      if (app.demo)
        throw new Error(
          "This preview uses demo sessions. Choose “Explore as a demo player” below.",
        );
      if (!supabase)
        throw new Error(
          "Live accounts are not configured yet. You can explore the demo below.",
        );
      const email = String(f.get("email")),
        password = String(f.get("password"));
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setMessage(
          "If an account exists, a password reset link will be sent to your email.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: f.get("name") },
            emailRedirectTo: window.location.origin + "/dashboard",
          },
        });
        if (error) throw error;
        if (data.session) {
          await app.refresh();
          onClose();
        } else
          setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await app.refresh();
        onClose();
        app.notify("Welcome back to the arena.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
              placeholder="How should we call you?"
            />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            required
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
                mode === "signup" ? "At least 12 characters" : "Your password"
              }
            />
          </label>
        )}
        {mode === "login" && (
          <button
            className="text-button align-right"
            type="button"
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
          >
            Forgot password?
          </button>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {message && <div className="form-success">{message}</div>}
        <button className="button full" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : null}
          {mode === "login"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send reset link"}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        {mode === "login" ? "New to Knightfall?" : "Already have an account?"}{" "}
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
      </p>
      {app.demo && (
        <div className="demo-login">
          <span>JUST LOOKING AROUND?</span>
          <button
            className="button secondary full"
            onClick={() => {
              app.setProfile({
                id: "demo-user",
                display_name: "Alex Morgan",
                role: "USER",
                email: "demo@example.com",
              });
              onClose();
              app.notify(
                "Demo player session started. Everything stays in this browser.",
              );
            }}
          >
            <UserRound size={17} />
            Explore as a demo player
          </button>
          <small>No account or password needed. Sample data only.</small>
        </div>
      )}
    </Modal>
  );
}

type PaymentResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type CheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (r: PaymentResult) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
  prefill?: { email?: string };
};
declare global {
  interface Window {
    Razorpay: new (options: CheckoutOptions) => {
      open: () => void;
      on: (event: string, fn: () => void) => void;
    };
  }
}
async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          "Could not load the payment window. Please retry from your dashboard.",
        ),
      );
    document.head.appendChild(script);
  });
}
export async function openPayment(
  result: {
    key: string;
    order: { id: string; amount: number; currency: string };
  },
  onComplete: () => void,
  onError: (message: string) => void,
  email?: string,
) {
  await loadCheckout();
  const checkout = new window.Razorpay({
    key: result.key,
    amount: result.order.amount,
    currency: result.order.currency,
    name: "Knightfall Arena",
    description: "Tournament registration",
    order_id: result.order.id,
    prefill: { email },
    theme: { color: "#f16c37" },
    handler: async (response) => {
      try {
        const data = await api("payments/verify", {
          method: "POST",
          body: JSON.stringify(response),
        });
        if (data.registration.payment_status === "refund_requested")
          onError(
            "Payment arrived after the reservation expired. A refund is required; check your dashboard.",
          );
        else onComplete();
      } catch (e) {
        onError((e as Error).message);
      }
    },
    modal: {
      ondismiss: () =>
        onError(
          "Checkout closed. Your unpaid entry is held for 15 minutes; resume from your dashboard.",
        ),
    },
  });
  checkout.on("payment.failed", () =>
    onError("Payment failed. Please retry from your dashboard."),
  );
  checkout.open();
}
export function RegistrationModal({
  t,
  onClose,
}: {
  t: Tournament;
  onClose: () => void;
}) {
  const app = useApp(),
    router = useRouter();
  const [username, setUsername] = useState(""),
    [player, setPlayer] = useState<ChessPlayer | null>(null),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false);
  const reasons = player ? eligibility(t, player) : [];
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPlayer(null);
    try {
      usernameSchema.parse(username);
      setPlayer(
        await api(
          "chess/player?username=" +
            encodeURIComponent(username) +
            "&category=" +
            t.category,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Player lookup failed.");
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    if (!player || !accepted || reasons.length) return;
    setBusy(true);
    setError("");
    try {
      if (app.demo) {
        if (
          app.registrations.some(
            (r) =>
              r.tournament_id === t.id &&
              r.username.toLowerCase() === player.username.toLowerCase() &&
              !["withdrawn", "rejected"].includes(r.status),
          )
        )
          throw new Error(
            "This player is already registered for this tournament.",
          );
        if (t.participants >= t.capacity)
          throw new Error("This tournament is full.");
        const registration = {
          id: crypto.randomUUID(),
          tournament_id: t.id,
          registered_by: app.profile!.id,
          username: player.username,
          rating: player.rating,
          status: t.auto_approve ? "approved" : "pending",
          payment_status: t.fee_paise ? "paid" : "free",
          created_at: new Date().toISOString(),
        };
        app.update({
          registrations: [registration, ...app.registrations],
          tournaments: app.tournaments.map((x) =>
            x.id === t.id ? { ...x, participants: x.participants + 1 } : x,
          ),
          notices: [
            {
              id: crypto.randomUUID(),
              title: "Demo registration received",
              body: player.username + " • " + t.title,
              read: false,
              created_at: new Date().toISOString(),
            },
            ...app.notices,
          ],
        });
        setComplete(true);
      } else {
        const result = await api("registration", {
          method: "POST",
          body: JSON.stringify({
            tournament_id: t.id,
            username: player.username,
            accepted_rules: true,
          }),
        });
        await app.refresh();
        if (result.order)
          await openPayment(
            result,
            () => {
              setComplete(true);
              void app.refresh();
            },
            (m) => {
              setError(m);
              void app.refresh();
            },
            app.profile?.email,
          );
        else setComplete(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={complete ? "You’re on the list." : "Enter the arena"}
      onClose={onClose}
    >
      {complete ? (
        <div className="registration-success">
          <CheckCircle2 size={58} />
          <h3>
            {app.demo
              ? "Demo registration complete"
              : t.auto_approve
                ? "Registration confirmed"
                : "Registration submitted"}
          </h3>
          <p>
            <strong>{player?.username}</strong> is{" "}
            {t.auto_approve ? "registered" : "awaiting organizer approval"} for{" "}
            {t.title}.
          </p>
          <div className="info-panel">
            {date(t.starts_at)} · {time(t.starts_at)}
            <br />
            Check in 30 minutes before the event, then join the Chess.com lobby
            from your dashboard.
          </div>
          {app.demo && (
            <p className="muted">
              This is a sample entry. No payment was taken.
            </p>
          )}
          <button
            className="button full"
            onClick={() => {
              onClose();
              router.push("/dashboard");
            }}
          >
            View my registrations
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="registration-event">
            <span className={"event-mini " + t.color}>
              <Knight />
            </span>
            <div>
              <h3>{t.title}</h3>
              <p>
                {date(t.starts_at, true)} · {t.time_control} {t.category} ·{" "}
                {t.format}
              </p>
            </div>
          </div>
          <div className="form-step">
            <span>01</span>
            <h3>Choose your Chess.com player</h3>
          </div>
          <p className="muted small-text">
            You may register any eligible player. This does not link their
            Chess.com account to your website account.
          </p>
          <form className="lookup-form" onSubmit={lookup}>
            <label className="sr-only" htmlFor="chess-username">
              Chess.com username
            </label>
            <input
              id="chess-username"
              placeholder="Enter Chess.com username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPlayer(null);
              }}
              required
              minLength={3}
              maxLength={25}
            />
            <button className="button secondary" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Search size={17} />
              )}
              Verify
            </button>
          </form>
          {app.demo && (
            <button
              className="text-button sample-player"
              onClick={() => {
                setUsername("sample_knight");
                setError("");
                setPlayer({
                  username: "sample_knight",
                  rating: 1420,
                  joined: 1609459200,
                  url: "https://www.chess.com",
                });
              }}
            >
              Use a sample player for the demo
            </button>
          )}
          {player && (
            <div
              className={
                "player-preview " + (reasons.length ? "ineligible" : "")
              }
            >
              <div className="avatar">
                <UserRound />
              </div>
              <div>
                <strong>{player.username}</strong>
                <p>
                  {player.rating ?? "Unrated"} {t.category}{" "}
                  {player.country ? "· " + player.country : ""}
                </p>
              </div>
              <Badge color={reasons.length ? "red" : "green"}>
                {reasons.length ? (
                  "Not eligible"
                ) : (
                  <>
                    <Check size={12} />
                    Eligible
                  </>
                )}
              </Badge>
            </div>
          )}
          {reasons.map((r) => (
            <div className="form-error" key={r}>
              {r}
            </div>
          ))}
          <div className="form-step">
            <span>02</span>
            <h3>Review your entry</h3>
          </div>
          <div className="price-summary">
            <div>
              <span>Entry fee</span>
              <strong>{t.fee_paise ? money(t.fee_paise) : "Free"}</strong>
            </div>
            <div>
              <span>Platform fee</span>
              <span>₹0</span>
            </div>
            <div className="total">
              <span>Total payable</span>
              <strong>{money(t.fee_paise)}</strong>
            </div>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I have the player’s permission to enter and accept the{" "}
              <Link href="/legal/terms" target="_blank">
                tournament rules
              </Link>{" "}
              and{" "}
              <Link href="/legal/refunds" target="_blank">
                refund policy
              </Link>
              .
            </span>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button full"
            disabled={!player || !accepted || reasons.length > 0 || busy}
            onClick={register}
          >
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Wallet size={18} />
            )}{" "}
            {app.demo
              ? "Complete demo registration"
              : t.fee_paise
                ? "Pay " + money(t.fee_paise) + " & register"
                : "Confirm free registration"}
            <ArrowRight size={17} />
          </button>
          <div className="secure-note">
            <LockKeyhole size={13} />
            {app.demo
              ? "Demo only. No actual payment or entry."
              : "Secure payment via Razorpay. Entries confirmed after verification."}
          </div>
        </>
      )}
    </Modal>
  );
}
export function ResetPassword() {
  const app = useApp(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!supabase)
        throw new Error("Connect Supabase to enable password resets.");
      const password = String(new FormData(e.currentTarget).get("password"));
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      app.notify("Password updated.");
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page panel">
      <ShieldCheck size={32} />
      <h1>Set a new password</h1>
      <p className="muted">
        Open the reset link in your email before submitting this form.
      </p>
      <form className="stack-form" onSubmit={submit}>
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="button" disabled={busy}>
          Update password
        </button>
      </form>
    </div>
  );
}
