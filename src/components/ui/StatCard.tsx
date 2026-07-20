"use client";

import { type ReactNode } from "react";
import clsx from "clsx";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatPercent } from "@/lib/money";
import { Card } from "./Card";
import { Skeleton } from "./misc";

/**
 * KPI-плитка: подпись, крупное значение, изменение к прошлому периоду.
 * upIsGood инвертирует окраску дельты (рост расходов — плохо).
 */
export function StatCard({
  label,
  value,
  change,
  changeHint,
  upIsGood = true,
  tone,
  loading,
  sub,
}: {
  label: string;
  value: string;
  change?: number | null;
  changeHint?: string;
  upIsGood?: boolean;
  tone?: "income" | "expense" | "accent";
  loading?: boolean;
  sub?: ReactNode;
}) {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const positive = hasChange && change! > 0;
  const negative = hasChange && change! < 0;
  const good = (positive && upIsGood) || (negative && !upIsGood);

  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <p
          className={clsx(
            "mt-1 text-[26px] font-semibold leading-tight tracking-tight",
            tone === "income" && "text-income",
            tone === "expense" && "text-expense",
            (!tone || tone === "accent") && "text-ink",
          )}
        >
          {value}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
        {hasChange ? (
          <>
            <span
              className={clsx(
                "inline-flex items-center gap-1 font-semibold",
                good ? "text-income" : "text-expense",
              )}
            >
              {positive ? <TrendingUp size={13} /> : negative ? <TrendingDown size={13} /> : null}
              {change! > 0 ? "+" : ""}
              {formatPercent(change)}
            </span>
            {changeHint ? <span className="text-ink-3">{changeHint}</span> : null}
          </>
        ) : sub ? (
          <span className="text-ink-3">{sub}</span>
        ) : change === null ? (
          <span className="text-ink-3">нет данных для сравнения</span>
        ) : null}
      </div>
    </Card>
  );
}
