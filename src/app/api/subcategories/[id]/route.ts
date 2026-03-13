import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { name } = await req.json();

  try {
    const sub = await prisma.subcategory.update({
      where: { id },
      data: { name: name.trim() },
    });
    return NextResponse.json(sub);
  } catch {
    return NextResponse.json({ error: "Не найдена" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.transaction.updateMany({
    where: { subcategoryId: id },
    data: { subcategoryId: null },
  });

  try {
    await prisma.subcategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Не найдена" }, { status: 404 });
  }
}
