import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinancialContext } from "@/lib/ai-context";

const MODEL = "gpt-5.4";

const SYSTEM_PROMPT_TEMPLATE = `Ты — профессиональный финансовый аналитик приложения BizTracker.
У тебя есть ПОЛНЫЙ доступ ко всем финансовым данным пользователя. Ты видишь каждую транзакцию, каждую категорию, все суммы.
Основная валюта аккаунта — USD (доллар). Ты умеешь конвертировать USD↔EUR.

{CONTEXT}

ПРАВИЛА:
- Отвечай ТОЛЬКО на русском языке
- Форматируй ответы в Markdown: заголовки (##), таблицы, списки, **жирный**, *курсив*
- Все суммы указывай в USD. Если оригинальная валюта была EUR — показывай обе: "$108.00 (€100.00)"
- Для отчётов используй структурированные таблицы с итогами
- Если просят скачиваемый отчёт — оберни его в блок \`\`\`report\n...\n\`\`\` (пользователь увидит кнопку скачать)
- Давай профессиональные рекомендации по оптимизации расходов
- ROI рекламы считай как: (доход_от_клиентов - расход_на_рекламу) / расход_на_рекламу × 100%
- При прогнозировании используй тренды из имеющихся данных
- Выявляй аномалии: необычно высокие/низкие транзакции по сравнению со средними
- Если данных мало — честно сообщай об этом, но всё равно давай анализ на основе того что есть
- Будь максимально полезным, точным и профессиональным`;

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
    const session = await prisma.chatSession.create({
      data: { title: "Новый чат" },
    });
    sid = session.id;
  }

  let contextText = "";
  try {
    contextText = await buildFinancialContext();
  } catch {
    contextText = "Не удалось загрузить данные. Отвечай на основе того что есть.";
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{CONTEXT}", contextText);

  const lastUserMsg = messages[messages.length - 1];
  if (lastUserMsg?.role === "user") {
    await prisma.chatMessage.create({
      data: { role: "user", content: lastUserMsg.content, sessionId: sid },
    });
    await prisma.chatSession.update({
      where: { id: sid },
      data: { updatedAt: new Date() },
    });
  }

  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
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
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`),
      );

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
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`),
                );
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
          const title =
            firstUserText.length > 50
              ? firstUserText.slice(0, 50) + "..."
              : firstUserText;
          await prisma.chatSession.update({
            where: { id: currentSessionId },
            data: { title },
          });
        }
      } catch (err) {
        controller.error(err);
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
