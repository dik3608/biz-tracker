import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireSession } from "@/lib/api-server";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Не выбрано ни одной записи").max(1000),
});

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { data, error } = await parseBody(req, bulkDeleteSchema);
  if (error) return error;

  const result = await prisma.transaction.deleteMany({
    where: { id: { in: data.ids } },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
