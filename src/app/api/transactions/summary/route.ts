import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";
import {
  dateKeyToUtc,
  isDateKey,
  previousComparableRange,
  todayKey,
  type DateRange,
  type PeriodPreset,
} from "@/lib/dates";
import { percentChange, round2 } from "@/lib/money";
import type { SummaryResponse } from "@/lib/types";

async function totalsFor(range: DateRange | null) {
  const dateFilter = range
    ? { date: { gte: dateKeyToUtc(range.from), lte: dateKeyToUtc(range.to) } }
    : {};
  const [incomeAgg, expenseAgg, count] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "INCOME", ...dateFilter },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "EXPENSE", ...dateFilter },
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: dateFilter }),
  ]);
  const income = round2(Number(incomeAgg._sum.amount ?? 0));
  const expense = round2(Number(expenseAgg._sum.amount ?? 0));
  return { income, expense, profit: round2(income - expense), count };
}

/**
 * GET /api/transactions/summary?from=&to=&preset=
 * Итоги периода + сравнение с сопоставимым прошлым периодом.
 * Без from/to — всё время (сравнения нет). preset уточняет,
 * как строить прошлое окно (месяц ↔ месяц, год ↔ год).
 */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const url = req.nextUrl.searchParams;
  const from = url.get("from");
  const to = url.get("to");

  if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
    return jsonError("Даты должны быть в формате YYYY-MM-DD", 400);
  }
  if ((from && !to) || (!from && to)) {
    return jsonError("Параметры from и to задаются вместе", 400);
  }
  if (from && to && from > to) {
    return jsonError("from не может быть позже to", 400);
  }

  const range: DateRange | null = from && to ? { from, to } : null;

  const KNOWN_PRESETS: PeriodPreset[] = [
    "today", "yesterday", "last7", "last30", "this_month",
    "last_month", "this_quarter", "this_year", "all_time", "custom",
  ];
  const presetParam = url.get("preset");
  const today = todayKey();
  // Пресету клиента доверяем как есть: он определяет только форму окна
  // сравнения. Сверка с серверным presetRange ломалась бы на стыке суток
  // из-за разницы часовых поясов клиента и сервера.
  const preset: PeriodPreset =
    range && presetParam && (KNOWN_PRESETS as string[]).includes(presetParam)
      ? (presetParam as PeriodPreset)
      : "custom";

  const current = await totalsFor(range);

  let previous: SummaryResponse["previous"] = null;
  let incomeChange: number | null = null;
  let expenseChange: number | null = null;
  let profitChange: number | null = null;

  if (range) {
    // Не сравниваем, если период ещё не начался или диапазон целиком в будущем
    const prevRange = previousComparableRange(preset, range, today);
    const prev = await totalsFor(prevRange);
    if (prev.count > 0) {
      previous = {
        income: prev.income,
        expense: prev.expense,
        profit: prev.profit,
        from: prevRange.from,
        to: prevRange.to,
      };
      incomeChange = percentChange(current.income, prev.income);
      expenseChange = percentChange(current.expense, prev.expense);
      profitChange =
        prev.profit !== 0 ? round2(((current.profit - prev.profit) / Math.abs(prev.profit)) * 100) : null;
    }
  }

  const body: SummaryResponse = {
    income: current.income,
    expense: current.expense,
    profit: current.profit,
    margin: current.income > 0 ? round2((current.profit / current.income) * 100) : null,
    transactionCount: current.count,
    previous,
    incomeChange,
    expenseChange,
    profitChange,
  };

  return NextResponse.json(body);
}
