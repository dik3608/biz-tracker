"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_ITEMS } from "./Sidebar";

export default function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tabs fixed inset-x-0 bottom-0 z-40 flex border-t border-edge bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-ink-3",
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
