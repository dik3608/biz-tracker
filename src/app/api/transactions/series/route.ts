import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";
import {
  dateKeyToUtc,
  diffDays,
  enumerateDays,
  enumerateMonths,
  isDateKey,
  monthKeyOf,
  startOfWeekKey,
  utcDateToKey,
  type DateKey,
} from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { SeriesGranularity, SeriesPoint, SeriesResponse } from "@/lib/types";

/**
 * GET /api/transactions/series?from=&to=&granularity=day|week|month|auto
 * Ряд доход/расход/прибыль по корзинам для графика динамики.
 * Пустые корзины включаются нулями, чтобы ось времени была непрерывной.
 * Без from/to — по границам имеющихся данных, помесячно.
 */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const url = req.nextUrl.searchParams;
  let from = url.get("from");
  let to = url.get("to");

  if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
    return jsonError("Даты должны быть в формате YYYY-MM-DD", 400);
  }
  if ((from && !to) || (!from && to)) {
    return jsonError("Параметры from и to задаются вместе", 400);
  }
  if (from && to && from > to) {
    return jsonError("from не может быть позже to", 400);
  }

  if (!from || !to) {
    const bounds = await prisma.transaction.aggregate({ _min: { date: true }, _max: { date: true } });
    if (!bounds._min.date || !bounds._max.date) {
      return NextResponse.json({ granularity: "month", points: [] } satisfies SeriesResponse);
    }
    from = utcDateToKey(bounds._min.date);
    to = utcDateToKey(bounds._max.date);
  }

  const spanDays = diffDays(from, to) + 1;
  const requested = url.get("granularity");
  let granularity: SeriesGranularity;
  if (requested === "day" || requested === "week" || requested === "month") {
    granularity = requested;
  } else {
    // auto: до 31 дня — по дням, до ~4 месяцев — по неделям, дальше — по месяцам
    granularity = spanDays <= 31 ? "day" : spanDays <= 124 ? "week" : "month";
  }
  // Защита от многотысячных рядов при granularity=day на «всё время»
  if (granularity === "day" && spanDays > 400) granularity = "month";
  if (granularity === "week" && spanDays > 800) granularity = "month";

  const rows = await prisma.transaction.findMany({
    where: { date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) } },
    select: { type: true, amount: true, date: true },
  });

  const bucketOf = (key: DateKey): DateKey =>
    granularity === "day" ? key : granularity === "week" ? startOfWeekKey(key) : `${monthKeyOf(key)}-01`;

  const buckets = new Map<DateKey, { income: number; expense: number }>();
  // Полная ось: каждая корзина периода присутствует, даже пустая
  if (granularity === "month") {
    for (const m of enumerateMonths(from, to)) buckets.set(`${m}-01`, { income: 0, expense: 0 });
  } else if (granularity === "week") {
    for (let k = startOfWeekKey(from); k <= to; k = utcDateToKey(new Date(dateKeyToUtc(k).getTime() + 7 * 86_400_000))) {
      buckets.set(k, { income: 0, expense: 0 });
    }
  } else {
    for (const d of enumerateDays(from, to)) buckets.set(d, { income: 0, expense: 0 });
  }

  for (const row of rows) {
    const bucket = bucketOf(utcDateToKey(row.date));
    const entry = buckets.get(bucket);
    if (!entry) continue;
    if (row.type === "INCOME") entry.income += Number(row.amount);
    else entry.expense += Number(row.amount);
  }

  const points: SeriesPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([bucket, v]) => ({
      bucket,
      income: round2(v.income),
      expense: round2(v.expense),
      profit: round2(v.income - v.expense),
    }));

  return NextResponse.json({ granularity, points } satisfies SeriesResponse);
}
