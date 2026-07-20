import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody, requireSession, txTypeSchema } from "@/lib/api-server";

const MODEL = "gpt-5.4";
const OPENAI_TIMEOUT_MS = 15_000;

const suggestBodySchema = z.object({
  description: z.string().trim().min(1, "description обязателен").max(500),
  type: txTypeSchema.optional(),
});

/**
 * POST /api/ai/suggest — подсказка категории/подкатегории по описанию.
 * Ответ: {categoryId, categoryName, subcategoryId, subcategoryName, newSubcategory, type}.
 */
export async function POST(req: NextRequest) {
  const denied = await requireSession(req);
  if (denied) return denied;

  const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError("API-ключ не указан", 401);
  }

  const { data, error } = await parseBody(req, suggestBodySchema);
  if (error) return error;
  const { description, type } = data;

  const categories = await prisma.category.findMany({
    where: type ? { type } : undefined,
    include: { subcategories: true },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });

  const catList = categories.map((c) => {
    const subs = c.subcategories.map((s) => s.name).join(", ");
    return `- "${c.name}" (${c.type}, id: ${c.id})${subs ? ` [подкатегории: ${subs}]` : ""}`;
  });

  const subList = categories.flatMap((c) =>
    c.subcategories.map((s) => `- "${s.name}" (категория: "${c.name}", id: ${s.id})`),
  );

  const prompt = `Пользователь вводит транзакцию с описанием: "${description}"
${type ? `Тип: ${type}` : ""}

Доступные категории:
${catList.join("\n") || "Пока нет категорий"}

Доступные подкатегории:
${subList.join("\n") || "Пока нет подкатегорий"}

Определи наиболее подходящую категорию и подкатегорию для этой транзакции.
Если подходящей подкатегории нет — предложи название для новой.

Ответь СТРОГО в формате JSON (без markdown):
{"categoryId": "...", "categoryName": "...", "subcategoryId": "..." или null, "subcategoryName": "...", "newSubcategory": true/false, "type": "INCOME" или "EXPENSE"}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Ты — умный финансовый помощник. Отвечай только JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 200,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!res.ok) {
      return jsonError("OpenAI ошибка", res.status);
    }

    const completion = await res.json();
    const text: string = completion.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return jsonError("Не удалось распарсить", 500);
    }

    const suggestion = JSON.parse(jsonMatch[0]);
    return NextResponse.json(suggestion);
  } catch {
    return jsonError("Ошибка запроса", 500);
  }
}
