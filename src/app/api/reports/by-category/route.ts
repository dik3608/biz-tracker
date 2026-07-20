import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";
import { dateKeyToUtc, isDateKey } from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { BreakdownResponse, CategoryBreakdownRow, TxType } from "@/lib/types";

/**
 * GET /api/reports/by-category?from=&to=
 * Разбивка обоих типов по категориям и подкатегориям за период,
 * с долями от итога своего типа. Без from/to — за всё время.
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
  if (from && to && from > to) {
    return jsonError("from не может быть позже to", 400);
  }

  const dateFilter =
    from && to ? { date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) } } : {};

  const [rows, categories] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId", "subcategoryId", "type"],
      where: dateFilter,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.category.findMany({ include: { subcategories: true } }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const subNameById = new Map(
    categories.flatMap((c) => c.subcategories.map((s) => [s.id, s.name] as const)),
  );

  const byCategory = new Map<
    string,
    { type: TxType; total: number; count: number; subs: Map<string | null, { total: number; count: number }> }
  >();

  for (const row of rows) {
    const entry =
      byCategory.get(row.categoryId) ??
      { type: row.type, total: 0, count: 0, subs: new Map() };
    const amount = Number(row._sum.amount ?? 0);
    entry.total += amount;
    entry.count += row._count._all;
    const sub = entry.subs.get(row.subcategoryId) ?? { total: 0, count: 0 };
    sub.total += amount;
    sub.count += row._count._all;
    entry.subs.set(row.subcategoryId, sub);
    byCategory.set(row.categoryId, entry);
  }

  const totals: Record<TxType, number> = { INCOME: 0, EXPENSE: 0 };
  for (const entry of byCategory.values()) totals[entry.type] += entry.total;

  const result: BreakdownResponse = { income: [], expense: [] };

  for (const [categoryId, entry] of byCategory) {
    const category = categoryById.get(categoryId);
    const row: CategoryBreakdownRow = {
      categoryId,
      name: category?.name ?? "Без категории",
      color: category?.color ?? "#667082",
      type: entry.type,
      total: round2(entry.total),
      share: totals[entry.type] > 0 ? round2((entry.total / totals[entry.type]) * 100) : 0,
      transactionCount: entry.count,
      subcategories: [...entry.subs.entries()]
        .map(([subcategoryId, s]) => ({
          subcategoryId,
          name: subcategoryId ? (subNameById.get(subcategoryId) ?? "—") : "Без подкатегории",
          total: round2(s.total),
          transactionCount: s.count,
        }))
        .sort((a, b) => b.total - a.total),
    };
    (entry.type === "INCOME" ? result.income : result.expense).push(row);
  }

  result.income.sort((a, b) => b.total - a.total);
  result.expense.sort((a, b) => b.total - a.total);

  return NextResponse.json(result);
}
