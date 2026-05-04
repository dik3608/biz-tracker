"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Wallet,
} from "lucide-react";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { monthShortLabel } from "@/lib/date-utils";
import { formatCompactUsd, formatUsd } from "@/lib/money";

interface Summary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  incomeChange: number;
  expenseChange: number;
}

interface MonthlyRow {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

interface MonthlyResponse {
  rows: MonthlyRow[];
}

interface CategoryRow {
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
}

interface Transaction {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  description: string;
  date: string;
  category: { name: string; color: string };
}

const fmt = { format: formatUsd };

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 ${className}`}
    />
  );
}

function ChangeTag({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: positive ? "var(--accent-green)" : "var(--accent-red)" }}
    >
      {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(15,15,25,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  color: "#e2e8f0",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[] | null>(null);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    fetch("/api/transactions/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
    fetch("/api/reports/monthly?months=6")
      .then((r) => r.json())
      .then((d: MonthlyResponse | MonthlyRow[]) => setMonthly(Array.isArray(d) ? d : d.rows))
      .catch(() => {});
    fetch("/api/reports/by-category?type=EXPENSE")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
    fetch("/api/transactions?limit=10")
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions))
      .catch(() => {});
  }, []);

  const margin = summary && summary.totalIncome > 0
    ? (summary.profit / summary.totalIncome) * 100
    : 0;

  const chartData = monthly?.map((r) => ({
    ...r,
    name: monthShortLabel(r.month),
  }));

  const donutData = (() => {
    if (!categories) return null;
    const sorted = [...categories].sort((a, b) => b.total - a.total);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const otherTotal = rest.reduce((s, c) => s + c.total, 0);
    const otherPct = rest.reduce((s, c) => s + c.percentage, 0);
    return [
      ...top,
      {
        categoryName: "Другое",
        categoryColor: "#64748b",
        total: otherTotal,
        percentage: otherPct,
      },
    ];
  })();

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {summary ? (
          <>
            <SummaryCard
              label="Доход"
              value={fmt.format(summary.totalIncome)}
              icon={<TrendingUp size={18} />}
              accent="var(--accent-green)"
              tag={<ChangeTag value={summary.incomeChange} />}
            />
            <SummaryCard
              label="Расход"
              value={fmt.format(summary.totalExpense)}
              icon={<TrendingDown size={18} />}
              accent="var(--accent-red)"
              tag={<ChangeTag value={summary.expenseChange} />}
            />
            <SummaryCard
              label="Прибыль"
              value={fmt.format(summary.profit)}
              icon={<Wallet size={18} />}
              accent={summary.profit >= 0 ? "var(--accent-green)" : "var(--accent-red)"}
            />
            <SummaryCard
              label="Маржа"
              value={`${margin.toFixed(1)}%`}
              icon={<Percent size={18} />}
              accent={
                margin >= 30
                  ? "var(--accent-green)"
                  : margin >= 10
                    ? "var(--accent-blue)"
                    : "var(--accent-red)"
              }
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card-sm p-4">
              <Skeleton className="mb-3 h-4 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))
        )}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-5">
        {/* Bar + Line chart */}
        <div className="glass-card p-5 md:col-span-3">
          <h2 className="mb-4 text-base font-semibold">Доходы и расходы</h2>
          {chartData ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={formatCompactUsd}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: unknown, name: unknown) => [
                    fmt.format(Number(value)),
                    String(name) === "income" ? "Доход" : String(name) === "expense" ? "Расход" : "Прибыль",
                  ]}
                  labelFormatter={(l) => String(l)}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
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
            <Skeleton className="h-[300px] w-full" />
          )}
        </div>

        {/* Donut chart */}
        <div className="glass-card p-5 md:col-span-2">
          <h2 className="mb-4 text-base font-semibold">Расходы по категориям</h2>
          {donutData ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="total"
                  nameKey="categoryName"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.categoryColor} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: unknown) => [fmt.format(Number(value)), "Сумма"]}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-[250px] w-full" />
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Последние записи</h2>
          <Link
            href="/transactions"
            className="text-sm transition-colors hover:text-white"
            style={{ color: "var(--text-muted)" }}
          >
            Все записи&nbsp;&rarr;
          </Link>
        </div>

        {transactions ? (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {transactions.map((tx) => {
              const d = new Date(tx.date);
              const dateStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
              const isIncome = tx.type === "INCOME";
              return (
                <li
                  key={tx.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tx.category.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                      {tx.description}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {tx.category.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                    {dateStr}
                  </span>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    style={{ color: isIncome ? "var(--accent-green)" : "var(--accent-red)" }}
                  >
                    {isIncome ? "" : "−"}{fmt.format(tx.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
  tag,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  tag?: React.ReactNode;
}) {
  return (
    <div className="glass-card-sm p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="text-xl font-bold tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      {tag && <div className="mt-1">{tag}</div>}
    </div>
  );
}
