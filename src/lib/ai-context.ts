/**
 * Текстовый финансовый контекст для системного промпта AI-ассистента.
 *
 * Агрегаты считаются так же, как в основном API: Prisma aggregate по Decimal,
 * Number() и round2 — только на выходе. Все даты — DateKey ("YYYY-MM-DD"),
 * границы Prisma-запросов — через dateKeyToUtc.
 */
import { prisma } from "@/lib/prisma";
import { TxType } from "@/generated/prisma/client";
import {
  addMonths,
  dateKeyToUtc,
  endOfMonthKey,
  monthKeyOf,
  startOfMonthKey,
  todayKey,
  utcDateToKey,
  type DateKey,
} from "@/lib/dates";
import { round2 } from "@/lib/money";

const MAX_OFFSET_MINUTES = 16 * 60;

/**
 * Смещение часового пояса клиента в минутах (семантика Date.getTimezoneOffset).
 * Принимает число или строку из заголовка; мусор → null.
 */
export function parseTimezoneOffset(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > MAX_OFFSET_MINUTES) return null;
  return Math.trunc(n);
}

/**
 * «Сегодня» по календарю пользователя: UTC-время минус offset даёт локальные
 * календарные компоненты (читаем их UTC-геттерами, чтобы не зависеть от
 * часового пояса сервера). Без offset — календарь сервера.
 */
export function resolveTodayKey(offsetMinutes: number | null | undefined): DateKey {
  if (offsetMinutes == null || !Number.isFinite(offsetMinutes)) return todayKey();
  return utcDateToKey(new Date(Date.now() - offsetMinutes * 60_000));
}

async function sumByType(type: TxType, from?: DateKey, to?: DateKey): Promise<number> {
  const r = await prisma.transaction.aggregate({
    where: {
      type,
      ...(from && to ? { date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) } } : {}),
    },
    _sum: { amount: true },
  });
  return round2(Number(r._sum.amount ?? 0));
}

const RECENT_TX_COUNT = 20;

export async function buildFinancialContext(today: DateKey = todayKey()): Promise<string> {
  const curFrom = startOfMonthKey(today);
  const curTo = endOfMonthKey(today);
  const prevFrom = addMonths(curFrom, -1);
  const prevTo = endOfMonthKey(prevFrom);

  const [
    categories,
    curIncome,
    curExpense,
    prevIncome,
    prevExpense,
    allTimeIncome,
    allTimeExpense,
    recentTx,
    topExpenses,
  ] = await Promise.all([
    prisma.category.findMany({
      include: { subcategories: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    }),
    sumByType("INCOME", curFrom, curTo),
    sumByType("EXPENSE", curFrom, curTo),
    sumByType("INCOME", prevFrom, prevTo),
    sumByType("EXPENSE", prevFrom, prevTo),
    sumByType("INCOME"),
    sumByType("EXPENSE"),
    prisma.transaction.findMany({
      include: { category: true, subcategory: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: RECENT_TX_COUNT,
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { type: "EXPENSE", date: { gte: dateKeyToUtc(curFrom), lte: dateKeyToUtc(curTo) } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c]));

  const catLines = categories.map((c) => {
    const subStr = c.subcategories.length
      ? ` [подкатегории: ${c.subcategories.map((s) => `${s.name}(id:${s.id})`).join(", ")}]`
      : "";
    return `- ${c.name} (${c.type}, id:${c.id})${subStr}`;
  });

  const topExpenseLines = topExpenses.map((t, i) => {
    const cat = catMap.get(t.categoryId);
    const total = round2(Number(t._sum.amount ?? 0));
    return `${i + 1}. ${cat?.name ?? "?"}: $${total.toFixed(2)}`;
  });

  const txLines = recentTx.map((t) => {
    const d = utcDateToKey(t.date);
    const sign = t.type === "INCOME" ? "+" : "-";
    const amount = round2(Number(t.amount));
    const original = round2(Number(t.originalAmount));
    const cur = t.currency !== "USD" ? ` (${original.toFixed(2)} ${t.currency})` : "";
    const sub = t.subcategory ? ` > ${t.subcategory.name}` : "";
    return `[id:${t.id}] ${d} | ${t.type} | ${sign}$${amount.toFixed(2)}${cur} | ${t.category.name}${sub} | ${t.description}`;
  });

  return `=== ФИНАНСОВЫЕ ДАННЫЕ BIZTRACKER ===

КАТЕГОРИИ:
${catLines.join("\n") || "Нет категорий"}

ТЕКУЩИЙ МЕСЯЦ (${monthKeyOf(curFrom)}):
- Доход: $${curIncome.toFixed(2)}
- Расход: $${curExpense.toFixed(2)}
- Прибыль: $${round2(curIncome - curExpense).toFixed(2)}

ПРОШЛЫЙ МЕСЯЦ (${monthKeyOf(prevFrom)}):
- Доход: $${prevIncome.toFixed(2)}
- Расход: $${prevExpense.toFixed(2)}
- Прибыль: $${round2(prevIncome - prevExpense).toFixed(2)}

ЗА ВСЁ ВРЕМЯ:
- Общий доход: $${allTimeIncome.toFixed(2)}
- Общий расход: $${allTimeExpense.toFixed(2)}
- Общая прибыль: $${round2(allTimeIncome - allTimeExpense).toFixed(2)}

ТОП РАСХОДОВ ЗА ТЕКУЩИЙ МЕСЯЦ:
${topExpenseLines.join("\n") || "Нет данных"}

ПОСЛЕДНИЕ ОПЕРАЦИИ (${recentTx.length} шт):
Дата | Тип | Сумма | Категория | Описание
${txLines.join("\n") || "Нет транзакций"}`;
}
