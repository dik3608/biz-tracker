import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-server";
import { isDateKey, todayKey } from "@/lib/dates";
import type { ExchangeRateResponse } from "@/lib/types";

/**
 * GET /api/exchange-rate?date=YYYY-MM-DD
 * Курс EUR→USD на дату транзакции (frankfurter.app, данные ЕЦБ).
 * Без date — последний доступный курс. Кэш в памяти по дате.
 */
const cache = new Map<string, { rate: number; ts: number }>();
const TTL = 6 * 3600_000;
const FALLBACK_RATE = 1.16;

export async function GET(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const dateParam = req.nextUrl.searchParams.get("date");
  const today = todayKey();
  // Будущие и некорректные даты сводим к «последнему курсу»
  const date = dateParam && isDateKey(dateParam) && dateParam < today ? dateParam : "latest";

  const cached = cache.get(date);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({
      rate: cached.rate,
      date: date === "latest" ? today : date,
      source: "live",
    } satisfies ExchangeRateResponse);
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=USD`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number }; date?: string };
    const rate = data.rates?.USD;
    if (typeof rate !== "number" || !(rate > 0.5 && rate < 2)) {
      throw new Error("Некорректный ответ курса");
    }
    cache.set(date, { rate, ts: Date.now() });
    return NextResponse.json({
      rate,
      date: data.date ?? (date === "latest" ? today : date),
      source: "live",
    } satisfies ExchangeRateResponse);
  } catch {
    // Отдаём последний известный курс из кэша любой даты, иначе — запасной
    const anyCached = [...cache.values()].sort((a, b) => b.ts - a.ts)[0];
    return NextResponse.json({
      rate: anyCached?.rate ?? FALLBACK_RATE,
      date: date === "latest" ? today : date,
      source: "fallback",
    } satisfies ExchangeRateResponse);
  }
}
