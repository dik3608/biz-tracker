"use client";

import clsx from "clsx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Цветовая семантика (например, доход/расход). */
  tone?: "income" | "expense";
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-control border border-edge bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "rounded-[8px] font-medium transition-colors",
              size === "sm" ? "h-6.5 px-2.5 text-[12.5px]" : "h-7.5 px-3.5 text-[13px]",
              active
                ? opt.tone === "income"
                  ? "bg-income/15 text-income"
                  : opt.tone === "expense"
                    ? "bg-expense/15 text-expense"
                    : "bg-surface-3 text-ink"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
