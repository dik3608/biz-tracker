"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { PeriodPicker, usePeriod } from "@/components/ui/PeriodPicker";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { CategoryBadge, EmptyState, Skeleton, TxAmount } from "@/components/ui/misc";
import { errorMessage } from "@/components/ui/Toast";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarList, type BarListRow } from "@/components/charts/BarList";
import { apiGet } from "@/lib/api-client";
import { formatDayHuman, todayKey } from "@/lib/dates";
import { formatMoneyWhole, formatPercent } from "@/lib/money";
import type {
  BreakdownResponse,
  CategoryBreakdownRow,
  SeriesResponse,
  SummaryResponse,
  TransactionListResponse,
} from "@/lib/types";

/** Цвет агрегированной строки «Прочее» в списках долей. */
const OTHER_COLOR = "#667082";

type GranularityChoice = "auto" | "day" | "week" | "month";

const GRANULARITY_OPTIONS: { value: GranularityChoice; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "day", label: "Дни" },
  { value: "week", label: "Недели" },
  { value: "month", label: "Месяцы" },
];

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Загрузка одного блока дашборда: перезапуск при смене deps,
 * гонки гасятся counter-guard'ом, retry перезапускает только этот запрос.
 */
function useQuery<T>(load: () => Promise<T>, deps: unknown[]): QueryState<T> & { retry: () => void } {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });
  const counterRef = useRef(0);

  const run = useCallback(() => {
    const requestId = ++counterRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => {
        if (requestId !== counterRef.current) return;
        setState({ data, loading: false, error: null });
      },
      (e: unknown) => {
        if (requestId !== counterRef.current) return;
        setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, retry: run };
}

/** Ошибка загрузки блока: текст + кнопка перезапуска только этого запроса. */
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="max-w-sm text-[13px] text-ink-2">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

/** Топ-6 категорий + агрегированная строка «Прочее» для остальных. */
function toBarRows(rows: CategoryBreakdownRow[]): BarListRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);

  const result: BarListRow[] = top.map((r) => ({
    key: r.categoryId,
    label: r.name,
    color: r.color,
    value: r.total,
    share: r.share,
    hint: `${r.transactionCount} оп.`,
  }));

  if (rest.length > 0) {
    result.push({
      key: "__other__",
      label: "Прочее",
      color: OTHER_COLOR,
      value: rest.reduce((sum, r) => sum + r.total, 0),
      share: rest.reduce((sum, r) => sum + r.share, 0),
      hint: `${rest.reduce((sum, r) => sum + r.transactionCount, 0)} оп.`,
    });
  }

  return result;
}

function BarListSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <Skeleton className="mt-2 h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = usePeriod("dashboard-period");
  const [granularity, setGranularity] = useState<GranularityChoice>("auto");

  const range = period.range;
  const from = range?.from;
  const to = range?.to;
  const today = todayKey();

  const summaryQ = useQuery(
    () =>
      apiGet<SummaryResponse>(
        "/api/transactions/summary",
        range ? { from, to, preset: period.preset } : undefined,
      ),
    [from, to, period.preset],
  );

  const seriesQ = useQuery(
    () =>
      apiGet<SeriesResponse>("/api/transactions/series", {
        ...(range ? { from, to } : null),
        granularity,
      }),
    [from, to, granularity],
  );

  const breakdownQ = useQuery(
    () =>
      apiGet<BreakdownResponse>(
        "/api/reports/by-category",
        range ? { from, to } : undefined,
      ),
    [from, to],
  );

  const recentQ = useQuery(
    () =>
      apiGet<TransactionListResponse>("/api/transactions", {
        ...(range ? { from, to } : null),
        pageSize: 8,
        sort: "date",
        dir: "desc",
      }),
    [from, to],
  );

  const summary = summaryQ.data;
  const nothingInPeriod = summary !== null && summary.transactionCount === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Шапка */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Обзор</h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {/* KPI-ряд */}
      {summaryQ.error ? (
        <Card>
          <LoadError message={summaryQ.error} onRetry={summaryQ.retry} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Доход"
            value={summary ? formatMoneyWhole(summary.income) : ""}
            tone="income"
            change={summary?.incomeChange}
            changeHint="к прошлому периоду"
            loading={summaryQ.loading}
          />
          <StatCard
            label="Расход"
            value={summary ? formatMoneyWhole(summary.expense) : ""}
            tone="expense"
            change={summary?.expenseChange}
            changeHint="к прошлому периоду"
            upIsGood={false}
            loading={summaryQ.loading}
          />
          <StatCard
            label="Прибыль"
            value={summary ? formatMoneyWhole(summary.profit) : ""}
            change={summary?.profitChange}
            changeHint="к прошлому периоду"
            loading={summaryQ.loading}
          />
          <StatCard
            label="Маржа"
            value={summary ? formatPercent(summary.margin) : ""}
            sub={summary ? `${summary.transactionCount} операций` : undefined}
            loading={summaryQ.loading}
          />
        </div>
      )}

      {nothingInPeriod ? (
        <Card>
          <EmptyState
            title="Нет операций за выбранный период"
            hint="Добавьте первую операцию или выберите другой период."
            action={
              <Link
                href="/add"
                className="inline-flex h-9 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                <Plus size={16} />
                Добавить операцию
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Динамика */}
          <Card>
            <CardHeader
              title="Динамика"
              actions={
                <SegmentedControl
                  size="sm"
                  options={GRANULARITY_OPTIONS}
                  value={granularity}
                  onChange={setGranularity}
                />
              }
            />
            <div className="px-5 pb-4">
              {seriesQ.loading ? (
                <Skeleton className="h-[260px] w-full" />
              ) : seriesQ.error ? (
                <LoadError message={seriesQ.error} onRetry={seriesQ.retry} />
              ) : seriesQ.data && seriesQ.data.points.length > 0 ? (
                <TrendChart points={seriesQ.data.points} granularity={seriesQ.data.granularity} />
              ) : (
                <p className="py-10 text-center text-[13px] text-ink-3">Нет данных за период</p>
              )}
            </div>
          </Card>

          {/* Структура расходов и источники дохода */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Структура расходов" />
              <div className="px-5 pb-4">
                {breakdownQ.loading ? (
                  <BarListSkeleton />
                ) : breakdownQ.error ? (
                  <LoadError message={breakdownQ.error} onRetry={breakdownQ.retry} />
                ) : (
                  <BarList rows={toBarRows(breakdownQ.data?.expense ?? [])} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Источники дохода" />
              <div className="px-5 pb-4">
                {breakdownQ.loading ? (
                  <BarListSkeleton />
                ) : breakdownQ.error ? (
                  <LoadError message={breakdownQ.error} onRetry={breakdownQ.retry} />
                ) : (
                  <BarList rows={toBarRows(breakdownQ.data?.income ?? [])} />
                )}
              </div>
            </Card>
          </div>

          {/* Последние операции */}
          <Card>
            <CardHeader
              title="Последние операции"
              actions={
                <Link
                  href="/transactions"
                  className="inline-flex h-8 items-center gap-1 rounded-control px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  Все операции
                  <ArrowRight size={14} />
                </Link>
              }
            />
            {recentQ.loading ? (
              <div className="flex flex-col gap-3 px-5 pb-5 pt-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : recentQ.error ? (
              <LoadError message={recentQ.error} onRetry={recentQ.retry} />
            ) : recentQ.data && recentQ.data.transactions.length > 0 ? (
              <ul className="divide-y divide-edge border-t border-edge">
                {recentQ.data.transactions.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-24 shrink-0 text-[12.5px] text-ink-3">
                      {formatDayHuman(tx.date, today)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                      {tx.description}
                    </span>
                    <span className="hidden shrink-0 sm:inline-flex">
                      <CategoryBadge name={tx.category.name} color={tx.category.color} />
                    </span>
                    <TxAmount
                      type={tx.type}
                      amount={tx.amount}
                      originalAmount={tx.originalAmount}
                      currency={tx.currency}
                      className="ml-auto shrink-0 text-[13.5px]"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Нет операций за выбранный период"
                action={
                  <Link
                    href="/add"
                    className="inline-flex h-9 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                  >
                    <Plus size={16} />
                    Добавить операцию
                  </Link>
                }
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
