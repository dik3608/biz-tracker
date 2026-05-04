"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, TrendingDown, TrendingUp, Wallet, Percent, BarChart3, Sparkles } from "lucide-react";
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
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  DateRangePreset,
  getDateRangePreset,
  monthFullLabel,
  monthInputToRange,
  monthShortLabel,
  rangeLabel,
  todayLocalDateKey,
} from "@/lib/date-utils";
import { formatCompactUsd, formatPercent, formatUsd, roundMoney } from "@/lib/money";

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

interface CategoryMonthlyRow {
  month: string;
  categories: CategoryRow[];
}

interface MonthlyResponse {
  period: { from: string; to: string; allTime: boolean };
  rows: MonthlyRow[];
  categoryMonthly: CategoryMonthlyRow[];
  totals: {
    income: number;
    expense: number;
    profit: number;
    margin: number | null;
    averageIncome: number;
    averageExpense: number;
    activeMonths: number;
    bestMonth: MonthlyRow | null;
    worstMonth: MonthlyRow | null;
  };
}

type TypeFilter = "ALL" | "INCOME" | "EXPENSE";

const PERIODS: { value: DateRangePreset; label: string }[] = [
  { value: "current_month", label: "Этот месяц" },
  { value: "previous_month", label: "Прошлый месяц" },
  { value: "last_3_months", label: "3 мес" },
  { value: "last_6_months", label: "6 мес" },
  { value: "last_12_months", label: "12 мес" },
  { value: "current_year", label: "Год" },
  { value: "all_time", label: "Всё время" },
  { value: "single_month", label: "Один месяц" },
  { value: "custom", label: "Период" },
];

const AXIS_TICK = { fill: "#94a3b8", fontSize: 12 };
const CHART_GRID = "rgba(255,255,255,0.05)";
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(15,15,25,0.97)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#e2e8f0",
  boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function buildParams(range: { from: string; to: string }, allTime: boolean) {
  const params = new URLSearchParams();
  if (allTime) {
    params.set("allTime", "true");
  } else {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return params;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<DateRangePreset>("last_6_months");
  const [singleMonth, setSingleMonth] = useState(todayLocalDateKey().slice(0, 7));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const [monthly, setMonthly] = useState<MonthlyResponse | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<CategoryRow[] | null>(null);
  const [incomeCategories, setIncomeCategories] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState("");

  const selectedRange = useMemo(() => {
    if (preset === "single_month") return monthInputToRange(singleMonth);
    if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    if (preset === "all_time") return { from: "", to: "" };
    return getDateRangePreset(preset);
  }, [preset, singleMonth, customFrom, customTo]);

  const allTime = preset === "all_time";
  const hasUsableRange = allTime || Boolean(selectedRange.from && selectedRange.to);

  useEffect(() => {
    if (!hasUsableRange) return;

    const params = buildParams(selectedRange, allTime);
    const expenseParams = new URLSearchParams(params);
    expenseParams.set("type", "EXPENSE");
    const incomeParams = new URLSearchParams(params);
    incomeParams.set("type", "INCOME");

    Promise.all([
      fetchJson<MonthlyResponse>(`/api/reports/monthly?${params}`),
      fetchJson<CategoryRow[]>(`/api/reports/by-category?${expenseParams}`),
      fetchJson<CategoryRow[]>(`/api/reports/by-category?${incomeParams}`),
    ])
      .then(([monthlyData, expenseData, incomeData]) => {
        setError("");
        setMonthly(monthlyData);
        setExpenseCategories(expenseData);
        setIncomeCategories(incomeData);
      })
      .catch(() => {
        setError("Не удалось загрузить отчёты. Проверьте соединение и попробуйте ещё раз.");
        setMonthly({
          period: { from: selectedRange.from, to: selectedRange.to, allTime },
          rows: [],
          categoryMonthly: [],
          totals: {
            income: 0,
            expense: 0,
            profit: 0,
            margin: null,
            averageIncome: 0,
            averageExpense: 0,
            activeMonths: 0,
            bestMonth: null,
            worstMonth: null,
          },
        });
        setExpenseCategories([]);
        setIncomeCategories([]);
      });
  }, [allTime, hasUsableRange, selectedRange]);

  const chartData = useMemo(
    () =>
      monthly?.rows.map((row) => ({
        ...row,
        name: monthShortLabel(row.month),
        fullName: monthFullLabel(row.month),
      })) ?? null,
    [monthly],
  );

  const cumulativeData = useMemo(() => {
    if (!chartData) return null;
    let cumulative = 0;
    return chartData.map((row) => {
      cumulative = roundMoney(cumulative + row.profit);
      return { ...row, cumulative };
    });
  }, [chartData]);

  const stacked = useMemo(() => {
    if (!monthly) return null;
    const totals = new Map<string, CategoryRow>();
    for (const row of monthly.categoryMonthly) {
      for (const cat of row.categories) {
        const existing = totals.get(cat.categoryId);
        totals.set(cat.categoryId, {
          ...cat,
          total: (existing?.total ?? 0) + cat.total,
        });
      }
    }

    const top = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 7);
    const topIds = new Set(top.map((cat) => cat.categoryId));
    const rows =
      monthly.rows.map((row) => {
        const monthCategories = monthly.categoryMonthly.find((item) => item.month === row.month)?.categories ?? [];
        const data: Record<string, string | number> = {
          month: row.month,
          name: monthShortLabel(row.month),
        };
        let other = 0;
        for (const cat of monthCategories) {
          if (topIds.has(cat.categoryId)) {
            data[`cat_${cat.categoryId}`] = cat.total;
          } else {
            other += cat.total;
          }
        }
        if (other > 0) data.cat_other = roundMoney(other);
        return data;
      }) ?? [];

    const defs = [
      ...top.map((cat) => ({
        key: `cat_${cat.categoryId}`,
        name: cat.categoryName,
        color: cat.categoryColor,
      })),
      { key: "cat_other", name: "Другое", color: "#64748b" },
    ];

    return { rows, defs };
  }, [monthly]);

  const donutData = useMemo(() => {
    if (!expenseCategories) return null;
    const sorted = [...expenseCategories].sort((a, b) => b.total - a.total);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    return [
      ...top,
      {
        categoryId: "__other",
        categoryName: "Другое",
        categoryColor: "#64748b",
        total: roundMoney(rest.reduce((sum, cat) => sum + cat.total, 0)),
        percentage: roundMoney(rest.reduce((sum, cat) => sum + cat.percentage, 0)),
      },
    ];
  }, [expenseCategories]);

  const totals = monthly?.totals;
  const tableTotals = useMemo(() => {
    const rows = monthly?.rows ?? [];
    const income = roundMoney(rows.reduce((sum, row) => sum + row.income, 0));
    const expense = roundMoney(rows.reduce((sum, row) => sum + row.expense, 0));
    const profit = roundMoney(income - expense);
    const margin = income > 0 ? roundMoney((profit / income) * 100) : null;
    return { income, expense, profit, margin };
  }, [monthly]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="premium-kicker mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Analytics suite
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Отчёты</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {monthly ? rangeLabel(monthly.period) : "Выберите период для анализа доходов и расходов"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-[var(--text-muted)]">
          <Calendar size={14} />
          <span>Данные считаются по сохранённым суммам в USD</span>
        </div>
      </div>

      <div className="glass-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              onClick={() => setPreset(item.value)}
              className={preset === item.value ? "btn-primary !px-3 !py-2" : "btn-ghost !px-3 !py-2"}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === "single_month" && (
          <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
            <label className="text-xs font-medium text-[var(--text-muted)]">Выберите месяц</label>
            <input
              type="month"
              value={singleMonth}
              onChange={(event) => setSingleMonth(event.target.value)}
              className="max-w-xs"
            />
          </div>
        )}

        {preset === "custom" && (
          <div className="grid gap-3 md:grid-cols-[160px_220px_20px_220px_1fr] md:items-center">
            <label className="text-xs font-medium text-[var(--text-muted)]">Свой период</label>
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <span className="text-center text-[var(--text-muted)]">—</span>
            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            {!hasUsableRange && <span className="text-xs text-[var(--text-muted)]">Укажите обе даты.</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
          {(
            [
              ["ALL", "Доходы + расходы"],
              ["INCOME", "Только доходы"],
              ["EXPENSE", "Только расходы"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={typeFilter === value ? "btn-primary !px-3 !py-2" : "btn-ghost !px-3 !py-2"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {totals ? (
          <>
            <MetricCard title="Доход" value={formatUsd(totals.income)} icon={<TrendingUp size={18} />} tone="income" />
            <MetricCard title="Расход" value={formatUsd(totals.expense)} icon={<TrendingDown size={18} />} tone="expense" />
            <MetricCard title="Прибыль" value={formatUsd(totals.profit)} icon={<Wallet size={18} />} tone={totals.profit >= 0 ? "income" : "expense"} />
            <MetricCard title="Маржа" value={formatPercent(totals.margin)} icon={<Percent size={18} />} tone="neutral" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)
        )}
      </div>

      {totals && (
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard label="Средний доход в активный месяц" value={formatUsd(totals.averageIncome)} />
          <InfoCard label="Средний расход в активный месяц" value={formatUsd(totals.averageExpense)} />
          <InfoCard
            label="Лучший / худший месяц"
            value={`${totals.bestMonth ? monthShortLabel(totals.bestMonth.month) : "—"} / ${totals.worstMonth ? monthShortLabel(totals.worstMonth.month) : "—"}`}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard className="xl:col-span-2" title="Доходы, расходы и прибыль по месяцам">
          {chartData ? (
            chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={chartData} margin={{ top: 12, right: 20, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  <YAxis width={64} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={formatCompactUsd} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: unknown, name: unknown) => [
                      formatUsd(Number(value)),
                      name === "income" ? "Доход" : name === "expense" ? "Расход" : "Прибыль",
                    ]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Legend formatter={(value) => (value === "income" ? "Доход" : value === "expense" ? "Расход" : "Прибыль")} />
                  {(typeFilter === "ALL" || typeFilter === "INCOME") && <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} />}
                  {(typeFilter === "ALL" || typeFilter === "EXPENSE") && <Bar dataKey="expense" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={24} />}
                  {typeFilter === "ALL" && (
                    <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="За выбранный период нет операций." />
            )
          ) : (
            <Skeleton className="h-[380px]" />
          )}
        </SectionCard>

        <SectionCard title="Расходы по категориям помесячно">
          {stacked ? (
            stacked.rows.length > 0 && stacked.defs.length > 0 ? (
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={stacked.rows} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  <YAxis width={64} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={formatCompactUsd} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: unknown, name: unknown) => [
                      formatUsd(Number(value)),
                      stacked.defs.find((item) => item.key === name)?.name ?? String(name),
                    ]}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  {stacked.defs.map((cat) => (
                    <Bar key={cat.key} dataKey={cat.key} stackId="expense" fill={cat.color} name={cat.name} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Нет расходов по категориям за выбранный период." />
            )
          ) : (
            <Skeleton className="h-[330px]" />
          )}
        </SectionCard>

        <SectionCard title="Распределение расходов">
          {donutData ? (
            donutData.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_220px]">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={donutData} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" innerRadius={72} outerRadius={112} paddingAngle={3} strokeWidth={0}>
                      {donutData.map((entry) => (
                        <Cell key={entry.categoryId} fill={entry.categoryColor} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: unknown) => [formatUsd(Number(value)), "Сумма"]} />
                    <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize={18} fontWeight={700}>
                      {formatUsd(expenseCategories?.reduce((sum, cat) => sum + cat.total, 0) ?? 0)}
                    </text>
                    <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={11}>
                      расходов
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                <CategoryList rows={donutData} />
              </div>
            ) : (
              <EmptyState text="Нет расходов за выбранный период." />
            )
          ) : (
            <Skeleton className="h-[300px]" />
          )}
        </SectionCard>

        <SectionCard title="Накопительная прибыль">
          {cumulativeData ? (
            cumulativeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cumulativeData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                  <defs>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  <YAxis width={64} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={formatCompactUsd} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: unknown) => [formatUsd(Number(value)), "Накопительно"]} />
                  <Area type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={3} fill="url(#profitGradient)" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Нет данных для динамики прибыли." />
            )
          ) : (
            <Skeleton className="h-[300px]" />
          )}
        </SectionCard>

        <SectionCard title="Топ расходов">
          {expenseCategories ? <CategoryList rows={expenseCategories.slice(0, 8)} /> : <Skeleton className="h-60" />}
        </SectionCard>

        <SectionCard title="Топ доходов">
          {incomeCategories ? <CategoryList rows={incomeCategories.slice(0, 8)} /> : <Skeleton className="h-60" />}
        </SectionCard>

        <SectionCard className="xl:col-span-2" title="Сравнение по месяцам">
          {chartData ? (
            chartData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-muted)]">
                      <th className="pb-3 font-medium">Месяц</th>
                      <th className="pb-3 text-right font-medium">Доход</th>
                      <th className="pb-3 text-right font-medium">Расход</th>
                      <th className="pb-3 text-right font-medium">Прибыль</th>
                      <th className="pb-3 text-right font-medium">Маржа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row) => {
                      const margin = row.income > 0 ? roundMoney((row.profit / row.income) * 100) : null;
                      return <MonthlyTableRow key={row.month} label={row.fullName} income={row.income} expense={row.expense} profit={row.profit} margin={margin} />;
                    })}
                    <MonthlyTableRow label="Итого" income={tableTotals.income} expense={tableTotals.expense} profit={tableTotals.profit} margin={tableTotals.margin} total />
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState text="Нет месяцев для сравнения." />
            )
          ) : (
            <Skeleton className="h-56" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-[var(--accent-blue)]" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "income" | "expense" | "neutral";
}) {
  const color = tone === "income" ? "var(--accent-green)" : tone === "expense" ? "var(--accent-red)" : "var(--accent-blue)";
  return (
    <div className="glass-card-sm p-4">
      <div className="mb-3 flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
        <span>{title}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card-sm p-4">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CategoryList({ rows }: { rows: CategoryRow[] }) {
  if (rows.length === 0) return <EmptyState text="Нет данных за выбранный период." />;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.categoryId} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.categoryColor }} />
              <span className="truncate">{row.categoryName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="font-semibold">{formatUsd(row.total)}</span>
              <span className="w-12 text-right text-xs text-[var(--text-muted)]">{formatPercent(row.percentage)}</span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${Math.max(4, (row.total / max) * 100)}%`, backgroundColor: row.categoryColor }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyTableRow({
  label,
  income,
  expense,
  profit,
  margin,
  total = false,
}: {
  label: string;
  income: number;
  expense: number;
  profit: number;
  margin: number | null;
  total?: boolean;
}) {
  return (
    <tr className={`${total ? "border-t-2 bg-white/[0.03] font-semibold" : "border-t"} border-white/8`}>
      <td className="py-3 pr-4">{label}</td>
      <td className="py-3 text-right tabular-nums income-text">{formatUsd(income)}</td>
      <td className="py-3 text-right tabular-nums expense-text">{formatUsd(expense)}</td>
      <td className={`py-3 text-right tabular-nums ${profit >= 0 ? "income-text" : "expense-text"}`}>{formatUsd(profit)}</td>
      <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">{formatPercent(margin)}</td>
    </tr>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}
