"use client";

import { formatMoney } from "@/lib/money";

/** Общий тултип графиков: тёмная карточка, значения с выравниванием разрядов. */
export function ChartTooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; color: string }[];
}) {
  return (
    <div className="rounded-control border border-edge-strong bg-surface-2 px-3 py-2 shadow-xl shadow-black/40">
      <p className="mb-1 text-[12px] font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5 text-[12px]">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: r.color }}
          />
          <span className="text-ink-2">{r.label}</span>
          <span className="tnum ml-auto pl-3 font-medium text-ink">{formatMoney(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
