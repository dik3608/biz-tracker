import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TxType } from "@/generated/prisma/client";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;

  const now = new Date();
  const from = url.get("from") ? new Date(url.get("from")!) : startOfMonth(now);
  const to = url.get("to") ? new Date(url.get("to")!) : endOfMonth(now);
  const type: TxType = url.get("type") === "INCOME" ? "INCOME" : "EXPENSE";

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
      total: Math.round(data.total * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json(result);
}
