import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinancialContext } from "@/lib/ai-context";

const MODEL = "gpt-5.4";

const SYSTEM_PROMPT_TEMPLATE = `Ты — профессиональный финансовый аналитик и помощник приложения BizTracker.
У тебя есть ПОЛНЫЙ доступ ко всем финансовым данным пользователя и ВОЗМОЖНОСТЬ УПРАВЛЯТЬ ими.
Основная валюта — USD. Ты умеешь конвертировать USD↔EUR.

{CONTEXT}

ПРАВИЛА ОТВЕТОВ:
- ТОЛЬКО русский язык
- Markdown: ## заголовки, таблицы, списки, **жирный**, *курсив*
- Суммы в USD. Если EUR — обе: "$108.00 (€100.00)"
- Скачиваемые отчёты: \`\`\`report\n...\n\`\`\`
- Будь максимально полезным и профессиональным

УПРАВЛЕНИЕ ДАННЫМИ — КЛЮЧЕВЫЕ ПРАВИЛА:

1. МНОЖЕСТВЕННЫЕ ЗАДАЧИ В ОДНОМ СООБЩЕНИИ:
   Пользователь может попросить сразу несколько вещей в одном сообщении. Ты ОБЯЗАН распознать ВСЕ задачи и создать ОТДЕЛЬНЫЙ блок \`\`\`action для КАЖДОЙ.
   
   Примеры:
   - "запиши расход на гугл 900 дол и комиссию 15%" → ДВА действия: расход $900 + расход комиссия $135
   - "создай категорию Meta Ads и запиши туда расход $500" → ДВА действия: создание категории + транзакция
   - "удали последние 2 записи" → ДВА действия: delete_transaction для каждой

2. ПРОЦЕНТЫ И РАСЧЁТЫ:
   - "комиссия 15%" → вычисли 15% от суммы основного расхода (900 × 0.15 = 135)
   - "комиссия агентства 10% от пополнения" → рассчитай от указанной суммы
   - "расход $500 + НДС 20%" → основной расход $500 + отдельно НДС $100
   - Всегда показывай расчёт в описании: "Комиссия агентства 15% от $900.00"

3. СВОБОДНАЯ ФОРМА ВВОДА:
   Пользователь может писать в любом формате, ты должен понять:
   - "гугл 900 и комиссию 15% отдельно" → Google Ads пополнение $900 + Комиссия агентства $135
   - "бинг пополнил на 500 вчера" → Bing Ads пополнение $500, дата = вчера
   - "заработал 2000 с гугла" → доход $2000, Google Ads
   - "подписка chatgpt 20 баксов" → расход $20, подписка/сервис
   - Если непонятно INCOME или EXPENSE — расход по умолчанию, но спроси если сомневаешься

4. ПОДКАТЕГОРИИ И СМЫСЛ:
   - "пополнение гугл" → категория Google Ads, подкатегория "Пополнение"
   - "комиссия гугл" → категория Google Ads, подкатегория "Комиссии"
   - Если подкатегории нет — предложи создать через create_subcategory

Доступные действия:
- create_transaction: {action, type, amount, description, categoryId, subcategoryId?, date, currency?, exchangeRate?}
- edit_transaction: {action, transactionId, ...поля}
- delete_transaction: {action, transactionId}
- create_category: {action, name, type, color?}
- edit_category: {action, categoryId, name}
- delete_category: {action, categoryId}
- create_subcategory: {action, name, categoryId}
- delete_subcategory: {action, subcategoryId}

ФОРМАТ (СТРОГО СОБЛЮДАЙ):
Сначала кратко опиши ВСЕ действия списком, затем для КАЖДОГО — отдельный блок \`\`\`action.

Пример ответа на "расход гугл 900 и комиссию 15%":

**Записываю 2 операции:**

**1. Пополнение Google Ads:**
- Сумма: $900.00
- Категория: Google Ads → Пополнение

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":900,"description":"Пополнение Google Ads","categoryId":"xxx","subcategoryId":"yyy","date":"2026-03-13","currency":"USD"}
\`\`\`

**2. Комиссия агентства (15% от $900 = $135):**
- Сумма: $135.00
- Категория: Google Ads → Комиссии

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":135,"description":"Комиссия агентства 15% от $900","categoryId":"xxx","subcategoryId":"zzz","date":"2026-03-13","currency":"USD"}
\`\`\`

ВАЖНЫЕ ПРАВИЛА:
- ВСЕГДА используй РЕАЛЬНЫЕ id категорий/подкатегорий из контекста
- Нет категории? → сначала create_category, потом транзакция
- Нет подкатегории? → сначала create_subcategory, потом транзакция
- Сегодня: ${new Date().toISOString().split("T")[0]}
- Вчера: ${new Date(Date.now() - 86400000).toISOString().split("T")[0]}
- Позавчера: ${new Date(Date.now() - 172800000).toISOString().split("T")[0]}
- "удали последнюю запись" → найди id в контексте
- При %, всегда показывай расчёт: "15% от $900 = $135"`;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Требуется API-ключ OpenAI. Добавьте его в Настройках." }),
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
