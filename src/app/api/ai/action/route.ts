import { NextRequest, NextResponse } from "next/server";
import { requireQuickAccess } from "@/lib/api-server";
import { executeAiAction } from "@/lib/ai-actions";

/**
 * POST /api/ai/action — исполнение одного действия ассистента.
 * Wire-формат ответа: { ok, result, transactionId?, categoryId?, subcategoryId? }.
 * Вся логика — в src/lib/ai-actions.ts (общая с /api/ai/quick).
 * Доступ: сессия или токен виджета (страница /quick подтверждает действия здесь).
 */
export async function POST(req: NextRequest) {
  const denied = await requireQuickAccess(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, result: "Некорректный JSON в теле запроса" },
      { status: 400 },
    );
  }

  const { status, ...payload } = await executeAiAction(body);
  return NextResponse.json(payload, { status });
}
