import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const from = url.get("from") ? new Date(url.get("from")!) : startOfMonth(now);
  const to = url.get("to") ? new Date(url.get("to")!) : endOfMonth(now);

  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = new Date(from.getTime() - 1);

  const [totalIncome, totalExpense, prevIncome, prevExpense] = await Promise.all([
    sumByType(from, to, "INCOME"),
    sumByType(from, to, "EXPENSE"),
    sumByType(prevFrom, prevTo, "INCOME"),
    sumByType(prevFrom, prevTo, "EXPENSE"),
  ]);

  return NextResponse.json({
    totalIncome,
    totalExpense,
    profit: totalIncome - totalExpense,
    prevIncome,
    prevExpense,
    incomeChange: pctChange(totalIncome, prevIncome),
    expenseChange: pctChange(totalExpense, prevExpense),
  });
}
