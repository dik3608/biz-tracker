import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, TxType } from "@/generated/prisma/client";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;

  const from = url.get("from");
  const to = url.get("to");
  const type = url.get("type") as TxType | null;

  const where: Prisma.TransactionWhereInput = {};

  if (type && (type === "INCOME" || type === "EXPENSE")) {
    where.type = type;
  }
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const BOM = "\uFEFF";
  const header = "Дата,Тип,Категория,Описание,Сумма (USD),Валюта,Оригинал,Курс,Теги";
  const rows = transactions.map((t) => {
    const date = t.date.toISOString().split("T")[0];
    const txType = t.type === "INCOME" ? "Доход" : "Расход";
    return [
      date,
      txType,
      escapeCsv(t.category.name),
      escapeCsv(t.description),
      Number(t.amount).toFixed(2),
      t.currency,
      Number(t.originalAmount).toFixed(2),
      Number(t.exchangeRate).toFixed(4),
      escapeCsv(t.tags),
    ].join(",");
  });

  const csv = BOM + [header, ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="export.csv"',
    },
  });
}
