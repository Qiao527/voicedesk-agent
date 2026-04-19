import { NavLink, Outlet } from "react-router-dom";
import {
  Phone,
  MessageSquare,
  CalendarDays,
  Settings,
  BarChart3,
  LogOut,
  Headphones,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-brand-dark flex flex-col shrink-0">
        <div className="px-5 py-6 flex items-center gap-2.5">
          <Headphones className="w-5 h-5 text-purple-light" />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            VoiceDesk AI
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/60 hover:text-white/90 hover:bg-white/5"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 mb-2">
            <p className="text-xs text-white/50 truncate">
              {user?.email}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/50 hover:text-white/80 transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-surface overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
