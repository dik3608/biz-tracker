/**
 * Серверные помощники для API-роутов: аутентификация, валидация, ошибки,
 * сериализация транзакций в DTO.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { isDateKey, utcDateToKey } from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { TransactionDto } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";

/** Slug категории из названия; имя из одних спецсимволов даёт запасной slug. */
export function makeSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/g, "");
  return slug || `cat-${Date.now().toString(36)}`;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Проверка сессии по cookie (валидность в БД, не только наличие).
 * Для macOS-виджета допускается токен из заголовка X-Quick-Token,
 * совпадающий с env QUICK_ACCESS_TOKEN.
 */
export async function requireSession(req: NextRequest): Promise<NextResponse | null> {
  const quickToken = req.headers.get("x-quick-token");
  if (quickToken && process.env.QUICK_ACCESS_TOKEN && quickToken === process.env.QUICK_ACCESS_TOKEN) {
    return null;
  }
  const token = req.cookies.get("biz_session")?.value;
  if (!token || !(await validateSession(token))) {
    return jsonError("Требуется вход", 401);
  }
  return null;
}

/**
 * Доступ для окна виджета (/quick): валидная сессия ИЛИ токен виджета.
 * Если QUICK_ACCESS_TOKEN не задан в env — пропускаем без проверки
 * (обратная совместимость с установленным виджетом; задайте переменную,
 * чтобы закрыть эндпоинты действий от анонимов).
 */
export async function requireQuickAccess(req: NextRequest): Promise<NextResponse | null> {
  const requiredToken = process.env.QUICK_ACCESS_TOKEN;
  if (!requiredToken) return null;
  if (req.headers.get("x-quick-token") === requiredToken) return null;
  const token = req.cookies.get("biz_session")?.value;
  if (token && (await validateSession(token))) return null;
  return jsonError("Требуется вход", 401);
}

/** Разбор JSON-тела по zod-схеме; вернёт NextResponse с 400 при ошибке. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<{ data: z.infer<S>; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, error: jsonError("Некорректный JSON в теле запроса", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
    return { data: null, error: jsonError(`${path}${issue.message}`, 400) };
  }
  return { data: parsed.data, error: null };
}

export const dateKeySchema = z
  .string()
  .refine(isDateKey, { message: "Дата должна быть в формате YYYY-MM-DD" });

export const txTypeSchema = z.enum(["INCOME", "EXPENSE"]);

export const currencySchema = z.enum(["USD", "EUR"]);

export const amountSchema = z
  .number()
  .positive("Сумма должна быть больше нуля")
  .max(1_000_000_000, "Сумма слишком велика");

export const transactionInputSchema = z.object({
  type: txTypeSchema,
  amount: amountSchema,
  currency: currencySchema.default("USD"),
  exchangeRate: z.number().positive().max(1000).optional(),
  description: z.string().trim().min(1, "Описание обязательно").max(500),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1).nullish(),
  date: dateKeySchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export type TransactionInputParsed = z.infer<typeof transactionInputSchema>;

type TxWithRelations = Prisma.TransactionGetPayload<{
  include: { category: true; subcategory: true };
}>;

export function serializeTransaction(t: TxWithRelations): TransactionDto {
  return {
    id: t.id,
    type: t.type,
    amount: round2(Number(t.amount)),
    originalAmount: round2(Number(t.originalAmount)),
    currency: t.currency === "EUR" ? "EUR" : "USD",
    exchangeRate: Number(t.exchangeRate),
    description: t.description,
    date: utcDateToKey(t.date),
    tags: t.tags ? t.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
    category: { id: t.category.id, name: t.category.name, color: t.category.color },
    subcategory: t.subcategory ? { id: t.subcategory.id, name: t.subcategory.name } : null,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Проверка категории/подкатегории для создания и редактирования транзакции.
 * Возвращает NextResponse с ошибкой или null, если всё согласовано.
 */
export async function validateCategoryPair(
  type: "INCOME" | "EXPENSE",
  categoryId: string,
  subcategoryId: string | null | undefined,
): Promise<NextResponse | null> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return jsonError("Категория не найдена", 400);
  if (category.type !== type) {
    return jsonError("Категория не соответствует типу операции", 400);
  }
  if (subcategoryId) {
    const sub = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
    if (!sub || sub.categoryId !== categoryId) {
      return jsonError("Подкатегория не относится к выбранной категории", 400);
    }
  }
  return null;
}
