import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";
import {
  dateKeyToUtc,
  enumerateMonths,
  isDateKey,
  monthKeyOf,
  utcDateToKey,
} from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { MonthlyReportRow } from "@/lib/types";

/**
 * GET /api/reports/monthly?from=&to=  (или ?months=N — последние N месяцев)
 * Помесячный P&L. Пустые месяцы внутри диапазона включаются нулями;
 * best/worst считаются только по месяцам, где были операции.
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
  if (from && to && from > to) {
    return jsonError("from не может быть позже to", 400);
  }

  const bounds = await prisma.transaction.aggregate({ _min: { date: true }, _max: { date: true } });
  if (!bounds._min.date || !bounds._max.date) {
    return NextResponse.json({ months: [], best: null, worst: null, totals: null });
  }
  const dataFrom = utcDateToKey(bounds._min.date);
  const dataTo = utcDateToKey(bounds._max.date);

  const monthsParam = Number(url.get("months"));
  if (!from || !to) {
    if (monthsParam > 0 && monthsParam <= 60) {
      const allMonths = enumerateMonths(dataFrom, dataTo);
      const lastMonths = allMonths.slice(-monthsParam);
      from = `${lastMonths[0]}-01`;
      to = dataTo;
    } else {
      from = dataFrom;
      to = dataTo;
    }
  }

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) } },
    select: { type: true, amount: true, date: true },
  });

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const m of enumerateMonths(from, to)) byMonth.set(m, { income: 0, expense: 0 });

  for (const t of txs) {
    const m = monthKeyOf(utcDateToKey(t.date));
    const entry = byMonth.get(m);
    if (!entry) continue;
    if (t.type === "INCOME") entry.income += Number(t.amount);
    else entry.expense += Number(t.amount);
  }

  const months: MonthlyReportRow[] = [...byMonth.entries()].map(([month, v]) => ({
    month,
    income: round2(v.income),
    expense: round2(v.expense),
    profit: round2(v.income - v.expense),
  }));

  const active = months.filter((m) => m.income !== 0 || m.expense !== 0);
  const best = active.length
    ? active.reduce((a, b) => (b.profit > a.profit ? b : a))
    : null;
  const worst = active.length
    ? active.reduce((a, b) => (b.profit < a.profit ? b : a))
    : null;

  const totals = months.reduce(
    (acc, m) => ({
      income: round2(acc.income + m.income),
      expense: round2(acc.expense + m.expense),
      profit: round2(acc.profit + m.profit),
    }),
    { income: 0, expense: 0, profit: 0 },
  );

  return NextResponse.json({ months, best, worst, totals });
}
