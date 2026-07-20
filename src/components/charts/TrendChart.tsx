"use client";

import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact } from "@/lib/money";
import { formatDay, formatMonth, type DateKey } from "@/lib/dates";
import type { SeriesGranularity, SeriesPoint } from "@/lib/types";
import { ChartTooltip } from "./ChartTooltip";

const COLORS = {
  income: "var(--color-chart-income)",
  expense: "var(--color-chart-expense)",
  profit: "var(--color-chart-profit)",
};

function bucketLabel(bucket: DateKey, granularity: SeriesGranularity): string {
  if (granularity === "month") return formatMonth(bucket.slice(0, 7), { short: true });
  return formatDay(bucket, { withYear: false });
}

/**
 * Динамика доход/расход (колонки) + прибыль (линия) на одной долларовой оси.
 * Легенда — сверху, статичная; наведение — перекрестье с тултипом.
 */
export function TrendChart({
  points,
  granularity,
  height = 260,
  showProfit = true,
}: {
  points: SeriesPoint[];
  granularity: SeriesGranularity;
  height?: number;
  showProfit?: boolean;
}) {
  const data = points.map((p) => ({ ...p, label: bucketLabel(p.bucket, granularity) }));
  // Не толще 24px: recharts сам ужмёт при большом числе корзин
  const barSize = Math.min(24, Math.max(4, Math.floor(560 / Math.max(points.length, 1) / 2.6)));

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 px-1 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLORS.income }} />
          Доход
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLORS.expense }} />
          Расход
        </span>
        {showProfit ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: COLORS.profit }} />
            Прибыль
          </span>
        ) : null}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#667082", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "#667082", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompact(v)}
            width={52}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.045)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SeriesPoint & { label: string };
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    { label: "Доход", value: p.income, color: COLORS.income },
                    { label: "Расход", value: p.expense, color: COLORS.expense },
                    ...(showProfit
                      ? [{ label: "Прибыль", value: p.profit, color: COLORS.profit }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="income" fill={COLORS.income} barSize={barSize} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill={COLORS.expense} barSize={barSize} radius={[4, 4, 0, 0]} />
          {showProfit ? (
            <Line
              type="monotone"
              dataKey="profit"
              stroke={COLORS.profit}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
