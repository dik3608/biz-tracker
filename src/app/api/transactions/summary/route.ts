import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatUtcDateKey, parseDateKey } from "@/lib/date-utils";
import { roundMoney } from "@/lib/money";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

async function sumByType(from: Date, to: Date, type: "INCOME" | "EXPENSE") {
  const result = await prisma.transaction.aggregate({
    where: { type, date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;

  const now = new Date();
  let from = url.get("from") ? parseDateKey(url.get("from")!) : startOfMonth(now);
  let to = url.get("to") ? parseDateKey(url.get("to")!) : endOfMonth(now);
  const allTime = url.get("allTime") === "true";

  if (allTime) {
    const bounds = await prisma.transaction.aggregate({
      _min: { date: true },
      _max: { date: true },
    });
    from = bounds._min.date ?? parseDateKey(formatUtcDateKey(now));
    to = bounds._max.date ?? parseDateKey(formatUtcDateKey(now));
  }

  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = new Date(from.getTime() - 1);

  const [totalIncome, totalExpense, prevIncome, prevExpense] = await Promise.all([
    sumByType(from, to, "INCOME"),
    sumByType(from, to, "EXPENSE"),
    allTime ? Promise.resolve(0) : sumByType(prevFrom, prevTo, "INCOME"),
    allTime ? Promise.resolve(0) : sumByType(prevFrom, prevTo, "EXPENSE"),
  ]);

  return NextResponse.json({
    totalIncome: roundMoney(totalIncome),
    totalExpense: roundMoney(totalExpense),
    profit: roundMoney(totalIncome - totalExpense),
    prevIncome,
    prevExpense,
    incomeChange: allTime ? 0 : pctChange(totalIncome, prevIncome),
    expenseChange: allTime ? 0 : pctChange(totalExpense, prevExpense),
    period: {
      from: formatUtcDateKey(from),
      to: formatUtcDateKey(to),
      allTime,
    },
  });
}
