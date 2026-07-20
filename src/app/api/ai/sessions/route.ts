import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSession } from "@/lib/api-server";

/** GET /api/ai/sessions → { sessions: [...] } — список чатов. */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ sessions });
}

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

/** POST /api/ai/sessions {title?} → созданная сессия. Пустое тело допускается. */
export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = createSessionSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return jsonError("title: строка от 1 до 200 символов", 400);
  }

  const session = await prisma.chatSession.create({
    data: { title: parsed.data.title ?? "Новый чат" },
  });

  return NextResponse.json(session);
}
