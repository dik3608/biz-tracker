import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const months = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("months")) || 6));

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: from } },
    select: { type: true, amount: true, date: true },
  });

  const buckets = new Map<string, { income: number; expense: number }>();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const tx of transactions) {
    const d = tx.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const amt = Number(tx.amount);
    if (tx.type === "INCOME") bucket.income += amt;
    else bucket.expense += amt;
  }

  const result = Array.from(buckets.entries()).map(([month, data]) => ({
    month,
    income: Math.round(data.income * 100) / 100,
    expense: Math.round(data.expense * 100) / 100,
    profit: Math.round((data.income - data.expense) * 100) / 100,
  }));

  return NextResponse.json(result);
}
