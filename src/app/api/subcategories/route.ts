import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const where = categoryId ? { categoryId } : {};

  const subcategories = await prisma.subcategory.findMany({
    where,
    include: { category: true },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ subcategories });
}

export async function POST(req: NextRequest) {
  const { name, categoryId } = await req.json();
  if (!name?.trim() || !categoryId) {
    return NextResponse.json({ error: "name и categoryId обязательны" }, { status: 400 });
  }

  try {
    const sub = await prisma.subcategory.create({
      data: { name: name.trim(), categoryId },
      include: { category: true },
    });
    return NextResponse.json(sub, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Подкатегория уже существует" }, { status: 409 });
  }
}
