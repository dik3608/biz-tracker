import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { type, amount, description, categoryId, subcategoryId, date, tags, currency, exchangeRate } = body;

  const data: Prisma.TransactionUpdateInput = {};

  if (type !== undefined) data.type = type;
  if (description !== undefined) data.description = description;
  if (categoryId !== undefined) data.category = { connect: { id: categoryId } };
  if (subcategoryId !== undefined) {
    data.subcategory = subcategoryId ? { connect: { id: subcategoryId } } : { disconnect: true };
  }
  if (date !== undefined) data.date = new Date(date);
  if (tags !== undefined) data.tags = tags;
  if (currency !== undefined) data.currency = currency;

  if (amount !== undefined) {
    const cur = currency ?? "USD";
    const rate = cur === "EUR" && exchangeRate ? Number(exchangeRate) : 1;
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
