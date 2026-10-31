import { z } from "zod";
export const authSettingsSchema = z.object({
  login_enabled: z.boolean(),
  signup_enabled: z.boolean(),
  email_login_enabled: z.boolean(),
  google_login_enabled: z.boolean(),
  microsoft_login_enabled: z.boolean(),
  discord_login_enabled: z.boolean(),
});
export const siteSettingsSchema = z.object({
  support_email: z.string().email().max(254),
  community_enabled: z.boolean(),
  registrations_enabled: z.boolean(),
  announcement: z.string().trim().max(500),
  operator_name: z.string().trim().min(2).max(160),
  jurisdiction: z.string().trim().min(2).max(160),
  retention_days: z.number().int().min(30).max(3650),
});
export const loginControlsSchema = authSettingsSchema.refine(
  (v) =>
    !v.login_enabled ||
    v.email_login_enabled ||
    v.google_login_enabled ||
    v.microsoft_login_enabled ||
    v.discord_login_enabled,
  "Enable at least one sign-in method or pause all new sign-ins.",
);
export type AuthSettings = z.infer<typeof authSettingsSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema> & AuthSettings;
export const defaultAuthSettings: AuthSettings = {
  login_enabled: true,
  signup_enabled: true,
  email_login_enabled: true,
  google_login_enabled: false,
  microsoft_login_enabled: false,
  discord_login_enabled: false,
};
export const defaultSettings: SiteSettings = {
  support_email: "",
  community_enabled: true,
  registrations_enabled: true,
  announcement: "",
  operator_name: "",
  jurisdiction: "",
  retention_days: 365,
  ...defaultAuthSettings,
};
export type LoginMethod = "email" | "google" | "azure" | "discord";
export const methodFlags = {
  email: "email_login_enabled",
  google: "google_login_enabled",
  azure: "microsoft_login_enabled",
  discord: "discord_login_enabled",
} as const;
export const settingColumns =
  "support_email,community_enabled,registrations_enabled,announcement,operator_name,jurisdiction,retention_days,login_enabled,signup_enabled,email_login_enabled,google_login_enabled,microsoft_login_enabled,discord_login_enabled";
