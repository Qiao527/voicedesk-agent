import { clsx } from "clsx";
import { CalendarDays, LayoutDashboard, LogOut, Menu, MessageSquare, PhoneCall, Settings, X } from "lucide-react";
import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useBusiness } from "../lib/business";
import { AUTHOR, IS_DEMO, REPO_URL } from "../lib/config";
import { formatPhone } from "../lib/format";
import { useAsync } from "../lib/use-async";
import { GithubIcon, Logo } from "./Logo";
import { Skeleton } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/calls", label: "Calls", icon: PhoneCall, badge: "followUps" as const },
  { to: "/messages", label: "Messages", icon: MessageSquare, badge: "unread" as const },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { email, signOut } = useAuth();
  const { business } = useBusiness();
  const location = useLocation();
  const { data: counts } = useAsync(() => api.getAnalytics(30), [location.pathname]);
  const badges = { followUps: counts?.followUpsOpen ?? 0, unread: counts?.unreadMessages ?? 0 };

  return (
    <div className="bg-ink-950 flex h-full flex-col text-slate-300">
      <div className="px-5 pt-5 pb-4">
        <Logo dark />
      </div>

      <div className="mx-3 mb-4 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
        {business ? (
          <>
            <p className="truncate text-sm font-medium text-white">{business.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              {business.vapi_phone_number ? formatPhone(business.vapi_phone_number) : "No number yet"}
            </p>
          </>
        ) : (
          <Skeleton className="h-9 bg-white/10" />
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )
              }
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className="tabular bg-brand-500/20 text-brand-200 rounded-full px-1.5 py-px text-[11px] font-semibold">{count}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-400">{email}</p>
          {!IS_DEMO && (
            <button onClick={() => void signOut()} className="text-slate-500 hover:text-slate-200" title="Sign out">
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300"
        >
          <GithubIcon className="size-3.5" />
          Built by {AUTHOR.name}
        </a>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="border-brand-100 bg-brand-50 text-brand-800 border-b px-4 py-2 text-center text-xs">
      <span className="font-semibold">Live demo</span> with sample data for a fictional practice. Changes reset on reload.{" "}
      <a href={REPO_URL} className="hover:text-brand-950 font-medium underline underline-offset-2" target="_blank" rel="noreferrer">
        View the source on GitHub
      </a>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {IS_DEMO && <DemoBanner />}
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
          <Sidebar />
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="animate-fade-in absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
            <div className="animate-slide-in absolute inset-y-0 left-0 w-64">
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setOpen((v) => !v)} className="text-slate-600" aria-label="Toggle navigation">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <Logo />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
