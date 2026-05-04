"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  List,
  PlusCircle,
  Settings,
} from "lucide-react";

const tabs = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/transactions", label: "Записи", icon: List },
  { href: "/add", label: "Добавить", icon: PlusCircle },
  { href: "/reports", label: "Отчёты", icon: BarChart3 },
  { href: "/ai", label: "AI", icon: Bot },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export default function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="mobile-tabs fixed bottom-0 left-0 z-50 hidden w-full items-center justify-around border-t border-white/10 bg-[rgba(7,8,18,0.86)] px-1 pb-[env(safe-area-inset-bottom)] pt-2 shadow-2xl shadow-black/40 backdrop-blur-2xl"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition-all ${
              isActive
                ? "bg-white/[0.08] text-white"
                : "text-[var(--text-muted)]"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
