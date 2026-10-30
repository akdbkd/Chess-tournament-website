"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  Trophy,
  Users,
  BarChart3,
  Crown,
  Radio,
  Bookmark,
  CalendarDays,
  ArrowUpRight,
  ShieldCheck,
  HelpCircle,
  Menu,
  X,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
} from "lucide-react";
import { Knight } from "./ui";
import { useApp } from "./provider";
import { AuthModal } from "./forms";
const nav = [
  { name: "Overview", href: "/", icon: LayoutGrid },
  { name: "Tournaments", href: "/tournaments", icon: Trophy },
  { name: "Live events", href: "/tournaments?status=live", icon: Radio },
  { name: "Leaderboard", href: "/leaderboard", icon: BarChart3 },
  { name: "Community", href: "/community", icon: Users },
];
export function Chrome({ children }: { children: React.ReactNode }) {
  const app = useApp(),
    path = usePathname(),
    router = useRouter();
  const [mobile, setMobile] = useState(false),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState("");
  return (
    <>
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Link className="brand" href="/" onClick={() => setMobile(false)}>
          <span className="brand-icon">
            <Knight />
          </span>
          <span>
            KNIGHTFALL<small>CHESS. ELEVATED.</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="sidebar-label">THE ARENA</div>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.href}
              className={
                "nav-link " +
                ((n.href === "/" ? path === "/" : path.startsWith(n.href))
                  ? "selected"
                  : "")
              }
              href={n.href}
              onClick={() => setMobile(false)}
            >
              <n.icon size={19} />
              {n.name}
              {n.name === "Tournaments" && (
                <span className="nav-count">
                  {app.tournaments.filter((t) => t.status === "open").length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-label second">YOUR PLAYBOOK</div>
        <nav>
          <Link
            className={"nav-link " + (path === "/dashboard" ? "selected" : "")}
            href="/dashboard"
            onClick={() => setMobile(false)}
          >
            <CalendarDays size={19} />
            My registrations
          </Link>
          <Link
            className="nav-link"
            href="/dashboard?tab=saved"
            onClick={() => setMobile(false)}
          >
            <Bookmark size={19} />
            Saved tournaments
          </Link>
          <Link
            className={"nav-link " + (path === "/admin" ? "selected" : "")}
            href="/admin"
            onClick={() => setMobile(false)}
          >
            <ShieldCheck size={19} />
            Organizer studio
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="club-card">
            <div className="club-symbol">
              <Crown size={35} />
            </div>
            <h3>Built for every chess player.</h3>
            <p>Compete. Learn. Connect. Grow.</p>
            <Link href="/about">
              Discover Knightfall
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <Link href="/help" className="nav-link">
            <HelpCircle size={18} />
            Help & support
            <ArrowUpRight size={14} />
          </Link>
          <div className="system-status">
            <span className="status-dot green" />
            {app.demo
              ? "Demo arena • explore freely"
              : "Games powered by Chess.com"}
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="header-breadcrumb">
              The arena <span>/</span>{" "}
              <strong>
                {path === "/"
                  ? "Overview"
                  : path.startsWith("/tournaments/")
                    ? "Tournament details"
                    : path === "/admin"
                      ? "Organizer studio"
                      : path === "/dashboard"
                        ? "Your playbook"
                        : path.slice(1).replace("-", " ")}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <form
              className="header-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/tournaments?q=" + encodeURIComponent(search));
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search tournaments"
                placeholder="Search the arena..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <Link
              className="icon-button notification-button"
              href="/dashboard?tab=notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
              {app.notices.some((n) => !n.read) && <i />}
            </Link>
            <span className="header-divider" />
            {app.profile ? (
              <div className="profile-wrapper">
                <button
                  className="profile-button"
                  onClick={() => setMenu(!menu)}
                  aria-expanded={menu}
                >
                  <span className="avatar">
                    {app.profile.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>{app.profile.display_name.split(" ")[0]}</span>
                  <ChevronDown size={14} />
                </button>
                {menu && (
                  <div className="profile-menu">
                    <Link href="/dashboard" onClick={() => setMenu(false)}>
                      <LayoutGrid size={16} />
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard?tab=settings"
                      onClick={() => setMenu(false)}
                    >
                      <Settings size={16} />
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        void app.signout();
                        setMenu(false);
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="button small"
                onClick={() => app.setAuthOpen(true)}
              >
                Join the arena
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </header>
        {app.demo && (
          <div className="demo-strip">
            <span className="status-dot" />
            Preview mode{" "}
            <span>
              Explore sample tournaments. No real entries or payments.
            </span>
            <button
              onClick={() =>
                app.notify(
                  "Production mode connects to your Supabase project and Razorpay account. Setup instructions are included in the source package.",
                )
              }
            >
              About this preview
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}
        <main id="main-content">
          {app.settings?.announcement && (
            <div className="announcement-banner" role="status">
              {app.settings.announcement}
            </div>
          )}
          {app.settings && !app.settings.registrations_enabled && (
            <div className="announcement-banner">
              New registrations are temporarily paused. You can still manage
              your existing entries.
            </div>
          )}
          {app.error && (
            <div className="error-banner">
              {app.error}
              <button onClick={() => app.refresh()}>Retry</button>
            </div>
          )}
          {children}
        </main>
        <footer>
          <Link href="/" className="footer-brand">
            <Knight />
            KNIGHTFALL
          </Link>
          <span>Made for the love of the game.</span>
          <div>
            <Link href="/about">About</Link>
            <Link href="/help">Help</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/refunds">Refunds</Link>
          </div>
          <p>
            © 2026 Knightfall Arena. Independent platform. Not affiliated with
            or endorsed by Chess.com.
          </p>
        </footer>
      </div>
      {app.authOpen && <AuthModal onClose={() => app.setAuthOpen(false)} />}
    </>
  );
}
