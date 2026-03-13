import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

interface ActionPayload {
  action: string;
  [key: string]: unknown;
}

async function resolveCategory(
  categoryId: string | undefined,
  categoryName: string | undefined,
  type: "INCOME" | "EXPENSE",
): Promise<string> {
  if (categoryId) {
    const exists = await prisma.category.findUnique({ where: { id: categoryId } });
    if (exists) return exists.id;
  }

  if (categoryName) {
    const byName = await prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: "insensitive" } },
    });
    if (byName) return byName.id;

    const slug = categoryName.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/-+$/, "");
    const created = await prisma.category.create({
      data: { name: categoryName, type, slug, color: "#6366f1" },
    });
    return created.id;
  }

  throw new Error("Не указана категория (categoryId или categoryName)");
}

async function resolveSubcategory(
  subcategoryId: string | undefined,
  subcategoryName: string | undefined,
  categoryId: string,
): Promise<string | null> {
  if (!subcategoryId && !subcategoryName) return null;

  if (subcategoryId) {
    const exists = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
    if (exists) return exists.id;
  }

  if (subcategoryName) {
    const byName = await prisma.subcategory.findFirst({
      where: { categoryId, name: { equals: subcategoryName, mode: "insensitive" } },
    });
    if (byName) return byName.id;

    const created = await prisma.subcategory.create({
      data: { name: subcategoryName, categoryId },
    });
    return created.id;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body: ActionPayload = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "create_transaction": {
        const {
          type, amount, description, categoryId, categoryName,
          subcategoryId, subcategoryName, date, currency, exchangeRate,
        } = body as Record<string, string | number | undefined>;

        const txType = (type as "INCOME" | "EXPENSE") || "EXPENSE";
        const realCatId = await resolveCategory(
          categoryId as string | undefined,
          categoryName as string | undefined,
          txType,
        );
        const realSubId = await resolveSubcategory(
          subcategoryId as string | undefined,
          subcategoryName as string | undefined,
          realCatId,
        );

        const cur = currency === "EUR" ? "EUR" : "USD";
        const rate = cur === "EUR" && exchangeRate ? Number(exchangeRate) : 1;
        const amtNum = Number(amount);
        const amountUSD = cur === "EUR" ? amtNum * rate : amtNum;

        const tx = await prisma.transaction.create({
          data: {
            type: txType,
            amount: new Prisma.Decimal(amountUSD),
            originalAmount: new Prisma.Decimal(amtNum),
            currency: cur,
            exchangeRate: new Prisma.Decimal(rate),
            description: String(description || ""),
            categoryId: realCatId,
            subcategoryId: realSubId,
            date: new Date(String(date || new Date().toISOString().split("T")[0])),
          },
          include: { category: true, subcategory: true },
        });

        const subLabel = tx.subcategory ? ` → ${tx.subcategory.name}` : "";
        return NextResponse.json({
          ok: true,
          result: `Запись создана: ${tx.category.name}${subLabel} — ${tx.description} — $${Number(tx.amount).toFixed(2)}`,
          transactionId: tx.id,
          categoryId: realCatId,
          subcategoryId: realSubId,
        });
      }

      case "delete_transaction": {
        const { transactionId } = body;
        const tx = await prisma.transaction.findUnique({
          where: { id: String(transactionId) },
          include: { category: true },
        });
        if (!tx) return NextResponse.json({ ok: false, result: "Запись не найдена" }, { status: 404 });
        await prisma.transaction.delete({ where: { id: tx.id } });
        return NextResponse.json({ ok: true, result: `Удалено: ${tx.description} — $${Number(tx.amount).toFixed(2)}` });
      }

      case "edit_transaction": {
        const { transactionId: txId, categoryName: editCatName, subcategoryName: editSubName, ...fields } = body;
        const data: Prisma.TransactionUpdateInput = {};

        if (fields.description !== undefined) data.description = String(fields.description);
        if (fields.type !== undefined) data.type = fields.type as "INCOME" | "EXPENSE";
        if (fields.date !== undefined) data.date = new Date(String(fields.date));

        if (fields.categoryId || editCatName) {
          const txType = (fields.type as "INCOME" | "EXPENSE") || "EXPENSE";
          const catId = await resolveCategory(
            fields.categoryId as string | undefined,
            editCatName as string | undefined,
            txType,
          );
          data.category = { connect: { id: catId } };

          if (editSubName) {
            const subId = await resolveSubcategory(undefined, editSubName as string, catId);
            if (subId) data.subcategory = { connect: { id: subId } };
          }
        }

        if (fields.subcategoryId !== undefined) {
          data.subcategory = fields.subcategoryId
            ? { connect: { id: String(fields.subcategoryId) } }
            : { disconnect: true };
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
        const nameStr = String(name);
        const typeStr = (catType as "INCOME" | "EXPENSE") || "EXPENSE";

        const existing = await prisma.category.findFirst({
          where: { name: { equals: nameStr, mode: "insensitive" } },
        });
        if (existing) {
          return NextResponse.json({ ok: true, result: `Категория "${existing.name}" уже существует`, categoryId: existing.id });
        }

        const slug = nameStr.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/-+$/, "");
        const cat = await prisma.category.create({
          data: { name: nameStr, type: typeStr, slug, color: String(color || "#6366f1") },
        });
        return NextResponse.json({ ok: true, result: `Категория "${cat.name}" создана`, categoryId: cat.id });
      }

      case "edit_category": {
        const { categoryId: cId, categoryName: cNameLookup, name: cName } = body;
        let realId = cId as string | undefined;
        if (!realId && cNameLookup) {
          const found = await prisma.category.findFirst({
            where: { name: { equals: String(cNameLookup), mode: "insensitive" } },
          });
          if (found) realId = found.id;
        }
        if (!realId) return NextResponse.json({ ok: false, result: "Категория не найдена" }, { status: 404 });

        await prisma.category.update({ where: { id: realId }, data: { name: String(cName) } });
        return NextResponse.json({ ok: true, result: `Категория переименована в "${cName}"` });
      }

      case "delete_category": {
        const { categoryId: dcId, categoryName: dcName } = body;
        let realId = dcId as string | undefined;
        if (!realId && dcName) {
          const found = await prisma.category.findFirst({
            where: { name: { equals: String(dcName), mode: "insensitive" } },
          });
          if (found) realId = found.id;
        }
        if (!realId) return NextResponse.json({ ok: false, result: "Категория не найдена" }, { status: 404 });

        const txCount = await prisma.transaction.count({ where: { categoryId: realId } });
        if (txCount > 0) {
          return NextResponse.json({ ok: false, result: `Невозможно удалить: ${txCount} записей используют эту категорию` }, { status: 400 });
        }
        await prisma.subcategory.deleteMany({ where: { categoryId: realId } });
        await prisma.category.delete({ where: { id: realId } });
        return NextResponse.json({ ok: true, result: "Категория удалена" });
      }

      case "create_subcategory": {
        const { name: sName, categoryId: scId, categoryName: scName } = body;
        const catId = await resolveCategory(scId as string | undefined, scName as string | undefined, "EXPENSE");

        const existing = await prisma.subcategory.findFirst({
          where: { categoryId: catId, name: { equals: String(sName), mode: "insensitive" } },
        });
        if (existing) {
          return NextResponse.json({ ok: true, result: `Подкатегория "${existing.name}" уже существует`, subcategoryId: existing.id });
        }

        const sub = await prisma.subcategory.create({
          data: { name: String(sName), categoryId: catId },
        });
        return NextResponse.json({ ok: true, result: `Подкатегория "${sub.name}" создана`, subcategoryId: sub.id, categoryId: catId });
      }

      case "delete_subcategory": {
        const { subcategoryId: dsId, subcategoryName: dsName, categoryName: dsCatName } = body;
        let realId = dsId as string | undefined;
        if (!realId && dsName && dsCatName) {
          const cat = await prisma.category.findFirst({
            where: { name: { equals: String(dsCatName), mode: "insensitive" } },
          });
          if (cat) {
            const sub = await prisma.subcategory.findFirst({
              where: { categoryId: cat.id, name: { equals: String(dsName), mode: "insensitive" } },
            });
            if (sub) realId = sub.id;
          }
        }
        if (!realId) return NextResponse.json({ ok: false, result: "Подкатегория не найдена" }, { status: 404 });

        await prisma.transaction.updateMany({ where: { subcategoryId: realId }, data: { subcategoryId: null } });
        await prisma.subcategory.delete({ where: { id: realId } });
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
