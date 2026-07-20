"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/money";
import { ChartTooltip } from "./ChartTooltip";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Кольцевая диаграмма структуры: до 8 долей, мелкие своди в «Прочее»
 * до передачи сюда. Сегменты разделены 2px просветом поверхности.
 */
export function Donut({
  slices,
  centerLabel,
  centerValue,
  size = 190,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: number;
  size?: number;
}) {
  if (slices.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-3">Нет данных за период</p>;
  }
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={size / 2 - 34}
            outerRadius={size / 2 - 4}
            paddingAngle={2}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as DonutSlice;
              return (
                <ChartTooltip
                  title={s.label}
                  rows={[{ label: "Сумма", value: s.value, color: s.color }]}
                />
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel !== undefined ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11.5px] text-ink-3">{centerLabel}</span>
          {centerValue !== undefined ? (
            <span className="text-[17px] font-semibold text-ink">{formatMoney(centerValue)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
