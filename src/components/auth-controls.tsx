"use client";
import { useEffect, useState } from "react";
import { useApp } from "./provider";
import { api } from "@/lib/supabase";
import {
  authSettingsSchema,
  defaultAuthSettings,
  type AuthSettings,
} from "@/lib/settings";
export function AuthControls() {
  const app = useApp(),
    [values, setValues] = useState<AuthSettings>(
      app.settings || defaultAuthSettings,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (app.settings) setValues(authSettingsSchema.parse(app.settings));
  }, [app.settings]);
  const controls: [keyof AuthSettings, string, string][] = [
    [
      "login_enabled",
      "Allow new sign-ins",
      "Pause or resume all new sign-ins. Current signed-in sessions remain active.",
    ],
    [
      "signup_enabled",
      "Allow new accounts",
      "Existing users can still sign in when new account registration is disabled.",
    ],
    [
      "email_login_enabled",
      "Email and password",
      "Allow email sign-in, account creation and password recovery.",
    ],
    [
      "google_login_enabled",
      "Google",
      "Enable Google sign-in after configuring your Google provider.",
    ],
    [
      "microsoft_login_enabled",
      "Microsoft",
      "Enable Microsoft personal or work accounts using your Microsoft provider configuration.",
    ],
    [
      "discord_login_enabled",
      "Discord",
      "Enable Discord sign-in after configuring your Discord provider.",
    ],
  ];
  return (
    <section className="panel">
      <h2>Sign-in & accounts</h2>
      <p className="muted">
        Choose how people access Knightfall. Provider credentials stay in your
        identity service. These switches are enforced on the server for new
        sign-ins.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (
              values.login_enabled &&
              !values.email_login_enabled &&
              !values.google_login_enabled &&
              !values.microsoft_login_enabled &&
              !values.discord_login_enabled
            )
              throw new Error(
                "Enable at least one sign-in method, or pause all new sign-ins.",
              );
            if (!app.demo)
              await api("admin/auth-settings", {
                method: "POST",
                body: JSON.stringify(values),
              });
            if (app.settings)
              app.update({ settings: { ...app.settings, ...values } });
            if (!app.demo) await app.refresh();
            app.notify(
              app.demo
                ? "Demo sign-in settings saved in this browser."
                : "Sign-in settings saved.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {controls.map(([name, label, description]) => (
          <label className="checkbox-label auth-setting" key={name}>
            <input
              name={name}
              type="checkbox"
              checked={values[name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [name]: e.target.checked }))
              }
            />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save sign-in settings"}
        </button>
      </form>
    </section>
  );
}
