"use client";

import { formatMoney, formatPercent } from "@/lib/money";
import { CategoryDot } from "@/components/ui/misc";

export interface BarListRow {
  key: string;
  label: string;
  color: string;
  value: number;
  /** Доля 0–100 — ширина полосы. */
  share: number;
  hint?: string;
  onClick?: () => void;
}

/**
 * Горизонтальные полосы долей (топ категорий): подпись и значение — текстом,
 * цвет несёт только полоса.
 */
export function BarList({ rows, emptyText = "Нет данных за период" }: { rows: BarListRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-3">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-2 text-ink">
                <CategoryDot color={r.color} />
                <span className="truncate">{r.label}</span>
                {r.hint ? <span className="shrink-0 text-[11.5px] text-ink-3">{r.hint}</span> : null}
              </span>
              <span className="tnum shrink-0 text-ink-2">
                {formatMoney(r.value)}
                <span className="ml-1.5 text-[11.5px] text-ink-3">{formatPercent(r.share, 0)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.max(r.share, 1)}%`, background: r.color }}
              />
            </div>
          </>
        );
        return r.onClick ? (
          <button key={r.key} onClick={r.onClick} className="block w-full rounded-[8px] px-1 py-0.5 text-left transition-colors hover:bg-surface-2">
            {inner}
          </button>
        ) : (
          <div key={r.key} className="px-1 py-0.5">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
