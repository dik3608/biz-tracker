import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";
import { dateKeyToUtc, enumerateMonths, isDateKey, monthKeyOf, utcDateToKey } from "@/lib/dates";
import { round2 } from "@/lib/money";

/**
 * GET /api/export?from=&to=&format=xlsx|csv
 * xlsx: три листа — «Операции», «По месяцам», «По категориям»; суммы —
 * числовые ячейки. csv: точка с запятой + BOM (русский Excel).
 */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const url = req.nextUrl.searchParams;
  const from = url.get("from");
  const to = url.get("to");
  const format = url.get("format") === "csv" ? "csv" : "xlsx";

  if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
    return jsonError("Даты должны быть в формате YYYY-MM-DD", 400);
  }
  if ((from && !to) || (!from && to)) {
    return jsonError("Параметры from и to задаются вместе", 400);
  }
  if (from && to && from > to) return jsonError("from не может быть позже to", 400);

  const dateFilter = from && to ? { date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) } } : {};

  const transactions = await prisma.transaction.findMany({
    where: dateFilter,
    include: { category: true, subcategory: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const stamp = `${from ?? "all"}_${to ?? "all"}`;

  const txRows = transactions.map((t) => ({
    "Дата": utcDateToKey(t.date),
    "Тип": t.type === "INCOME" ? "Доход" : "Расход",
    "Описание": t.description,
    "Категория": t.category.name,
    "Подкатегория": t.subcategory?.name ?? "",
    "Сумма (USD)": round2(Number(t.amount)),
    "Сумма (ориг.)": round2(Number(t.originalAmount)),
    "Валюта": t.currency,
    "Курс": Number(t.exchangeRate),
    "Теги": t.tags,
  }));

  if (format === "csv") {
    const headers = Object.keys(
      txRows[0] ?? { "Дата": "", "Тип": "", "Описание": "", "Категория": "", "Подкатегория": "", "Сумма (USD)": "", "Сумма (ориг.)": "", "Валюта": "", "Курс": "", "Теги": "" },
    );
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      // Числа для русского Excel — с запятой в качестве десятичного разделителя
      const out = typeof v === "number" ? s.replace(".", ",") : s;
      return /[;"\n]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
    };
    const lines = [
      headers.join(";"),
      ...txRows.map((row) => headers.map((h) => escape(row[h as keyof typeof row])).join(";")),
    ];
    const csv = "﻿" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="biztracker_${stamp}.csv"`,
      },
    });
  }

  // ---- xlsx ----
  const wb = XLSX.utils.book_new();

  const wsTx = XLSX.utils.json_to_sheet(txRows);
  wsTx["!cols"] = [
    { wch: 11 }, { wch: 8 }, { wch: 40 }, { wch: 22 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 8 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTx, "Операции");

  if (transactions.length > 0) {
    const first = utcDateToKey(transactions[0].date);
    const last = utcDateToKey(transactions[transactions.length - 1].date);
    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const m of enumerateMonths(first, last)) byMonth.set(m, { income: 0, expense: 0 });
    const byCat = new Map<string, { type: string; income: number; expense: number; count: number }>();

    for (const t of transactions) {
      const m = byMonth.get(monthKeyOf(utcDateToKey(t.date)))!;
      const amount = Number(t.amount);
      if (t.type === "INCOME") m.income += amount;
      else m.expense += amount;

      const cat = byCat.get(t.category.name) ?? { type: t.type, income: 0, expense: 0, count: 0 };
      if (t.type === "INCOME") cat.income += amount;
      else cat.expense += amount;
      cat.count += 1;
      byCat.set(t.category.name, cat);
    }

    const monthRows = [...byMonth.entries()].map(([month, v]) => ({
      "Месяц": month,
      "Доход": round2(v.income),
      "Расход": round2(v.expense),
      "Прибыль": round2(v.income - v.expense),
    }));
    const wsMonths = XLSX.utils.json_to_sheet(monthRows);
    wsMonths["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsMonths, "По месяцам");

    const catRows = [...byCat.entries()]
      .sort((a, b) => b[1].income + b[1].expense - (a[1].income + a[1].expense))
      .map(([name, v]) => ({
        "Категория": name,
        "Тип": v.type === "INCOME" ? "Доход" : "Расход",
        "Сумма": round2(v.income + v.expense),
        "Операций": v.count,
      }));
    const wsCats = XLSX.utils.json_to_sheet(catRows);
    wsCats["!cols"] = [{ wch: 26 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsCats, "По категориям");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="biztracker_${stamp}.xlsx"`,
    },
  });
}
