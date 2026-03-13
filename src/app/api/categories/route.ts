import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, type, color } = body;

  if (!name || !type) {
    return NextResponse.json(
      { error: "Поля name и type обязательны" },
      { status: 400 },
    );
  }

  if (type !== "INCOME" && type !== "EXPENSE") {
    return NextResponse.json(
      { error: "type должен быть INCOME или EXPENSE" },
      { status: 400 },
    );
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/g, "");

  const category = await prisma.category.create({
    data: {
      name,
      type,
      slug,
      ...(color ? { color } : {}),
    },
  });

  return NextResponse.json(category, { status: 201 });
}
