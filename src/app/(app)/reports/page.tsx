"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PeriodPicker, usePeriod } from "@/components/ui/PeriodPicker";
import { CategoryDot, EmptyState, Skeleton } from "@/components/ui/misc";
import { errorMessage, useToast } from "@/components/ui/Toast";
import { TrendChart } from "@/components/charts/TrendChart";
import { Donut, type DonutSlice } from "@/components/charts/Donut";
import { BarList } from "@/components/charts/BarList";
import { apiDownload, apiGet } from "@/lib/api-client";
import { formatMonth } from "@/lib/dates";
import { formatMoney, formatPercent, formatSigned, round2 } from "@/lib/money";
import type {
  BreakdownResponse,
  CategoryBreakdownRow,
  MonthlyReportRow,
  SeriesResponse,
} from "@/lib/types";

const OTHER_COLOR = "#667082";

// ---------- Загрузка с защитой от гонок ----------

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Запрос с тремя состояниями и guard'ом от гонок: применяется только ответ
 * последнего запуска. key — строка параметров; её смена перезапускает запрос.
 * Возвращает состояние и «Повторить».
 */
function useLoad<T>(fetcher: () => Promise<T>, key: string): [LoadState<T>, () => void] {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const counterRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(() => {
    const requestId = ++counterRef.current;
    setState((prev) => (prev.status === "loading" ? prev : { status: "loading" }));
    fetcherRef.current().then(
      (data) => {
        if (requestId !== counterRef.current) return;
        setState({ status: "ready", data });
      },
      (e) => {
        if (requestId !== counterRef.current) return;
        setState({ status: "error", message: errorMessage(e) });
      },
    );
  }, []);

  useEffect(() => {
    // Перезапуск запроса при смене параметров — setState после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
  }, [run, key]);

  return [state, run];
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="max-w-sm text-[13px] text-ink-2">{message}</p>
      <Button size="sm" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

// ---------- Типы ответов ----------

interface MonthlyResponse {
  months: MonthlyReportRow[];
  best: MonthlyReportRow | null;
  worst: MonthlyReportRow | null;
  totals: { income: number; expense: number; profit: number } | null;
}

type Tab = "trend" | "categories";
type Granularity = "auto" | "day" | "week" | "month";

/** Маржа из готовых серверных чисел; null → «—». */
function marginOf(income: number, profit: number): number | null {
  return income > 0 ? (profit / income) * 100 : null;
}

// ---------- Страница ----------

export default function ReportsPage() {
  const { toast } = useToast();
  const [period, setPeriod] = usePeriod("reports-period");
  const [tab, setTab] = useState<Tab>("trend");
  const [granularity, setGranularity] = useState<Granularity>("auto");

  const from = period.range?.from ?? null;
  const to = period.range?.to ?? null;

  const [seriesState, retrySeries] = useLoad<SeriesResponse>(
    () => apiGet("/api/transactions/series", { from, to, granularity }),
    `${from}|${to}|${granularity}`,
  );
  const [monthlyState, retryMonthly] = useLoad<MonthlyResponse>(
    () => apiGet("/api/reports/monthly", { from, to }),
    `${from}|${to}`,
  );
  const [breakdownState, retryBreakdown] = useLoad<BreakdownResponse>(
    () => apiGet("/api/reports/by-category", { from, to }),
    `${from}|${to}`,
  );

  // ---------- Экспорт ----------

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  const downloadExport = async (format: "xlsx" | "csv") => {
    setExportOpen(false);
    try {
      await apiDownload("/api/export", {
        format,
        from: period.range?.from,
        to: period.range?.to,
      });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Отчёты</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <div ref={exportRef} className="relative">
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              Экспорт
              <ChevronDown
                size={14}
                className={clsx("text-ink-3 transition-transform", exportOpen && "rotate-180")}
              />
            </Button>
            {exportOpen ? (
              <div className="anim-pop absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-card border border-edge-strong bg-surface py-1.5 shadow-2xl shadow-black/50">
                <button
                  onClick={() => downloadExport("xlsx")}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <FileSpreadsheet size={14} className="text-ink-3" />
                  Excel (.xlsx)
                </button>
                <button
                  onClick={() => downloadExport("csv")}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <FileText size={14} className="text-ink-3" />
                  CSV
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <SegmentedControl<Tab>
        options={[
          { value: "trend", label: "Динамика" },
          { value: "categories", label: "Категории" },
        ]}
        value={tab}
        onChange={setTab}
        className="self-start"
      />

      {tab === "trend" ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Динамика"
              actions={
                <SegmentedControl<Granularity>
                  size="sm"
                  options={[
                    { value: "auto", label: "Авто" },
                    { value: "day", label: "Дни" },
                    { value: "week", label: "Недели" },
                    { value: "month", label: "Месяцы" },
                  ]}
                  value={granularity}
                  onChange={setGranularity}
                />
              }
            />
            <div className="px-5 pb-5">
              {seriesState.status === "loading" ? (
                <Skeleton className="h-[300px]" />
              ) : seriesState.status === "error" ? (
                <LoadError message={seriesState.message} onRetry={retrySeries} />
              ) : seriesState.data.points.length === 0 ? (
                <EmptyState title="Нет операций за период" hint="Измените период или добавьте операции." />
              ) : (
                <TrendChart
                  points={seriesState.data.points}
                  granularity={seriesState.data.granularity}
                  height={300}
                />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="По месяцам" />
            {monthlyState.status === "loading" ? (
              <div className="flex flex-col gap-2 px-5 pb-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : monthlyState.status === "error" ? (
              <div className="px-5 pb-5">
                <LoadError message={monthlyState.message} onRetry={retryMonthly} />
              </div>
            ) : monthlyState.data.months.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState title="Нет данных за период" hint="Измените период или добавьте операции." />
              </div>
            ) : (
              <MonthlyTable data={monthlyState.data} />
            )}
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Расходы" />
            <div className="px-5 pb-5">
              {breakdownState.status === "loading" ? (
                <ExpenseSkeleton />
              ) : breakdownState.status === "error" ? (
                <LoadError message={breakdownState.message} onRetry={retryBreakdown} />
              ) : breakdownState.data.expense.length === 0 ? (
                <EmptyState title="Нет расходов за период" />
              ) : (
                <ExpenseBreakdown rows={breakdownState.data.expense} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Доходы" />
            <div className="px-5 pb-5">
              {breakdownState.status === "loading" ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9" />
                  ))}
                </div>
              ) : breakdownState.status === "error" ? (
                <LoadError message={breakdownState.message} onRetry={retryBreakdown} />
              ) : breakdownState.data.income.length === 0 ? (
                <EmptyState title="Нет доходов за период" />
              ) : (
                <BarList
                  rows={breakdownState.data.income.map((r) => ({
                    key: r.categoryId,
                    label: r.name,
                    color: r.color,
                    value: r.total,
                    share: r.share,
                    hint: `${r.transactionCount} оп.`,
                  }))}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- Таблица «По месяцам» ----------

function MonthlyTable({ data }: { data: MonthlyResponse }) {
  const { months, best, worst, totals } = data;
  const showWorst = worst !== null && worst.profit < 0 && worst.month !== best?.month;

  return (
    <div className="overflow-x-auto pb-1">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-edge text-[12px] text-ink-3">
            <th className="px-5 py-2.5 text-left font-medium">Месяц</th>
            <th className="px-3 py-2.5 text-right font-medium">Доход</th>
            <th className="px-3 py-2.5 text-right font-medium">Расход</th>
            <th className="px-3 py-2.5 text-right font-medium">Прибыль</th>
            <th className="px-5 py-2.5 text-right font-medium">Маржа</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => {
            const active = row.income !== 0 || row.expense !== 0;
            const isBest = active && best !== null && row.month === best.month;
            const isWorst = active && showWorst && row.month === worst.month;
            return (
              <tr
                key={row.month}
                className={clsx("border-b border-edge/60", isBest && "bg-income/5")}
              >
                <td className={clsx("px-5 py-2.5", active ? "text-ink" : "text-ink-3")}>
                  <span className="inline-flex items-center gap-2">
                    {formatMonth(row.month)}
                    {isBest ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-income/15 px-1.5 py-0.5 text-[11px] font-medium text-income">
                        ▲ лучший
                      </span>
                    ) : null}
                    {isWorst ? (
                      <span className="rounded-full bg-expense/15 px-1.5 py-0.5 text-[11px] font-medium text-expense">
                        худший
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={clsx("tnum px-3 py-2.5 text-right", active ? "text-income" : "text-ink-3")}>
                  {formatMoney(row.income)}
                </td>
                <td className={clsx("tnum px-3 py-2.5 text-right", active ? "text-ink" : "text-ink-3")}>
                  {formatMoney(row.expense)}
                </td>
                <td
                  className={clsx(
                    "tnum px-3 py-2.5 text-right font-medium",
                    !active
                      ? "text-ink-3"
                      : row.profit > 0
                        ? "text-income"
                        : row.profit < 0
                          ? "text-expense"
                          : "text-ink-2",
                  )}
                >
                  {formatSigned(row.profit)}
                </td>
                <td className={clsx("tnum px-5 py-2.5 text-right", active ? "text-ink-2" : "text-ink-3")}>
                  {formatPercent(marginOf(row.income, row.profit))}
                </td>
              </tr>
            );
          })}
        </tbody>
        {totals ? (
          <tfoot>
            <tr className="border-t border-edge-strong font-semibold text-ink">
              <td className="px-5 py-3">Итого</td>
              <td className="tnum px-3 py-3 text-right text-income">{formatMoney(totals.income)}</td>
              <td className="tnum px-3 py-3 text-right">{formatMoney(totals.expense)}</td>
              <td
                className={clsx(
                  "tnum px-3 py-3 text-right",
                  totals.profit > 0 ? "text-income" : totals.profit < 0 ? "text-expense" : "text-ink-2",
                )}
              >
                {formatSigned(totals.profit)}
              </td>
              <td className="tnum px-5 py-3 text-right text-ink-2">
                {formatPercent(marginOf(totals.income, totals.profit))}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ---------- Разбивка расходов ----------

function ExpenseSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="mx-auto h-[190px] w-[190px] rounded-full" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    </div>
  );
}

function ExpenseBreakdown({ rows }: { rows: CategoryBreakdownRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { slices, total } = useMemo(() => {
    // Сервер уже отсортировал по убыванию суммы
    const top = rows.slice(0, 7);
    const rest = rows.slice(7);
    const result: DonutSlice[] = top.map((r) => ({
      key: r.categoryId,
      label: r.name,
      value: r.total,
      color: r.color,
    }));
    if (rest.length > 0) {
      result.push({
        key: "__other",
        label: "Прочее",
        value: round2(rest.reduce((sum, r) => sum + r.total, 0)),
        color: OTHER_COLOR,
      });
    }
    return { slices: result, total: round2(rows.reduce((sum, r) => sum + r.total, 0)) };
  }, [rows]);

  return (
    <div>
      <Donut slices={slices} centerLabel="Расходы" centerValue={total} />
      <div className="mt-4 flex flex-col">
        {rows.map((row) => (
          <ExpenseCategoryRow
            key={row.categoryId}
            row={row}
            expanded={expanded.has(row.categoryId)}
            onToggle={() => toggle(row.categoryId)}
          />
        ))}
      </div>
    </div>
  );
}

function ExpenseCategoryRow({
  row,
  expanded,
  onToggle,
}: {
  row: CategoryBreakdownRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const expandable = row.subcategories.some((s) => s.subcategoryId !== null);

  const head = (
    <>
      {expandable ? (
        <ChevronRight
          size={14}
          className={clsx("shrink-0 text-ink-3 transition-transform", expanded && "rotate-90")}
        />
      ) : (
        <span aria-hidden className="w-3.5 shrink-0" />
      )}
      <CategoryDot color={row.color} />
      <span className="min-w-0 truncate text-ink">{row.name}</span>
      <span className="tnum ml-auto shrink-0 text-ink-2">
        {formatMoney(row.total)}
        <span className="ml-1.5 text-[11.5px] text-ink-3">{formatPercent(row.share, 0)}</span>
      </span>
    </>
  );

  return (
    <div className="border-b border-edge/60 last:border-0">
      {expandable ? (
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2 rounded-[8px] px-1 py-2.5 text-left text-[13px] transition-colors hover:bg-surface-2"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1 py-2.5 text-[13px]">{head}</div>
      )}
      {expandable && expanded ? (
        <div className="flex flex-col gap-1.5 pb-2.5 pl-9 pr-1">
          {row.subcategories.map((s) => (
            <div key={s.subcategoryId ?? "__none"} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-2">{s.name}</span>
              <span className="tnum ml-auto shrink-0 text-ink-2">
                {formatMoney(s.total)}
                <span className="ml-1.5 text-[11.5px] text-ink-3">{s.transactionCount} оп.</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
