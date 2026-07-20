import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, makeSlug, parseBody, requireSession } from "@/lib/api-server";

type Params = { params: Promise<{ id: string }> };

const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #rrggbb").optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return jsonError("Категория не найдена", 404);

  const { data, error } = await parseBody(req, updateCategorySchema);
  if (error) return error;

  if (data.name && data.name !== existing.name) {
    const duplicate = await prisma.category.findFirst({
      where: {
        type: existing.type,
        name: { equals: data.name, mode: "insensitive" },
        id: { not: id },
      },
    });
    if (duplicate) return jsonError("Категория с таким названием уже есть", 409);
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name, slug: makeSlug(data.name) } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    return NextResponse.json(category);
  } catch {
    return jsonError("Не удалось обновить категорию (конфликт названия)", 409);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, subcategories: true } } },
  });
  if (!existing) return jsonError("Категория не найдена", 404);

  if (existing._count.transactions > 0) {
    return jsonError(
      `Нельзя удалить: в категории ${existing._count.transactions} операций. Сначала перенесите или удалите их.`,
      409,
    );
  }

  // Подкатегории пустой категории удаляются каскадом (в них нет транзакций,
  // раз их нет в категории)
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
