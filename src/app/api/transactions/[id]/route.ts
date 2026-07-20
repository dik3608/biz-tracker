import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  jsonError,
  parseBody,
  requireSession,
  serializeTransaction,
  transactionInputSchema,
  validateCategoryPair,
} from "@/lib/api-server";
import { dateKeyToUtc } from "@/lib/dates";
import { round2 } from "@/lib/money";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { category: true, subcategory: true },
  });
  if (!transaction) return jsonError("Транзакция не найдена", 404);
  return NextResponse.json(serializeTransaction(transaction));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return jsonError("Транзакция не найдена", 404);

  const { data, error } = await parseBody(req, transactionInputSchema);
  if (error) return error;

  const categoryError = await validateCategoryPair(data.type, data.categoryId, data.subcategoryId);
  if (categoryError) return categoryError;

  const rate = data.currency === "EUR" ? (data.exchangeRate ?? 0) : 1;
  if (data.currency === "EUR" && !(rate > 0)) {
    return jsonError("Для EUR необходим курс exchangeRate", 400);
  }
  const amountUsd = round2(data.amount * rate);

  const transaction = await prisma.transaction.update({
    where: { id },
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

  return NextResponse.json(serializeTransaction(transaction));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  try {
    await prisma.transaction.delete({ where: { id } });
  } catch {
    return jsonError("Транзакция не найдена", 404);
  }
  return NextResponse.json({ ok: true });
}
