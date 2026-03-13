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
      className="desktop-sidebar fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-white/8 bg-[rgba(15,15,25,0.85)] backdrop-blur-2xl"
    >
      <div className="flex items-center gap-2.5 px-6 py-7">
        <BarChart3 className="h-7 w-7 text-[var(--accent-blue)]" />
        <span className="text-lg font-bold tracking-tight">BizTracker</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]"
                  : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/8 px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--accent-red)]"
        >
          <LogOut className="h-5 w-5" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
