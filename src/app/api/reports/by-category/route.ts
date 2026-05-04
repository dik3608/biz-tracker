import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TxType } from "@/generated/prisma/client";
import { formatUtcDateKey, parseDateKey } from "@/lib/date-utils";
import { roundMoney } from "@/lib/money";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;

  const now = new Date();
  let from = url.get("from") ? parseDateKey(url.get("from")!) : startOfMonth(now);
  let to = url.get("to") ? parseDateKey(url.get("to")!) : endOfMonth(now);
  const type: TxType = url.get("type") === "INCOME" ? "INCOME" : "EXPENSE";

  if (url.get("allTime") === "true") {
    const bounds = await prisma.transaction.aggregate({
      where: { type },
      _min: { date: true },
      _max: { date: true },
    });
    from = bounds._min.date ?? parseDateKey(formatUtcDateKey(now));
    to = bounds._max.date ?? parseDateKey(formatUtcDateKey(now));
  }

  const transactions = await prisma.transaction.findMany({
    where: { type, date: { gte: from, lte: to } },
    include: { category: true },
  });

  const map = new Map<string, { name: string; color: string; total: number }>();

  for (const tx of transactions) {
    const existing = map.get(tx.categoryId);
    const amt = Number(tx.amount);
    if (existing) {
      existing.total += amt;
    } else {
      map.set(tx.categoryId, {
        name: tx.category.name,
        color: tx.category.color,
        total: amt,
      });
    }
  }

  const grandTotal = Array.from(map.values()).reduce((s, v) => s + v.total, 0);

  const result = Array.from(map.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.name,
      categoryColor: data.color,
      total: roundMoney(data.total),
      percentage: grandTotal > 0 ? roundMoney((data.total / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json(result);
}
