"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useApp } from "./provider";
export type SiteSettings = {
  support_email: string;
  community_enabled: boolean;
  registrations_enabled: boolean;
  announcement: string;
  operator_name: string;
  jurisdiction: string;
  retention_days: number;
};
export const defaultSettings: SiteSettings = {
  support_email: "",
  community_enabled: true,
  registrations_enabled: true,
  announcement: "",
  operator_name: "",
  jurisdiction: "",
  retention_days: 365,
};
export function PlatformSettings() {
  const app = useApp();
  const [settings, setSettings] = useState<SiteSettings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (app.demo) {
      setSettings(defaultSettings);
      return;
    }
    void api("settings/public")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, [app.demo]);
  return (
    <section className="panel">
      <h2>Platform settings</h2>
      <p className="muted">
        Registration and community switches pause new activity. Existing
        entries, withdrawals, payments and refund processing stay available.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {settings && (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            const values: SiteSettings = {
              support_email: String(data.get("support_email")),
              operator_name: String(data.get("operator_name")),
              jurisdiction: String(data.get("jurisdiction")),
              announcement: String(data.get("announcement")),
              retention_days: Number(data.get("retention_days")),
              community_enabled: data.get("community_enabled") === "on",
              registrations_enabled: data.get("registrations_enabled") === "on",
            };
            try {
              if (!app.demo)
                await api("admin/settings", {
                  method: "POST",
                  body: JSON.stringify(values),
                });
              setSettings(values);
              await app.refresh();
              app.notify(
                app.demo
                  ? "Demo settings reviewed. Live settings require Supabase."
                  : "Settings saved.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Legal operator name
            <input
              name="operator_name"
              defaultValue={settings.operator_name}
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label>
            Support email
            <input
              name="support_email"
              type="email"
              defaultValue={settings.support_email}
              required
              maxLength={254}
            />
          </label>
          <label>
            Jurisdiction / contact address
            <input
              name="jurisdiction"
              defaultValue={settings.jurisdiction}
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label>
            Retention review period (days)
            <input
              name="retention_days"
              type="number"
              min={30}
              max={3650}
              defaultValue={settings.retention_days}
              required
            />
          </label>
          <p className="muted small-text">
            Records are reviewed under your retention policy. This value does
            not automatically erase payment, audit, or dispute records.
          </p>
          <label>
            Public announcement
            <textarea
              name="announcement"
              defaultValue={settings.announcement}
              maxLength={500}
            />
          </label>
          <label className="checkbox-label">
            <input
              name="community_enabled"
              type="checkbox"
              defaultChecked={settings.community_enabled}
            />
            <span>Allow community posts and replies</span>
          </label>
          <label className="checkbox-label">
            <input
              name="registrations_enabled"
              type="checkbox"
              defaultChecked={settings.registrations_enabled}
            />
            <span>Accept new registrations</span>
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </section>
  );
}
