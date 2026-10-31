"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, supabase } from "@/lib/supabase";
import { useApp } from "./provider";
export function AuthComplete({ confirmed = false }: { confirmed?: boolean }) {
  const app = useApp(),
    params = useSearchParams(),
    started = useRef(false);
  const [error, setError] = useState(
    params.has("error")
      ? "Sign-in was cancelled, disabled, or expired. Please try again."
      : "",
  );
  useEffect(() => {
    if (confirmed || started.current || params.has("error")) return;
    started.current = true;
    void (async () => {
      try {
        if (!supabase) throw new Error("Live sign-in is not configured yet.");
        const result = await api("auth/complete", {
          method: "POST",
          body: "{}",
        });
        const signed = await supabase.auth.setSession(result.session);
        if (signed.error) throw signed.error;
        await app.refresh();
        window.location.replace("/dashboard");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [app, confirmed, params]);
  return (
    <div className="page narrow-page">
      <div className="panel">
        <h1>
          {confirmed
            ? "Email confirmed"
            : error
              ? "Sign-in needs another try"
              : "Finishing sign-in…"}
        </h1>
        {confirmed ? (
          <p>Your email is confirmed. Sign in to continue to your account.</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Securely opening your playbook.</p>
        )}
        {(confirmed || error) && (
          <button className="button" onClick={() => app.setAuthOpen(true)}>
            Choose a sign-in method
          </button>
        )}
      </div>
    </div>
  );
}
