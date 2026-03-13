import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFinancialContext } from "@/lib/ai-context";

const MODEL = "gpt-5.4";

const SYSTEM_PROMPT = `Ты — финансовый помощник BizTracker. Быстрый режим.
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
- Сегодня: ${new Date().toISOString().split("T")[0]}
- Вчера: ${new Date(Date.now() - 86400000).toISOString().split("T")[0]}
- Используй РЕАЛЬНЫЕ id категорий/подкатегорий из контекста`;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const { message, autoConfirm } = await req.json();
  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  let ctx = "";
  try {
    ctx = await buildFinancialContext();
  } catch {
    ctx = "Нет данных";
  }

  const systemPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", ctx);

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return NextResponse.json({ error: `OpenAI: ${err}` }, { status: openaiRes.status });
  }

  const data = await openaiRes.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  let parsed: { text?: string; actions?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json({ text: content, actions: [], executed: [] });
  }

  const actions = parsed.actions ?? [];
  const executed: { action: string; ok: boolean; result: string }[] = [];

  if (autoConfirm && actions.length > 0) {
    for (const act of actions) {
      try {
        const res = await fetch(new URL("/api/ai/action", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(act),
        });
        const r = await res.json();
        executed.push({ action: String(act.action), ok: !!r.ok, result: r.result });
      } catch (err) {
        executed.push({ action: String(act.action), ok: false, result: String(err) });
      }
    }
  }

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

  return NextResponse.json({
    text: parsed.text || "",
    actions,
    executed,
  });
}
