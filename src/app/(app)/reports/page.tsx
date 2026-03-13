"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyRow {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

interface CategoryRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const MONTH_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const fmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(15,15,25,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  color: "#e2e8f0",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const AXIS_TICK = { fill: "#94a3b8", fontSize: 12 };

type PeriodPreset = 3 | 6 | 12 | "custom";
type TypeFilter = "ALL" | "EXPENSE" | "INCOME";

function monthLabel(key: string): string {
  const [, m] = key.split("-");
  return MONTH_NAMES[Number(m) - 1] ?? key;
}

function monthFullLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_FULL[Number(m) - 1]} ${y}`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const [preset, setPreset] = useState<PeriodPreset>(6);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const [monthly, setMonthly] = useState<MonthlyRow[] | null>(null);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [incomeCategories, setIncomeCategories] = useState<CategoryRow[] | null>(null);

  const months = typeof preset === "number" ? preset : 12;

  /* ---------- date range helpers ---------- */

  const dateRange = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    return {
      from: from.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    };
  }, [preset, customFrom, customTo, months]);

  /* ---------- fetch monthly ---------- */

  useEffect(() => {
    setMonthly(null);
    const url =
      preset === "custom" && customFrom && customTo
        ? `/api/reports/monthly?months=12`
        : `/api/reports/monthly?months=${months}`;
    fetch(url)
      .then((r) => r.json())
      .then(setMonthly)
      .catch(() => {});
  }, [preset, months, customFrom, customTo]);

  /* ---------- fetch categories ---------- */

  useEffect(() => {
    setCategories(null);
    setIncomeCategories(null);
    const params = new URLSearchParams({ type: "EXPENSE" });
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    fetch(`/api/reports/by-category?${params}`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    const incParams = new URLSearchParams({ type: "INCOME" });
    if (dateRange.from) incParams.set("from", dateRange.from);
    if (dateRange.to) incParams.set("to", dateRange.to);
    fetch(`/api/reports/by-category?${incParams}`)
      .then((r) => r.json())
      .then(setIncomeCategories)
      .catch(() => {});
  }, [dateRange]);

  /* ---------- derived data ---------- */

  const chartData = monthly?.map((r) => ({
    ...r,
    name: monthLabel(r.month),
    fullName: monthFullLabel(r.month),
  }));

  const filteredChart = chartData?.filter((r) => {
    if (preset !== "custom") return true;
    return r.month >= (customFrom ?? "") && r.month <= (customTo ?? "");
  });

  const cumulativeData = useMemo(() => {
    if (!filteredChart) return null;
    let acc = 0;
    return filteredChart.map((r) => {
      acc += r.profit;
      return { ...r, cumulative: Math.round(acc * 100) / 100 };
    });
  }, [filteredChart]);

  const totalExpense = categories?.reduce((s, c) => s + c.total, 0) ?? 0;

  const donutData = useMemo(() => {
    if (!categories) return null;
    const sorted = [...categories].sort((a, b) => b.total - a.total);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    return [
      ...top,
      {
        categoryId: "__other",
        categoryName: "Другое",
        categoryColor: "#64748b",
        total: rest.reduce((s, c) => s + c.total, 0),
        percentage: rest.reduce((s, c) => s + c.percentage, 0),
      },
    ];
  }, [categories]);

  const top5 = categories?.slice(0, 5) ?? [];

  /* ---------- stacked bar data ---------- */

  const stackedData = useMemo(() => {
    if (!filteredChart || !categories) return null;
    const catNames = categories.slice(0, 8).map((c) => c.categoryName);
    return filteredChart.map((r) => {
      const row: Record<string, number | string> = { name: r.name };
      const perCat = r.expense / (catNames.length || 1);
      catNames.forEach((cn, i) => {
        const cat = categories[i];
        const share = cat ? (cat.percentage / 100) * r.expense : perCat;
        row[cn] = Math.round(share * 100) / 100;
      });
      return row;
    });
  }, [filteredChart, categories]);

  const stackedCategories = categories?.slice(0, 8) ?? [];

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-2xl font-bold tracking-tight">Отчёты</h1>

      {/* ===== Period Selector ===== */}
      <div className="glass-card flex flex-wrap items-center gap-3 p-4">
        <Calendar size={18} style={{ color: "var(--text-muted)" }} />

        {([3, 6, 12] as const).map((n) => (
          <button
            key={n}
            onClick={() => setPreset(n)}
            className={preset === n ? "btn-primary" : "btn-ghost"}
          >
            {n} мес
          </button>
        ))}

        <button
          onClick={() => setPreset("custom")}
          className={preset === "custom" ? "btn-primary" : "btn-ghost"}
        >
          Период
        </button>

        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="!w-auto"
            />
            <span style={{ color: "var(--text-muted)" }}>—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="!w-auto"
            />
          </div>
        )}

        <div className="ml-auto flex gap-2">
          {(
            [
              ["ALL", "Все"],
              ["EXPENSE", "Расходы"],
              ["INCOME", "Доходы"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={typeFilter === val ? "btn-primary" : "btn-ghost"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Charts Grid ===== */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* --- Monthly Bar+Line Chart --- */}
        <div className="glass-card p-5 md:col-span-2">
          <h2 className="mb-4 text-base font-semibold">
            Доходы и расходы по месяцам
          </h2>
          {filteredChart ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart
                data={filteredChart}
                margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`
                  }
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown, name: unknown) => [
                    fmt.format(Number(value)),
                    String(name) === "income"
                      ? "Доход"
                      : String(name) === "expense"
                        ? "Расход"
                        : "Прибыль",
                  ]}
                  labelFormatter={(l) => String(l)}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                {(typeFilter === "ALL" || typeFilter === "INCOME") && (
                  <Bar
                    dataKey="income"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                )}
                {(typeFilter === "ALL" || typeFilter === "EXPENSE") && (
                  <Bar
                    dataKey="expense"
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-[350px] w-full" />
          )}
        </div>

        {/* --- Stacked Bar Chart --- */}
        <div className="glass-card p-5">
          <h2 className="mb-4 text-base font-semibold">
            Расходы по категориям (помесячно)
          </h2>
          {stackedData && stackedCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={stackedData}
                margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`
                  }
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown) => [fmt.format(Number(value))]}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                {stackedCategories.map((cat) => (
                  <Bar
                    key={cat.categoryId}
                    dataKey={cat.categoryName}
                    stackId="a"
                    fill={cat.categoryColor}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-[350px] w-full" />
          )}
        </div>

        {/* --- Donut Chart --- */}
        <div className="glass-card p-5">
          <h2 className="mb-4 text-base font-semibold">
            Распределение расходов
          </h2>
          {donutData ? (
            <div className="flex flex-col items-center md:flex-row md:items-start md:gap-4">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="total"
                    nameKey="categoryName"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={110}
                    paddingAngle={3}
                    strokeWidth={0}
                    label={false}
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={entry.categoryId}
                        fill={entry.categoryColor}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: unknown) => [fmt.format(Number(value)), "Сумма"]}
                  />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        {value}
                      </span>
                    )}
                  />
                  {/* Center text */}
                  <text
                    x="50%"
                    y="48%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#e2e8f0"
                    fontSize={18}
                    fontWeight={700}
                  >
                    {fmt.format(totalExpense)}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#94a3b8"
                    fontSize={11}
                  >
                    всего
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </div>

        {/* --- Area Chart: Cumulative Profit --- */}
        <div className="glass-card p-5">
          <h2 className="mb-4 text-base font-semibold">
            Накопительная прибыль
          </h2>
          {cumulativeData ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={cumulativeData}
                margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              >
                <defs>
                  <linearGradient
                    id="profitGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`
                  }
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown) => [
                    fmt.format(Number(value)),
                    "Накопительная прибыль",
                  ]}
                  labelFormatter={(l) => String(l)}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#profitGradient)"
                  dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </div>

        {/* --- Top 5 Categories --- */}
        <div className="glass-card p-5">
          <h2 className="mb-4 text-base font-semibold">Топ расходов</h2>
          {categories ? (
            top5.length > 0 ? (
              <div className="space-y-3">
                {top5.map((cat, i) => (
                  <div key={cat.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                          {i + 1}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.categoryColor }}
                        />
                        <span>{cat.categoryName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">
                          {fmt.format(cat.total)}
                        </span>
                        <span
                          className="w-12 text-right text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {cat.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.categoryColor,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Нет данных за выбранный период
              </p>
            )
          ) : (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
        </div>

        {/* --- Monthly Comparison Table --- */}
        <div className="glass-card overflow-x-auto p-5 md:col-span-2">
          <h2 className="mb-4 text-base font-semibold">
            Сравнение по месяцам
          </h2>
          {filteredChart ? (
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <th className="pb-3 font-medium">Месяц</th>
                  <th className="pb-3 text-right font-medium">Доход</th>
                  <th className="pb-3 text-right font-medium">Расход</th>
                  <th className="pb-3 text-right font-medium">Прибыль</th>
                  <th className="pb-3 text-right font-medium">Маржа %</th>
                </tr>
              </thead>
              <tbody>
                {filteredChart.map((r) => {
                  const margin =
                    r.income > 0
                      ? ((r.profit / r.income) * 100).toFixed(1)
                      : "—";
                  const marginNum = r.income > 0 ? r.profit / r.income : 0;
                  return (
                    <tr
                      key={r.month}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-2.5 font-medium">{r.fullName}</td>
                      <td className="py-2.5 text-right tabular-nums income-text">
                        {fmt.format(r.income)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums expense-text">
                        {fmt.format(r.expense)}
                      </td>
                      <td
                        className="py-2.5 text-right font-semibold tabular-nums"
                        style={{
                          color:
                            r.profit >= 0
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                        }}
                      >
                        {fmt.format(r.profit)}
                      </td>
                      <td
                        className="py-2.5 text-right tabular-nums"
                        style={{
                          color:
                            marginNum >= 0.3
                              ? "var(--accent-green)"
                              : marginNum >= 0.1
                                ? "var(--accent-blue)"
                                : "var(--accent-red)",
                        }}
                      >
                        {margin}
                        {margin !== "—" && "%"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
