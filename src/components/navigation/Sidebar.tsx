"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  List,
  LogOut,
  PlusCircle,
  Settings,
  Sparkles,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/transactions", label: "Записи", icon: List },
  { href: "/add", label: "Добавить", icon: PlusCircle },
  { href: "/reports", label: "Отчёты", icon: BarChart3 },
  { href: "/ai", label: "AI", icon: Bot },
  { href: "/settings", label: "Настройки", icon: Settings },
];

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="desktop-sidebar fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-white/10 bg-[rgba(7,8,18,0.78)] backdrop-blur-2xl"
    >
      <div className="px-5 py-6">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/20">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-green)] text-white shadow-lg shadow-[var(--accent-blue)]/20">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black tracking-tight">BizTracker</div>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-gold)]">
              <Sparkles className="h-3 w-3" />
              Finance OS
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 px-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                isActive
                  ? "border border-white/10 bg-white/[0.085] text-white shadow-lg shadow-black/10"
                  : "text-[var(--text-muted)] hover:bg-white/[0.055] hover:text-[var(--text)]"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-[var(--accent-blue)] text-white shadow-lg shadow-[var(--accent-blue)]/25"
                    : "bg-white/[0.035] text-[var(--text-muted)] group-hover:bg-white/[0.08] group-hover:text-white"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-5">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-[var(--accent-red)]"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
