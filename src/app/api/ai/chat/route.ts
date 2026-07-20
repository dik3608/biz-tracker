import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireSession } from "@/lib/api-server";
import { buildFinancialContext, parseTimezoneOffset, resolveTodayKey } from "@/lib/ai-context";
import { addDays } from "@/lib/dates";

const MODEL = "gpt-5.4";

/**
 * Шаблон системного промпта. Даты подставляются В МОМЕНТ ЗАПРОСА
 * (никаких вычислений дат на уровне модуля) по часовому поясу пользователя.
 */
const SYSTEM_PROMPT_TEMPLATE = `Ты — профессиональный финансовый аналитик и помощник приложения BizTracker.
У тебя есть ПОЛНЫЙ доступ ко всем финансовым данным пользователя и ВОЗМОЖНОСТЬ УПРАВЛЯТЬ ими.
Основная валюта — USD. Конвертация USD↔EUR.

{CONTEXT}

ПРАВИЛА ОТВЕТОВ:
- ТОЛЬКО русский язык
- Markdown: ## заголовки, таблицы, списки, **жирный**, *курсив*
- Суммы в USD. EUR → обе: "$108.00 (€100.00)"
- Скачиваемые отчёты: \`\`\`report\n...\n\`\`\`

УПРАВЛЕНИЕ ДАННЫМИ:

1. МНОЖЕСТВЕННЫЕ ЗАДАЧИ:
   Пользователь может дать несколько задач в одном сообщении. ОБЯЗАТЕЛЬНО создай ОТДЕЛЬНЫЙ блок \`\`\`action для КАЖДОЙ.

2. ПРОЦЕНТЫ:
   - "комиссия 15%" → 15% от суммы основного расхода
   - Всегда покажи расчёт: "15% от $900 = $135"

3. СВОБОДНАЯ ФОРМА:
   - "гугл 900 и комиссию 15%" → 2 записи
   - "бинг 500 вчера" → расход $500, Bing Ads, дата вчера
   - "заработал 2000 с гугла" → доход $2000
   - Если непонятно тип — расход по умолчанию

Доступные действия и их поля:

create_transaction:
  ОБЯЗАТЕЛЬНО: action, type, amount, description, date
  КАТЕГОРИЯ: используй categoryName (текст) — система САМА найдёт или создаст
  ПОДКАТЕГОРИЯ: используй subcategoryName (текст) — система САМА найдёт или создаст
  Опционально: currency, exchangeRate
  НИКОГДА НЕ ИСПОЛЬЗУЙ categoryId/subcategoryId — только Name!

edit_transaction:
  ОБЯЗАТЕЛЬНО: action, transactionId
  Поля для изменения: amount, description, date, type, categoryName, subcategoryName

delete_transaction:
  action, transactionId

create_category:
  action, name, type ("INCOME"|"EXPENSE"), color?

edit_category:
  action, categoryName (текущее имя), name (новое имя)

delete_category:
  action, categoryName

create_subcategory:
  action, name, categoryName

delete_subcategory:
  action, subcategoryName, categoryName

ФОРМАТ ОТВЕТА (СТРОГО):
Кратко опиши ВСЕ действия, потом для КАЖДОГО — отдельный \`\`\`action блок.

Пример на "расход гугл 900 и комиссию 15%":

**Записываю 2 операции:**

**1. Пополнение Google Ads — $900**

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":900,"description":"Пополнение Google Ads","categoryName":"Google Ads","subcategoryName":"Пополнение","date":"{TODAY}","currency":"USD"}
\`\`\`

**2. Комиссия агентства (15% от $900 = $135)**

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":135,"description":"Комиссия агентства 15% от $900","categoryName":"Google Ads","subcategoryName":"Комиссии","date":"{TODAY}","currency":"USD"}
\`\`\`

КРИТИЧЕСКИ ВАЖНО:
- Сегодня: {TODAY}
- Вчера: {YESTERDAY}
- Позавчера: {DAY_BEFORE}
- categoryName/subcategoryName — ТОЧНЫЕ названия. Система сама найдёт или создаст
- НЕ НУЖЕН отдельный create_category — система создаст автоматически!
- Для удаления/редактирования — найди transactionId в контексте

САМОЕ ВАЖНОЕ ПРАВИЛО — КАЖДОМУ ДЕЙСТВИЮ СВОЙ БЛОК:
Если пользователь просит 2 вещи — ДВА блока \`\`\`action.
Если 5 вещей — ПЯТЬ блоков.
Если 10 — ДЕСЯТЬ.
НИКОГДА не пропускай действия! Каждая операция = свой \`\`\`action блок.
Пользователь подтвердит ВСЕ разом одной кнопкой.
ЗАПРЕЩЕНО описать действие текстом без блока \`\`\`action — пользователь не сможет его подтвердить!`;

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string().max(32_000),
      }),
    )
    .max(200)
    .default([]),
  sessionId: z.string().min(1).optional(),
  timezoneOffset: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError("Требуется API-ключ OpenAI.", 401);
  }

  const { data, error } = await parseBody(req, chatBodySchema);
  if (error) return error;

  // В OpenAI уходят только user/assistant — system строит исключительно сервер
  const history = data.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Сессия: присланный id обязан существовать; без id — создаём новую
  let sid = data.sessionId ?? null;
  let createdSession = false;
  if (sid) {
    const exists = await prisma.chatSession.findUnique({ where: { id: sid } });
    if (!exists) return jsonError("Чат не найден", 404);
  } else {
    const session = await prisma.chatSession.create({ data: { title: "Новый чат" } });
    sid = session.id;
    createdSession = true;
  }

  // «Сегодня» — по часовому поясу пользователя, только для системного промпта
  const offset =
    parseTimezoneOffset(data.timezoneOffset) ??
    parseTimezoneOffset(req.headers.get("x-timezone-offset"));
  const today = resolveTodayKey(offset);

  let contextText = "";
  try {
    contextText = await buildFinancialContext(today);
  } catch {
    contextText = "Не удалось загрузить данные.";
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{CONTEXT}", contextText)
    .replaceAll("{TODAY}", today)
    .replaceAll("{YESTERDAY}", addDays(today, -1))
    .replaceAll("{DAY_BEFORE}", addDays(today, -2));

  const openaiMessages = [{ role: "system" as const, content: systemPrompt }, ...history];

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: openaiMessages,
        stream: true,
        temperature: 0.3,
        max_completion_tokens: 4096,
      }),
    });
  } catch {
    if (createdSession) {
      await prisma.chatSession.delete({ where: { id: sid } }).catch(() => {});
    }
    return jsonError("Не удалось связаться с OpenAI", 502);
  }

  if (!openaiRes.ok || !openaiRes.body) {
    const err = await openaiRes.text().catch(() => "");
    if (createdSession) {
      await prisma.chatSession.delete({ where: { id: sid } }).catch(() => {});
    }
    return jsonError(`OpenAI ошибка: ${openaiRes.status}. ${err}`.trim(), openaiRes.status || 502);
  }

  // Сообщение пользователя сохраняем ТОЛЬКО после успешного начала ответа
  const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    try {
      await prisma.chatMessage.create({
        data: { role: "user", content: lastUserMsg.content, sessionId: sid },
      });
      await prisma.chatSession.update({ where: { id: sid }, data: { updatedAt: new Date() } });
    } catch {
      // не роняем стрим из-за сбоя записи истории
    }
  }

  const encoder = new TextEncoder();
  const currentSessionId = sid;
  const isFirstMessage = history.length === 1;
  const firstUserText = history[0]?.role === "user" ? history[0].content : "";

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      const safeEnqueue = (chunk: string): boolean => {
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          return false; // клиент отключился
        }
      };

      safeEnqueue(`data: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`);

      const reader = openaiRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                if (!safeEnqueue(`data: ${JSON.stringify({ content: delta })}\n\n`)) {
                  throw new Error("client disconnected");
                }
              }
            } catch (e) {
              if (e instanceof Error && e.message === "client disconnected") throw e;
              // битый JSON-чанк — пропускаем
            }
          }
        }
      } catch {
        reader.cancel().catch(() => {});
      } finally {
        // Ответ ассистента сохраняем и при обрыве стрима
        if (fullResponse) {
          try {
            await prisma.chatMessage.create({
              data: { role: "assistant", content: fullResponse, sessionId: currentSessionId },
            });
          } catch {}
        }
        if (isFirstMessage && firstUserText) {
          const title =
            firstUserText.length > 50 ? firstUserText.slice(0, 50) + "..." : firstUserText;
          await prisma.chatSession
            .update({ where: { id: currentSessionId }, data: { title } })
            .catch(() => {});
        }
        safeEnqueue("data: [DONE]\n\n");
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
