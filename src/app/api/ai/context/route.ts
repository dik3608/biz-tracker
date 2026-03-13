import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

async function sumByType(from: Date, to: Date, type: "INCOME" | "EXPENSE") {
  const r = await prisma.transaction.aggregate({
    where: { type, date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return Number(r._sum.amount ?? 0);
}

export async function GET() {
  const now = new Date();
  const curFrom = startOfMonth(now);
  const curTo = endOfMonth(now);
  const prevFrom = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevTo = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const [
    categories,
    curIncome,
    curExpense,
    prevIncome,
    prevExpense,
    allTimeIncome,
    allTimeExpense,
    transactions,
  ] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] }),
    sumByType(curFrom, curTo, "INCOME"),
    sumByType(curFrom, curTo, "EXPENSE"),
    sumByType(prevFrom, prevTo, "INCOME"),
    sumByType(prevFrom, prevTo, "EXPENSE"),
    sumByType(new Date("2000-01-01"), new Date("2099-12-31"), "INCOME"),
    sumByType(new Date("2000-01-01"), new Date("2099-12-31"), "EXPENSE"),
    prisma.transaction.findMany({
      where: { date: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } },
      include: { category: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const topExpenses = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { type: "EXPENSE", date: { gte: curFrom, lte: curTo } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 10,
  });

  const catMap = new Map(categories.map((c) => [c.id, c]));

  const topExpenseLines = topExpenses.map((t, i) => {
    const cat = catMap.get(t.categoryId);
    return `${i + 1}. ${cat?.name ?? "?"}: $${Number(t._sum.amount).toFixed(2)}`;
  });

  const txLines = transactions.map((t) => {
    const d = t.date.toISOString().split("T")[0];
    const sign = t.type === "INCOME" ? "+" : "-";
    const cur = t.currency !== "USD" ? ` (${Number(t.originalAmount).toFixed(2)} ${t.currency})` : "";
    return `${d} | ${t.type} | ${sign}$${Number(t.amount).toFixed(2)}${cur} | ${t.category.name} | ${t.description}`;
  });

  const catLines = categories.map(
    (c) => `- ${c.name} (${c.type}, slug: ${c.slug})`
  );

  const text = `=== ФИНАНСОВЫЕ ДАННЫЕ BIZTRACKER ===

КАТЕГОРИИ:
${catLines.join("\n")}

ТЕКУЩИЙ МЕСЯЦ (${curFrom.toISOString().slice(0, 7)}):
- Доход: $${curIncome.toFixed(2)}
- Расход: $${curExpense.toFixed(2)}
- Прибыль: $${(curIncome - curExpense).toFixed(2)}

ПРОШЛЫЙ МЕСЯЦ (${prevFrom.toISOString().slice(0, 7)}):
- Доход: $${prevIncome.toFixed(2)}
- Расход: $${prevExpense.toFixed(2)}
- Прибыль: $${(prevIncome - prevExpense).toFixed(2)}

ЗА ВСЁ ВРЕМЯ:
- Общий доход: $${allTimeIncome.toFixed(2)}
- Общий расход: $${allTimeExpense.toFixed(2)}
- Общая прибыль: $${(allTimeIncome - allTimeExpense).toFixed(2)}

ТОП РАСХОДОВ ЗА ТЕКУЩИЙ МЕСЯЦ:
${topExpenseLines.join("\n") || "Нет данных"}

ВСЕ ТРАНЗАКЦИИ (последние 12 месяцев, ${transactions.length} шт):
Дата | Тип | Сумма | Категория | Описание
${txLines.join("\n") || "Нет транзакций"}`;

  return NextResponse.json({ context: text });
}
