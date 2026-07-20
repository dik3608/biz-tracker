import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-server";
import { buildFinancialContext, parseTimezoneOffset, resolveTodayKey } from "@/lib/ai-context";

/** GET /api/ai/context → { context: string } — текстовый контекст для модели. */
export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const offset = parseTimezoneOffset(req.headers.get("x-timezone-offset"));

  try {
    const context = await buildFinancialContext(resolveTodayKey(offset));
    return NextResponse.json({ context });
  } catch {
    return jsonError("Не удалось построить финансовый контекст", 500);
  }
}
