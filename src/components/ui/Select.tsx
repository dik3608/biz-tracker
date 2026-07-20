"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className={clsx("relative", className)}>
        <select
          ref={ref}
          className={
            "h-9 w-full appearance-none rounded-control border border-edge bg-surface-2 pl-3 pr-8 " +
            "text-sm text-ink transition-colors hover:border-edge-strong focus:border-accent " +
            "focus:outline-none disabled:opacity-50 [&>option]:bg-surface-2"
          }
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3"
        />
      </div>
    );
  },
);
