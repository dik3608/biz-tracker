import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

interface ActionPayload {
  action: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const body: ActionPayload = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "create_transaction": {
        const { type, amount, description, categoryId, subcategoryId, date, currency, exchangeRate } = body as Record<string, string | number>;
        const cur = currency === "EUR" ? "EUR" : "USD";
        const rate = cur === "EUR" && exchangeRate ? Number(exchangeRate) : 1;
        const amtNum = Number(amount);
        const amountUSD = cur === "EUR" ? amtNum * rate : amtNum;

        const tx = await prisma.transaction.create({
          data: {
            type: type as "INCOME" | "EXPENSE",
            amount: new Prisma.Decimal(amountUSD),
            originalAmount: new Prisma.Decimal(amtNum),
            currency: cur,
            exchangeRate: new Prisma.Decimal(rate),
            description: String(description),
            categoryId: String(categoryId),
            subcategoryId: subcategoryId ? String(subcategoryId) : null,
            date: new Date(String(date)),
          },
          include: { category: true, subcategory: true },
        });
        return NextResponse.json({ ok: true, result: `Запись создана: ${tx.description} — $${Number(tx.amount).toFixed(2)}` });
      }

      case "delete_transaction": {
        const { transactionId } = body;
        await prisma.transaction.delete({ where: { id: String(transactionId) } });
        return NextResponse.json({ ok: true, result: "Запись удалена" });
      }

      case "edit_transaction": {
        const { transactionId: txId, ...fields } = body;
        const data: Prisma.TransactionUpdateInput = {};
        if (fields.description !== undefined) data.description = String(fields.description);
        if (fields.type !== undefined) data.type = fields.type as "INCOME" | "EXPENSE";
        if (fields.date !== undefined) data.date = new Date(String(fields.date));
        if (fields.categoryId !== undefined) data.category = { connect: { id: String(fields.categoryId) } };
        if (fields.subcategoryId !== undefined) {
          data.subcategory = fields.subcategoryId ? { connect: { id: String(fields.subcategoryId) } } : { disconnect: true };
        }
        if (fields.amount !== undefined) {
          const cur = (fields.currency as string) ?? "USD";
          const rate = cur === "EUR" && fields.exchangeRate ? Number(fields.exchangeRate) : 1;
          const amt = Number(fields.amount);
          data.originalAmount = new Prisma.Decimal(amt);
          data.exchangeRate = new Prisma.Decimal(rate);
          data.amount = new Prisma.Decimal(cur === "EUR" ? amt * rate : amt);
          data.currency = cur;
        }
        await prisma.transaction.update({ where: { id: String(txId) }, data });
        return NextResponse.json({ ok: true, result: "Запись обновлена" });
      }

      case "create_category": {
        const { name, type: catType, color } = body;
        const slug = String(name).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/-+$/, "");
        const cat = await prisma.category.create({
          data: { name: String(name), type: catType as "INCOME" | "EXPENSE", slug, color: String(color || "#6366f1") },
        });
        return NextResponse.json({ ok: true, result: `Категория "${cat.name}" создана`, categoryId: cat.id });
      }

      case "edit_category": {
        const { categoryId: cId, name: cName } = body;
        await prisma.category.update({ where: { id: String(cId) }, data: { name: String(cName) } });
        return NextResponse.json({ ok: true, result: `Категория переименована в "${cName}"` });
      }

      case "delete_category": {
        const { categoryId: dcId } = body;
        const txCount = await prisma.transaction.count({ where: { categoryId: String(dcId) } });
        if (txCount > 0) {
          return NextResponse.json({ ok: false, result: `Невозможно удалить: ${txCount} записей используют эту категорию` }, { status: 400 });
        }
        await prisma.subcategory.deleteMany({ where: { categoryId: String(dcId) } });
        await prisma.category.delete({ where: { id: String(dcId) } });
        return NextResponse.json({ ok: true, result: "Категория удалена" });
      }

      case "create_subcategory": {
        const { name: sName, categoryId: scId } = body;
        const sub = await prisma.subcategory.create({
          data: { name: String(sName), categoryId: String(scId) },
        });
        return NextResponse.json({ ok: true, result: `Подкатегория "${sub.name}" создана`, subcategoryId: sub.id });
      }

      case "delete_subcategory": {
        const { subcategoryId: dsId } = body;
        await prisma.transaction.updateMany({ where: { subcategoryId: String(dsId) }, data: { subcategoryId: null } });
        await prisma.subcategory.delete({ where: { id: String(dsId) } });
        return NextResponse.json({ ok: true, result: "Подкатегория удалена" });
      }

      default:
        return NextResponse.json({ ok: false, result: `Неизвестное действие: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, result: `Ошибка: ${err instanceof Error ? err.message : "Неизвестная"}` },
      { status: 500 },
    );
  }
}
