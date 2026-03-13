import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-openai-key");
  if (!apiKey) {
    return NextResponse.json({ error: "API-ключ не указан" }, { status: 401 });
  }

  const { description, type } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "description обязателен" }, { status: 400 });
  }

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
${catList.join("\n")}

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
        model: "gpt-5.4",
        messages: [
          { role: "system", content: "Ты — умный финансовый помощник. Отвечай только JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 200,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "OpenAI ошибка" }, { status: res.status });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Не удалось распарсить" }, { status: 500 });
    }

    const suggestion = JSON.parse(jsonMatch[0]);
    return NextResponse.json(suggestion);
  } catch {
    return NextResponse.json({ error: "Ошибка запроса" }, { status: 500 });
  }
}
