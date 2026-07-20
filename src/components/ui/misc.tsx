"use client";

import { type ReactNode } from "react";
import clsx from "clsx";
import { Loader2, Inbox } from "lucide-react";
import { formatMoney, formatSigned, type Currency } from "@/lib/money";
import type { TxType } from "@/lib/types";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center justify-center py-10", className)}>
      <Loader2 size={22} className="animate-spin text-ink-3" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-ink-3">{icon ?? <Inbox size={28} strokeWidth={1.5} />}</div>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint ? <p className="max-w-xs text-[13px] text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-[8px] bg-surface-3", className)} />;
}

/** Точка цвета категории. */
export function CategoryDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

/** Бейдж категории с цветовой точкой. */
export function CategoryBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-edge bg-surface-2 px-2 py-0.5 text-[12px] text-ink-2">
      <CategoryDot color={color} size={7} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Сумма транзакции: доход — зелёный с «+», расход — обычный текст с «−».
 * Если валюта не USD, рядом серым показывается оригинал.
 */
export function TxAmount({
  type,
  amount,
  originalAmount,
  currency,
  className,
}: {
  type: TxType;
  amount: number;
  originalAmount?: number;
  currency?: Currency;
  className?: string;
}) {
  const isIncome = type === "INCOME";
  return (
    <span className={clsx("tnum inline-flex items-baseline gap-1.5", className)}>
      <span className={clsx("font-semibold", isIncome ? "text-income" : "text-ink")}>
        {formatSigned(isIncome ? amount : -amount)}
      </span>
      {currency && currency !== "USD" && originalAmount !== undefined ? (
        <span className="text-[11.5px] text-ink-3">{formatMoney(originalAmount, currency)}</span>
      ) : null}
    </span>
  );
}
