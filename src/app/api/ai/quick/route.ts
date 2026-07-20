import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireQuickAccess } from "@/lib/api-server";
import { executeAiAction } from "@/lib/ai-actions";
import { buildFinancialContext, parseTimezoneOffset, resolveTodayKey } from "@/lib/ai-context";
import { addDays } from "@/lib/dates";

const MODEL = "gpt-5.4";

/** Даты подставляются в момент запроса — никаких вычислений на уровне модуля. */
const SYSTEM_PROMPT_TEMPLATE = `Ты — финансовый помощник BizTracker. Быстрый режим.
Основная валюта — USD. Конвертируешь USD↔EUR.

{CONTEXT}

ПРАВИЛА:
- Русский язык
- Кратко, по делу
- Если пользователь просит записать/создать/удалить — верни JSON действия
- Если вопрос — отвечай текстом

ФОРМАТ ОТВЕТА:
Всегда возвращай JSON:
{
  "text": "Краткое описание что делаю",
  "actions": [
    {"action":"create_transaction","type":"EXPENSE","amount":900,...}
  ]
}

Если действий нет (просто вопрос): {"text":"ответ","actions":[]}

РАСЧЁТЫ:
- "комиссия 15%" от суммы → вычисли и создай отдельную транзакцию
- Несколько задач → несколько actions
- Сегодня: {TODAY}
- Вчера: {YESTERDAY}
- Используй РЕАЛЬНЫЕ id категорий/подкатегорий из контекста`;

const quickBodySchema = z.object({
  message: z.string().trim().min(1, "Сообщение не может быть пустым").max(4000),
  autoConfirm: z.boolean().optional(),
  timezoneOffset: z.number().optional(),
});

export async function POST(req: NextRequest) {
  // Доступ виджета: валидная сессия ИЛИ X-Quick-Token; без QUICK_ACCESS_TOKEN
  // в env — открыт (обратная совместимость с уже установленным виджетом)
  const denied = await requireQuickAccess(req);
  if (denied) return denied;

  const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const { data, error } = await parseBody(req, quickBodySchema);
  if (error) return error;
  const { message, autoConfirm } = data;

  const offset =
    parseTimezoneOffset(data.timezoneOffset) ??
    parseTimezoneOffset(req.headers.get("x-timezone-offset"));
  const today = resolveTodayKey(offset);

  let ctx = "";
  try {
    ctx = await buildFinancialContext(today);
  } catch {
    ctx = "Нет данных";
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{CONTEXT}", ctx)
    .replaceAll("{TODAY}", today)
    .replaceAll("{YESTERDAY}", addDays(today, -1));

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return jsonError("Не удалось связаться с OpenAI", 502);
  }

  if (!openaiRes.ok) {
    const err = await openaiRes.text().catch(() => "");
    return NextResponse.json({ error: `OpenAI: ${err}` }, { status: openaiRes.status });
  }

  const completion = await openaiRes.json().catch(() => null);
  const content: string = completion?.choices?.[0]?.message?.content ?? "{}";

  let parsed: { text?: string; actions?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json({ text: content, actions: [], executed: [] });
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

  // Сначала пишем сессию и сообщения, действия исполняем ПОСЛЕ
  try {
    await prisma.chatSession.create({
      data: {
        title: message.length > 40 ? message.slice(0, 40) + "..." : message,
        messages: {
          create: [
            { role: "user", content: message },
            { role: "assistant", content: parsed.text || content },
          ],
        },
      },
    });
  } catch {
    // сбой записи истории не должен ломать ответ виджету
  }

  const executed: { action: string; ok: boolean; result: string }[] = [];
  if (autoConfirm && actions.length > 0) {
    for (const act of actions) {
      try {
        const r = await executeAiAction(act);
        executed.push({ action: String(act?.action ?? ""), ok: r.ok, result: r.result });
      } catch (err) {
        executed.push({ action: String(act?.action ?? ""), ok: false, result: String(err) });
      }
    }
  }

  return NextResponse.json({
    text: parsed.text || "",
    actions,
    executed,
  });
}
