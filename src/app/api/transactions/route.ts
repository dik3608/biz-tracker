import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, TxType } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;

  const type = url.get("type") as TxType | null;
  const categoryId = url.get("categoryId");
  const from = url.get("from");
  const to = url.get("to");
  const search = url.get("search");
  const page = Math.max(1, Number(url.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.get("limit")) || 50));

  const where: Prisma.TransactionWhereInput = {};

  if (type && (type === "INCOME" || type === "EXPENSE")) {
    where.type = type;
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  if (search) {
    where.description = { contains: search, mode: "insensitive" };
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, subcategory: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
      originalAmount: Number(t.originalAmount),
      exchangeRate: Number(t.exchangeRate),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, amount, description, categoryId, subcategoryId, date, tags, currency, exchangeRate } = body;

  if (!type || !amount || !description || !categoryId || !date) {
    return NextResponse.json(
      { error: "Поля type, amount, description, categoryId и date обязательны" },
      { status: 400 },
    );
  }

  if (type !== "INCOME" && type !== "EXPENSE") {
    return NextResponse.json(
      { error: "type должен быть INCOME или EXPENSE" },
      { status: 400 },
    );
  }

  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount должен быть положительным числом" },
      { status: 400 },
    );
  }

  const cur = currency === "EUR" ? "EUR" : "USD";
  const rate = cur === "EUR" && exchangeRate ? Number(exchangeRate) : 1;
  const amountUSD = cur === "EUR" ? amount * rate : amount;

  const transaction = await prisma.transaction.create({
    data: {
      type,
      amount: new Prisma.Decimal(amountUSD),
      originalAmount: new Prisma.Decimal(amount),
      currency: cur,
      exchangeRate: new Prisma.Decimal(rate),
      description,
      categoryId,
      subcategoryId: subcategoryId || null,
      date: new Date(date),
      tags: tags ?? "",
    },
    include: { category: true, subcategory: true },
  });

  return NextResponse.json(
    {
      ...transaction,
      amount: Number(transaction.amount),
      originalAmount: Number(transaction.originalAmount),
      exchangeRate: Number(transaction.exchangeRate),
    },
    { status: 201 },
  );
}
