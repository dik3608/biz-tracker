import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { type, amount, description, categoryId, date, tags } = body;

  const data: Prisma.TransactionUpdateInput = {};

  if (type !== undefined) data.type = type;
  if (amount !== undefined) data.amount = new Prisma.Decimal(amount);
  if (description !== undefined) data.description = description;
  if (categoryId !== undefined) data.category = { connect: { id: categoryId } };
  if (date !== undefined) data.date = new Date(date);
  if (tags !== undefined) data.tags = tags;

  try {
    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: { category: true },
    });

    return NextResponse.json({ ...transaction, amount: Number(transaction.amount) });
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
