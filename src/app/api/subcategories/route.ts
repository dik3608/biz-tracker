import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireSession } from "@/lib/api-server";

const createSubcategorySchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(80),
  categoryId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const subcategories = await prisma.subcategory.findMany({
    where: categoryId ? { categoryId } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ subcategories });
}

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { data, error } = await parseBody(req, createSubcategorySchema);
  if (error) return error;

  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) return jsonError("Категория не найдена", 400);

  const duplicate = await prisma.subcategory.findFirst({
    where: { categoryId: data.categoryId, name: { equals: data.name, mode: "insensitive" } },
  });
  if (duplicate) return jsonError("Такая подкатегория уже есть", 409);

  const maxOrder = await prisma.subcategory.aggregate({
    where: { categoryId: data.categoryId },
    _max: { sortOrder: true },
  });

  try {
    const subcategory = await prisma.subcategory.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(subcategory, { status: 201 });
  } catch {
    return jsonError("Такая подкатегория уже есть", 409);
  }
}
