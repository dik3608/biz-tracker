"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  List,
  LogOut,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Обзор", icon: LayoutDashboard },
  { href: "/transactions", label: "Операции", icon: List },
  { href: "/add", label: "Добавить", icon: Plus },
  { href: "/reports", label: "Отчёты", icon: BarChart3 },
  { href: "/ai", label: "AI-помощник", icon: Bot },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="desktop-sidebar fixed left-0 top-0 z-40 flex h-screen w-[218px] flex-col border-r border-edge bg-surface max-md:hidden">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-accent-ink">
          <Wallet size={16} strokeWidth={2.2} />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-ink">BizTracker</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 rounded-control px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-surface-3 text-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={16} className={active ? "text-accent" : "text-ink-3"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[13.5px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-expense"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </aside>
  );
}
