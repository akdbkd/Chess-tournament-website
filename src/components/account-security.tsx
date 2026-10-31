"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "./provider";

type Factor = { id: string; friendly_name?: string; status: string };
export function AccountSecurity({ onVerified }: { onVerified?: () => void }) {
  const app = useApp();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<{
    id: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [level, setLevel] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!supabase || app.demo) return;
    const [list, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (list.error || assurance.error) throw list.error || assurance.error;
    setFactors(list.data!.totp.filter((f) => f.status === "verified"));
    setLevel(assurance.data!.currentLevel || "aal1");
  }, [app.demo]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      const existing = await supabase!.auth.mfa.listFactors();
      if (existing.error) throw existing.error;
      for (const pending of existing.data.totp.filter(
        (f) => f.status !== "verified",
      )) {
        const removed = await supabase!.auth.mfa.unenroll({
          factorId: pending.id,
        });
        if (removed.error) throw removed.error;
      }
      const result = await supabase!.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Knightfall " + new Date().toISOString(),
      });
      if (result.error) throw result.error;
      setEnrollment({
        id: result.data.id,
        qr: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await supabase!.auth.mfa.challengeAndVerify({
        factorId: enrollment?.id || factors[0].id,
        code,
      });
      if (result.error) throw result.error;
      setEnrollment(null);
      setCode("");
      await refresh();
      await app.refresh();
      app.notify("Authenticator verified.");
      onVerified?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel security-panel">
      <h2>
        <ShieldCheck size={22} /> Account security
      </h2>
      <p>
        Use an authenticator app to protect your account. Organizers and
        administrators must verify it each time they sign in.
      </p>
      {app.demo ? (
        <p className="muted">
          Authenticator setup is available for live accounts.
        </p>
      ) : (
        <>
          <p className="muted">
            {level === "aal2"
              ? "This session has two-factor verification."
              : factors.length
                ? "Enter your authenticator code to verify this session."
                : "Add Google Authenticator, 1Password, or another TOTP app."}
          </p>
          {enrollment && (
            <div className="mfa-enrollment">
              <img
                src={enrollment.qr}
                alt="Scan this QR code in your authenticator app"
                width={220}
                height={220}
              />
              <details>
                <summary>Enter the setup key manually</summary>
                <code className="mfa-secret">{enrollment.secret}</code>
              </details>
              <p>
                Save access to your authenticator securely. If you lose it,
                contact platform support for identity-verified recovery.
              </p>
            </div>
          )}
          {(enrollment || (factors.length > 0 && level !== "aal2")) && (
            <form className="stack-form" onSubmit={verify}>
              <label>
                Six-digit authenticator code
                <input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  minLength={6}
                  maxLength={6}
                />
              </label>
              <button className="button" disabled={busy}>
                {busy ? "Verifying…" : "Verify authenticator"}
              </button>
            </form>
          )}
          {!factors.length && !enrollment && (
            <button
              className="button secondary"
              disabled={busy || !supabase}
              onClick={enroll}
            >
              Set up authenticator
            </button>
          )}
          {enrollment && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                const result = await supabase!.auth.mfa.unenroll({
                  factorId: enrollment.id,
                });
                if (result.error) setError(result.error.message);
                else setEnrollment(null);
              }}
            >
              Cancel setup
            </button>
          )}
          {level === "aal2" &&
            factors.map((f) => (
              <div className="readiness-row" key={f.id}>
                <span>{f.friendly_name || "Authenticator"}</span>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const result = await supabase!.auth.mfa.unenroll({
                      factorId: f.id,
                    });
                    if (result.error) setError(result.error.message);
                    else {
                      await refresh();
                      await app.refresh();
                    }
                    setBusy(false);
                  }}
                >
                  Remove authenticator
                </button>
              </div>
            ))}
          <button
            className="text-button"
            onClick={async () => {
              setBusy(true);
              const result = await supabase!.auth.signOut({ scope: "others" });
              app.notify(
                result.error?.message ||
                  "Other sessions signed out. Existing access tokens expire within the configured session lifetime.",
                !!result.error,
              );
              setBusy(false);
            }}
            disabled={busy}
          >
            Sign out other sessions
          </button>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
