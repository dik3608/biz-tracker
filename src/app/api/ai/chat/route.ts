import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinancialContext } from "@/lib/ai-context";

const MODEL = "gpt-5.4";

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
{"action":"create_transaction","type":"EXPENSE","amount":900,"description":"Пополнение Google Ads","categoryName":"Google Ads","subcategoryName":"Пополнение","date":"2026-03-13","currency":"USD"}
\`\`\`

**2. Комиссия агентства (15% от $900 = $135)**

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":135,"description":"Комиссия агентства 15% от $900","categoryName":"Google Ads","subcategoryName":"Комиссии","date":"2026-03-13","currency":"USD"}
\`\`\`

КРИТИЧЕСКИ ВАЖНО:
- Сегодня: ${new Date().toISOString().split("T")[0]}
- Вчера: ${new Date(Date.now() - 86400000).toISOString().split("T")[0]}
- Позавчера: ${new Date(Date.now() - 172800000).toISOString().split("T")[0]}
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

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Требуется API-ключ OpenAI." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await req.json();
  const { messages = [], sessionId } = body;

  let sid = sessionId;
  if (!sid) {
    const session = await prisma.chatSession.create({ data: { title: "Новый чат" } });
    sid = session.id;
  }

  let contextText = "";
  try {
    contextText = await buildFinancialContext();
  } catch {
    contextText = "Не удалось загрузить данные.";
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{CONTEXT}", contextText);

  const lastUserMsg = messages[messages.length - 1];
  if (lastUserMsg?.role === "user") {
    await prisma.chatMessage.create({
      data: { role: "user", content: lastUserMsg.content, sessionId: sid },
    });
    await prisma.chatSession.update({ where: { id: sid }, data: { updatedAt: new Date() } });
  }

  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return new Response(
      JSON.stringify({ error: `OpenAI ошибка: ${openaiRes.status}. ${err}` }),
      { status: openaiRes.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let fullResponse = "";
  const currentSessionId = sid;
  const isFirstMessage = messages.length === 1;
  const firstUserText = messages[0]?.content || "";

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`));
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
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
              }
            } catch {}
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        if (fullResponse) {
          await prisma.chatMessage.create({
            data: { role: "assistant", content: fullResponse, sessionId: currentSessionId },
          });
        }

        if (isFirstMessage && firstUserText) {
          const title = firstUserText.length > 50 ? firstUserText.slice(0, 50) + "..." : firstUserText;
          await prisma.chatSession.update({ where: { id: currentSessionId }, data: { title } });
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
