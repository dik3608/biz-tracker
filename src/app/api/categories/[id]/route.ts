import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { name, color } = body;

  const data: Record<string, string> = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;

  try {
    const category = await prisma.category.update({
      where: { id },
      data,
    });
    return NextResponse.json(category);
  } catch {
    return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const txCount = await prisma.transaction.count({ where: { categoryId: id } });

  if (txCount > 0) {
    return NextResponse.json(
      { error: `Невозможно удалить: ${txCount} транзакций используют эту категорию` },
      { status: 400 },
    );
  }

  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }
}
