import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, makeSlug, parseBody, requireSession, txTypeSchema } from "@/lib/api-server";
import type { CategoryDto } from "@/lib/types";

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #rrggbb");

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(80),
  type: txTypeSchema,
  color: colorSchema.optional(),
});

/**
 * GET /api/categories — все категории с подкатегориями и числом транзакций
 * (нужно настройкам для безопасного удаления).
 */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const categories = await prisma.category.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      subcategories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { transactions: true } } },
      },
      _count: { select: { transactions: true } },
    },
  });

  const result: CategoryDto[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    color: c.color,
    sortOrder: c.sortOrder,
    transactionCount: c._count.transactions,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      sortOrder: s.sortOrder,
      transactionCount: s._count.transactions,
    })),
  }));

  return NextResponse.json({ categories: result });
}

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { data, error } = await parseBody(req, createCategorySchema);
  if (error) return error;

  const duplicate = await prisma.category.findFirst({
    where: { type: data.type, name: { equals: data.name, mode: "insensitive" } },
  });
  if (duplicate) return jsonError("Категория с таким названием уже есть", 409);

  const maxOrder = await prisma.category.aggregate({
    where: { type: data.type },
    _max: { sortOrder: true },
  });

  try {
    const category = await prisma.category.create({
      data: {
        name: data.name,
        type: data.type,
        slug: makeSlug(data.name),
        color: data.color ?? "#7a88ff",
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return jsonError("Категория с таким названием уже есть", 409);
  }
}
