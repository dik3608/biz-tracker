import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireSession } from "@/lib/api-server";

type Params = { params: Promise<{ id: string }> };

const updateSubcategorySchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(80),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.subcategory.findUnique({ where: { id } });
  if (!existing) return jsonError("Подкатегория не найдена", 404);

  const { data, error } = await parseBody(req, updateSubcategorySchema);
  if (error) return error;

  const duplicate = await prisma.subcategory.findFirst({
    where: {
      categoryId: existing.categoryId,
      name: { equals: data.name, mode: "insensitive" },
      id: { not: id },
    },
  });
  if (duplicate) return jsonError("Такая подкатегория уже есть", 409);

  const subcategory = await prisma.subcategory.update({
    where: { id },
    data: { name: data.name },
  });
  return NextResponse.json(subcategory);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.subcategory.findUnique({ where: { id } });
  if (!existing) return jsonError("Подкатегория не найдена", 404);

  // Атомарно: транзакции отвязываем и удаляем подкатегорию одной транзакцией БД
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { subcategoryId: id },
      data: { subcategoryId: null },
    }),
    prisma.subcategory.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
