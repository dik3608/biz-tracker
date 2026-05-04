import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { parseDateKey } from "@/lib/date-utils";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { type, amount, description, categoryId, subcategoryId, date, tags, currency, exchangeRate } = body;

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Транзакция не найдена" }, { status: 404 });
  }

  if (type !== undefined && type !== "INCOME" && type !== "EXPENSE") {
    return NextResponse.json({ error: "type должен быть INCOME или EXPENSE" }, { status: 400 });
  }
  if (currency !== undefined && currency !== "USD" && currency !== "EUR") {
    return NextResponse.json({ error: "currency должен быть USD или EUR" }, { status: 400 });
  }
  if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
    return NextResponse.json({ error: "amount должен быть положительным числом" }, { status: 400 });
  }
  if (currency !== undefined && amount === undefined && currency !== existing.currency) {
    return NextResponse.json({ error: "При смене валюты нужно передать сумму и курс" }, { status: 400 });
  }

  const nextType = (type ?? existing.type) as "INCOME" | "EXPENSE";
  const nextCategoryId = categoryId ?? existing.categoryId;

  if (categoryId !== undefined || type !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: nextCategoryId } });
    if (!category || category.type !== nextType) {
      return NextResponse.json(
        { error: "Категория не найдена или не соответствует типу операции" },
        { status: 400 },
      );
    }
  }

  if (subcategoryId) {
    const subcategory = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
    if (!subcategory || subcategory.categoryId !== nextCategoryId) {
      return NextResponse.json(
        { error: "Подкатегория не найдена или относится к другой категории" },
        { status: 400 },
      );
    }
  }

  const data: Prisma.TransactionUpdateInput = {};

  if (type !== undefined) data.type = type;
  if (description !== undefined) data.description = description;
  if (categoryId !== undefined) data.category = { connect: { id: categoryId } };
  if (subcategoryId !== undefined) {
    data.subcategory = subcategoryId ? { connect: { id: subcategoryId } } : { disconnect: true };
  } else if (categoryId !== undefined && categoryId !== existing.categoryId && existing.subcategoryId) {
    data.subcategory = { disconnect: true };
  }
  if (date !== undefined) data.date = parseDateKey(date);
  if (tags !== undefined) data.tags = tags;
  if (currency !== undefined) data.currency = currency;

  if (amount !== undefined) {
    const cur = currency ?? existing.currency;
    const rate = cur === "EUR" ? Number(exchangeRate ?? existing.exchangeRate) : 1;
    data.originalAmount = new Prisma.Decimal(amount);
    data.exchangeRate = new Prisma.Decimal(rate);
    data.amount = new Prisma.Decimal(cur === "EUR" ? amount * rate : amount);
  }

  try {
    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: { category: true, subcategory: true },
    });

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      originalAmount: Number(transaction.originalAmount),
      exchangeRate: Number(transaction.exchangeRate),
    });
  } catch {
    return NextResponse.json({ error: "Транзакция не найдена" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Транзакция не найдена" }, { status: 404 });
  }
}
