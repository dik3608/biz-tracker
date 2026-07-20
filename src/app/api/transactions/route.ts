import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, TxType } from "@/generated/prisma/client";
import {
  jsonError,
  parseBody,
  requireSession,
  serializeTransaction,
  transactionInputSchema,
  validateCategoryPair,
} from "@/lib/api-server";
import { dateKeyToUtc, isDateKey } from "@/lib/dates";
import { round2 } from "@/lib/money";

/** Собирает where-условие списка из query-параметров (общее для GET и итогов). */
function buildWhere(url: URLSearchParams): Prisma.TransactionWhereInput | NextResponse {
  const where: Prisma.TransactionWhereInput = {};

  const type = url.get("type");
  if (type) {
    if (type !== "INCOME" && type !== "EXPENSE") return jsonError("Некорректный type", 400);
    where.type = type as TxType;
  }

  const categoryId = url.get("categoryId");
  if (categoryId) where.categoryId = categoryId;

  const subcategoryId = url.get("subcategoryId");
  if (subcategoryId) where.subcategoryId = subcategoryId;

  const currency = url.get("currency");
  if (currency) {
    if (currency !== "USD" && currency !== "EUR") return jsonError("Некорректная currency", 400);
    where.currency = currency;
  }

  const from = url.get("from");
  const to = url.get("to");
  if (from || to) {
    if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
      return jsonError("Даты фильтра должны быть в формате YYYY-MM-DD", 400);
    }
    where.date = {};
    if (from) where.date.gte = dateKeyToUtc(from);
    if (to) where.date.lte = dateKeyToUtc(to);
  }

  const search = url.get("search")?.trim();
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { tags: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const url = req.nextUrl.searchParams;
  const where = buildWhere(url);
  if (where instanceof NextResponse) return where;

  const page = Math.max(1, Number(url.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.get("pageSize")) || 50));

  const sortParam = url.get("sort");
  const sort = sortParam === "amount" || sortParam === "created" ? sortParam : "date";
  const dir: Prisma.SortOrder = url.get("dir") === "asc" ? "asc" : "desc";
  const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
    sort === "amount"
      ? [{ amount: dir }, { date: "desc" }]
      : sort === "created"
        ? [{ createdAt: dir }]
        : [{ date: dir }, { createdAt: dir }];

  // Итоги считаются по тому же фильтру, что и список: при активном фильтре
  // типа сумма другого типа — ноль, а не сумма невидимых строк
  const [transactions, total, incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, subcategory: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    where.type === "EXPENSE"
      ? null
      : prisma.transaction.aggregate({
          where: { ...where, type: "INCOME" },
          _sum: { amount: true },
        }),
    where.type === "INCOME"
      ? null
      : prisma.transaction.aggregate({
          where: { ...where, type: "EXPENSE" },
          _sum: { amount: true },
        }),
  ]);

  const income = round2(Number(incomeAgg?._sum.amount ?? 0));
  const expense = round2(Number(expenseAgg?._sum.amount ?? 0));

  return NextResponse.json({
    transactions: transactions.map(serializeTransaction),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    totals: { income, expense, net: round2(income - expense) },
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { data, error } = await parseBody(req, transactionInputSchema);
  if (error) return error;

  const categoryError = await validateCategoryPair(data.type, data.categoryId, data.subcategoryId);
  if (categoryError) return categoryError;

  const rate = data.currency === "EUR" ? (data.exchangeRate ?? 0) : 1;
  if (data.currency === "EUR" && !(rate > 0)) {
    return jsonError("Для EUR необходим курс exchangeRate", 400);
  }
  const amountUsd = round2(data.amount * rate);

  const transaction = await prisma.transaction.create({
    data: {
      type: data.type,
      amount: new Prisma.Decimal(amountUsd.toFixed(2)),
      originalAmount: new Prisma.Decimal(data.amount.toFixed(2)),
      currency: data.currency,
      exchangeRate: new Prisma.Decimal(rate.toFixed(6)),
      description: data.description,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId ?? null,
      date: dateKeyToUtc(data.date),
      tags: (data.tags ?? []).join(","),
    },
    include: { category: true, subcategory: true },
  });

  return NextResponse.json(serializeTransaction(transaction), { status: 201 });
}
