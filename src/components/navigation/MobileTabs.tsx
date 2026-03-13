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
  { href: "/settings", label: "Ещё", icon: Settings },
];

export default function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="mobile-tabs fixed bottom-0 left-0 z-50 hidden w-full items-center justify-around border-t border-white/8 bg-[rgba(10,10,18,0.92)] px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-2xl"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-1.5 text-[10px] transition-colors ${
              isActive
                ? "text-[var(--accent-blue)]"
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
