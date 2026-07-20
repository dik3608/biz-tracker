import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireSession } from "@/lib/api-server";

/** GET /api/ai/sessions/:id → сессия с сообщениями (по возрастанию времени). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) {
    return jsonError("Чат не найден", 404);
  }

  return NextResponse.json(session);
}

const patchSessionSchema = z.object({
  title: z.string().trim().min(1, "Название не может быть пустым").max(200),
});

/** PATCH /api/ai/sessions/:id {title} → обновлённая сессия. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;

  const { data, error } = await parseBody(req, patchSessionSchema);
  if (error) return error;

  const exists = await prisma.chatSession.findUnique({ where: { id } });
  if (!exists) {
    return jsonError("Чат не найден", 404);
  }

  const session = await prisma.chatSession.update({
    where: { id },
    data: { title: data.title },
  });

  return NextResponse.json(session);
}

/** DELETE /api/ai/sessions/:id → {ok:true}; сообщения удаляются каскадом. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const { id } = await params;

  const { count } = await prisma.chatSession.deleteMany({ where: { id } });
  if (count === 0) {
    return jsonError("Чат не найден", 404);
  }

  return NextResponse.json({ ok: true });
}
