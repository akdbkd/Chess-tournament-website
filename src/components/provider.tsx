"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { api, demoMode, supabase } from "@/lib/supabase";
import { tournaments as samples, posts as samplePosts } from "@/lib/data";
import type {
  Tournament,
  Registration,
  Profile,
  Post,
  Notice,
} from "@/lib/types";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
type Store = {
  tournaments: Tournament[];
  registrations: Registration[];
  saved: string[];
  posts: Post[];
  notices: Notice[];
  profile: Profile | null;
  settings: {
    support_email: string;
    community_enabled: boolean;
    registrations_enabled: boolean;
    announcement: string;
    operator_name: string;
    jurisdiction: string;
    retention_days: number;
  } | null;
};
type App = Store & {
  ready: boolean;
  error: string;
  demo: boolean;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
  setProfile: (p: Profile | null) => void;
  update: (v: Partial<Store>) => void;
  notify: (message: string, error?: boolean) => void;
  refresh: () => Promise<void>;
  signout: () => Promise<void>;
  save: (id: string) => Promise<void>;
  action: (id: string, action: string) => Promise<void>;
  requireAuth: () => boolean;
};
const Context = createContext<App>(null!);
export const useApp = () => useContext(Context);
const initial: Store = {
  tournaments: demoMode ? samples : [],
  registrations: [],
  saved: [],
  posts: demoMode ? samplePosts : [],
  notices: [],
  profile: null,
  settings: null,
};
export function Provider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Store>(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [authOpen, setAuthOpen] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    );
  const refreshGeneration = useRef(0);
  const update = useCallback(
    (v: Partial<Store>) => setStore((s) => ({ ...s, ...v })),
    [],
  );
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(async () => {
    if (demoMode) return;
    const generation = ++refreshGeneration.current;
    try {
      const session = (await supabase?.auth.getSession())?.data.session;
      const [tournaments, posts, settings] = await Promise.all([
        api("tournaments"),
        api("posts"),
        api("settings/public"),
      ]);
      const me = session
        ? await api("me")
        : { profile: null, registrations: [], saved: [], notices: [] };
      const current = (await supabase?.auth.getSession())?.data.session;
      if (
        refreshGeneration.current !== generation ||
        current?.access_token !== session?.access_token
      )
        return;
      update({ tournaments, posts, settings, ...me });
      setError("");
    } catch (e) {
      if (refreshGeneration.current !== generation) return;
      setError((e as Error).message);
      // Never retain another session's private data after auth/account failure.
      update({ profile: null, registrations: [], saved: [], notices: [] });
    } finally {
      if (refreshGeneration.current === generation) setReady(true);
    }
  }, [update]);
  useEffect(() => {
    if (demoMode) {
      try {
        const raw = localStorage.getItem("knightfall-demo-v1");
        if (raw) {
          const s = JSON.parse(raw);
          if (Array.isArray(s.tournaments) && Array.isArray(s.registrations))
            setStore({ ...initial, ...s });
        }
      } catch {}
      setReady(true);
    } else {
      void refresh();
      const sub = supabase?.auth.onAuthStateChange(() => {
        setTimeout(() => void refresh(), 0);
      });
      return () => sub?.data.subscription.unsubscribe();
    }
  }, [refresh]);
  useEffect(() => {
    if (ready && demoMode)
      localStorage.setItem("knightfall-demo-v1", JSON.stringify(store));
  }, [store, ready]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const requireAuth = () => {
    if (store.profile) return true;
    setAuthOpen(true);
    return false;
  };
  async function save(id: string) {
    if (!requireAuth()) return;
    try {
      if (!demoMode)
        await api("saved", { method: "POST", body: JSON.stringify({ id }) });
      update({
        saved: store.saved.includes(id)
          ? store.saved.filter((x) => x !== id)
          : [...store.saved, id],
      });
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function action(id: string, action: string) {
    try {
      if (!demoMode) {
        await api("registration/action", {
          method: "POST",
          body: JSON.stringify({ id, action }),
        });
        await refresh();
      } else {
        const r = store.registrations.find((r) => r.id === id);
        if (!r) return;
        const t = store.tournaments.find((t) => t.id === r.tournament_id)!;
        if (action === "checkin") {
          const delta = new Date(t.starts_at).getTime() - Date.now();
          if (r.status !== "approved" || delta > 1800000 || delta < 0)
            throw new Error("Check-in opens 30 minutes before the tournament.");
        }
        if (
          action === "withdraw" &&
          new Date(t.starts_at).getTime() < Date.now()
        )
          throw new Error("The tournament has started. Contact the organizer.");
        const status =
          action === "withdraw"
            ? "withdrawn"
            : action === "approve"
              ? "approved"
              : action === "reject"
                ? "rejected"
                : action === "checkin"
                  ? "checked_in"
                  : r.status;
        update({
          tournaments: store.tournaments.map((x) =>
            x.id === t.id &&
            ["withdraw", "reject"].includes(action) &&
            ["approved", "pending", "pending_payment", "checked_in"].includes(
              r.status,
            )
              ? { ...x, participants: Math.max(0, x.participants - 1) }
              : x,
          ),
          registrations: store.registrations.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status,
                  payment_status:
                    action === "refund"
                      ? "refunded"
                      : ["withdraw", "reject"].includes(action) &&
                          x.payment_status === "paid"
                        ? "refund_requested"
                        : x.payment_status,
                }
              : x,
          ),
        });
      }
      notify(
        action === "refund" ? "Refund requested." : "Registration updated.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <Context.Provider
      value={{
        ...store,
        ready,
        error,
        demo: demoMode,
        authOpen,
        setAuthOpen,
        setProfile: (profile) => update({ profile }),
        update,
        notify,
        refresh,
        requireAuth,
        save,
        action,
        signout: async () => {
          refreshGeneration.current++;
          await supabase?.auth.signOut();
          update({
            profile: null,
            registrations: demoMode ? store.registrations : [],
            saved: [],
            notices: [],
          });
          notify("You have signed out.");
        },
      }}
    >
      {children}
      {toast && (
        <div className={"toast " + (toast.error ? "error" : "")} role="status">
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
