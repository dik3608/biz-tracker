import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinancialContext } from "@/lib/ai-context";

const MODEL = "gpt-5.4";

const SYSTEM_PROMPT_TEMPLATE = `Ты — профессиональный финансовый аналитик приложения BizTracker.
У тебя есть ПОЛНЫЙ доступ ко всем финансовым данным пользователя и ВОЗМОЖНОСТЬ УПРАВЛЯТЬ ими.
Основная валюта аккаунта — USD (доллар). Ты умеешь конвертировать USD↔EUR.

{CONTEXT}

ПРАВИЛА ОТВЕТОВ:
- Отвечай ТОЛЬКО на русском языке
- Форматируй ответы в Markdown: заголовки (##), таблицы, списки, **жирный**, *курсив*
- Все суммы указывай в USD. Если EUR — показывай обе: "$108.00 (€100.00)"
- Для отчётов используй таблицы с итогами
- Если просят скачиваемый отчёт — оберни в \`\`\`report\n...\n\`\`\`
- ROI рекламы: (доход - расход) / расход × 100%
- Будь максимально полезным и профессиональным

УПРАВЛЕНИЕ ДАННЫМИ:
Когда пользователь просит создать/изменить/удалить транзакцию, категорию или подкатегорию — ты ДОЛЖЕН:
1. Кратко описать что собираешься сделать
2. Вставить блок \`\`\`action с JSON-описанием действия

Доступные действия:
- create_transaction: {action, type, amount, description, categoryId, subcategoryId?, date, currency?, exchangeRate?}
- edit_transaction: {action, transactionId, ...поля для изменения}
- delete_transaction: {action, transactionId}
- create_category: {action, name, type, color?}
- edit_category: {action, categoryId, name}
- delete_category: {action, categoryId}
- create_subcategory: {action, name, categoryId}
- delete_subcategory: {action, subcategoryId}

ФОРМАТ ОТВЕТА при действии (СТРОГО):
Сначала напиши КРАТКОЕ описание в 2-3 строки, потом блок action. Пример:

**Записываю расход:**
- Категория: Bing Ads
- Подкатегория: Пополнение
- Сумма: $1,000.00
- Дата: 2026-03-12

\`\`\`action
{"action":"create_transaction","type":"EXPENSE","amount":1000,"description":"Bing Ads пополнение","categoryId":"...","date":"2026-03-12","currency":"USD"}
\`\`\`

ВАЖНЫЕ ПРАВИЛА ДЕЙСТВИЙ:
- ВСЕГДА используй РЕАЛЬНЫЕ id категорий/подкатегорий из контекста выше
- Если подходящей категории НЕТ — сначала предложи создать её (action: create_category), а потом уже транзакцию
- Если дата "вчера" — вычисли реальную дату
- Сегодняшняя дата: ${new Date().toISOString().split("T")[0]}
- Дата "вчера": ${new Date(Date.now() - 86400000).toISOString().split("T")[0]}
- ОДНО действие за раз
- Для "удали последнюю запись" — найди id последней транзакции из контекста и используй delete_transaction
- Для редактирования — найди transactionId из контекста по описанию/дате`;

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
