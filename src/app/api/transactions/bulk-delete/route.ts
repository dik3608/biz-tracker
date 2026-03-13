import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids должен быть непустым массивом" },
      { status: 400 },
    );
  }

  const result = await prisma.transaction.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ deleted: result.count });
}
