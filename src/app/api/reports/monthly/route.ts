import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  enumerateMonthKeys,
  formatUtcDateKey,
  monthKeyFromDate,
  parseDateKey,
} from "@/lib/date-utils";
import { roundMoney } from "@/lib/money";

function fallbackRange(months: number) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
  return {
    from: formatUtcDateKey(from),
    to: formatUtcDateKey(now),
  };
}

async function resolveRange(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const allTime = params.get("allTime") === "true";
  const fromParam = params.get("from");
  const toParam = params.get("to");

  if (allTime) {
    const bounds = await prisma.transaction.aggregate({
      _min: { date: true },
      _max: { date: true },
    });
    const minDate = bounds._min.date;
    const maxDate = bounds._max.date;
    if (!minDate || !maxDate) {
      const today = formatUtcDateKey(new Date());
      return { from: today, to: today, allTime: true };
    }
    return {
      from: formatUtcDateKey(minDate),
      to: formatUtcDateKey(maxDate),
      allTime: true,
    };
  }

  if (fromParam && toParam) {
    return { from: fromParam, to: toParam, allTime: false };
  }

  const months = Math.min(60, Math.max(1, Number(params.get("months")) || 6));
  return { ...fallbackRange(months), allTime: false };
}

export async function GET(req: NextRequest) {
  const range = await resolveRange(req);
  const fromDate = parseDateKey(range.from);
  const toDate = parseDateKey(range.to);
  const monthKeys = enumerateMonthKeys(range.from, range.to);

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: fromDate, lte: toDate } },
    include: { category: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  const categoryBuckets = new Map<
    string,
    Map<string, { categoryId: string; categoryName: string; categoryColor: string; total: number }>
  >();

  for (const key of monthKeys) {
    buckets.set(key, { income: 0, expense: 0 });
    categoryBuckets.set(key, new Map());
  }

  for (const tx of transactions) {
    const key = monthKeyFromDate(tx.date);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const amt = Number(tx.amount);
    if (tx.type === "INCOME") {
      bucket.income += amt;
      continue;
    }

    bucket.expense += amt;
    const monthCategories = categoryBuckets.get(key);
    if (!monthCategories) continue;

    const existing = monthCategories.get(tx.categoryId);
    if (existing) {
      existing.total += amt;
    } else {
      monthCategories.set(tx.categoryId, {
        categoryId: tx.categoryId,
        categoryName: tx.category.name,
        categoryColor: tx.category.color,
        total: amt,
      });
    }
  }

  const rows = Array.from(buckets.entries()).map(([month, data]) => ({
    month,
    income: roundMoney(data.income),
    expense: roundMoney(data.expense),
    profit: roundMoney(data.income - data.expense),
  }));

  const categoryMonthly = Array.from(categoryBuckets.entries()).map(([month, data]) => ({
    month,
    categories: Array.from(data.values())
      .map((cat) => ({ ...cat, total: roundMoney(cat.total) }))
      .sort((a, b) => b.total - a.total),
  }));

  const totalIncome = roundMoney(rows.reduce((sum, row) => sum + row.income, 0));
  const totalExpense = roundMoney(rows.reduce((sum, row) => sum + row.expense, 0));
  const profit = roundMoney(totalIncome - totalExpense);
  const activeMonths = rows.filter((row) => row.income !== 0 || row.expense !== 0).length;
  const bestMonth = rows.reduce<(typeof rows)[number] | null>(
    (best, row) => (!best || row.profit > best.profit ? row : best),
    null,
  );
  const worstMonth = rows.reduce<(typeof rows)[number] | null>(
    (worst, row) => (!worst || row.profit < worst.profit ? row : worst),
    null,
  );

  return NextResponse.json({
    period: range,
    rows,
    categoryMonthly,
    totals: {
      income: totalIncome,
      expense: totalExpense,
      profit,
      margin: totalIncome > 0 ? roundMoney((profit / totalIncome) * 100) : null,
      averageIncome: activeMonths > 0 ? roundMoney(totalIncome / activeMonths) : 0,
      averageExpense: activeMonths > 0 ? roundMoney(totalExpense / activeMonths) : 0,
      activeMonths,
      bestMonth,
      worstMonth,
    },
  });
}
