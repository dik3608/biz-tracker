/**
 * Исполнение действий AI-ассистента (create/edit/delete транзакций,
 * категорий и подкатегорий). Используется роутами /api/ai/action и
 * /api/ai/quick напрямую — без self-fetch.
 *
 * Формат результата совместим со старым wire-форматом /api/ai/action:
 * { ok, result, transactionId?, categoryId?, subcategoryId? } + HTTP-статус.
 */
import { prisma } from "@/lib/prisma";
import { Prisma, TxType } from "@/generated/prisma/client";
import {
  amountSchema,
  currencySchema,
  makeSlug,
  transactionInputSchema,
  txTypeSchema,
  validateCategoryPair,
} from "@/lib/api-server";
import { dateKeyToUtc, isDateKey, todayKey, utcDateToKey, type DateKey } from "@/lib/dates";
import { round2 } from "@/lib/money";

export interface AiActionResult {
  ok: boolean;
  /** Русское описание результата (уходит в UI как есть). */
  result: string;
  /** HTTP-статус для роута /api/ai/action. */
  status: number;
  transactionId?: string;
  categoryId?: string;
  subcategoryId?: string;
}

/** Ошибка действия с человекочитаемым текстом и статусом. */
class ActionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const EUR_FALLBACK_RATE = 1.16;

/** Курс EUR→USD на дату операции (frankfurter.app, таймаут 5с, fallback 1.16). */
async function fetchEurUsdRate(date: DateKey): Promise<number> {
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=USD`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number } };
    const rate = data.rates?.USD;
    if (typeof rate === "number" && rate > 0) return rate;
    throw new Error("Некорректный курс");
  } catch {
    return EUR_FALLBACK_RATE;
  }
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Приводит дату из действия модели к DateKey ("YYYY-MM-DD").
 * Принимает как чистый DateKey, так и ISO-строку ("2026-07-22T00:00:00Z" →
 * берём первые 10 символов). Если строки нет или она не парсится (пусто,
 * плейсхолдер "{TODAY}", мусор) — возвращает null, чтобы вызывающий код
 * подставил дату по умолчанию. Так создание записи не падает из-за даты.
 */
function coerceDateKey(rawDate: unknown): DateKey | null {
  if (typeof rawDate !== "string") return null;
  const candidate = rawDate.trim().slice(0, 10);
  return isDateKey(candidate) ? candidate : null;
}

/** Достаёт русский текст ошибки из NextResponse, который вернул validateCategoryPair. */
async function categoryPairError(
  type: TxType,
  categoryId: string,
  subcategoryId: string | null,
): Promise<ActionError | null> {
  const resp = await validateCategoryPair(type, categoryId, subcategoryId);
  if (!resp) return null;
  let message = "Категория не соответствует типу операции";
  try {
    const body = (await resp.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // оставляем текст по умолчанию
  }
  return new ActionError(message, 400);
}

/**
 * Категория по id или имени. Поиск по имени — только среди категорий нужного
 * типа (без учёта регистра); если нет — создаётся с этим типом и slug.
 */
async function resolveCategory(
  categoryId: string | undefined,
  categoryName: string | undefined,
  type: TxType,
): Promise<string> {
  if (categoryId) {
    const byId = await prisma.category.findUnique({ where: { id: categoryId } });
    if (byId) return byId.id;
  }

  if (categoryName) {
    const byName = await prisma.category.findFirst({
      where: { type, name: { equals: categoryName, mode: "insensitive" } },
    });
    if (byName) return byName.id;

    const slug = makeSlug(categoryName);
    try {
      // sortOrder = max+1, как в POST /api/categories, иначе перестановка
      // в настройках не работает для категорий с одинаковым sortOrder
      const maxOrder = await prisma.category.aggregate({
        where: { type },
        _max: { sortOrder: true },
      });
      const created = await prisma.category.create({
        data: {
          name: categoryName,
          type,
          slug,
          color: "#7a88ff",
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });
      return created.id;
    } catch {
      // Гонка по unique [type, slug]: перечитываем
      const again = await prisma.category.findFirst({
        where: {
          type,
          OR: [{ name: { equals: categoryName, mode: "insensitive" } }, { slug }],
        },
      });
      if (again) return again.id;
      throw new ActionError("Не удалось создать категорию", 500);
    }
  }

  throw new ActionError("Не указана категория (categoryId или categoryName)", 400);
}

/** Подкатегория по id или имени внутри категории; создаётся при отсутствии. */
async function resolveSubcategory(
  subcategoryId: string | undefined,
  subcategoryName: string | undefined,
  categoryId: string,
): Promise<string | null> {
  if (subcategoryId) {
    const byId = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
    if (byId && byId.categoryId === categoryId) return byId.id;
  }

  if (subcategoryName) {
    const byName = await prisma.subcategory.findFirst({
      where: { categoryId, name: { equals: subcategoryName, mode: "insensitive" } },
    });
    if (byName) return byName.id;

    try {
      const created = await prisma.subcategory.create({
        data: { name: subcategoryName, categoryId },
      });
      return created.id;
    } catch {
      // Гонка по unique [categoryId, name]
      const again = await prisma.subcategory.findFirst({
        where: { categoryId, name: { equals: subcategoryName, mode: "insensitive" } },
      });
      if (again) return again.id;
      throw new ActionError("Не удалось создать подкатегорию", 500);
    }
  }

  return null;
}

/** Категория по id или имени (любого типа) — для операций над подкатегориями. */
async function findCategoryAnyType(
  categoryId: string | undefined,
  categoryName: string | undefined,
): Promise<{ id: string; name: string; type: TxType } | null> {
  if (categoryId) {
    const byId = await prisma.category.findUnique({ where: { id: categoryId } });
    if (byId) return byId;
  }
  if (categoryName) {
    return prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: "insensitive" } },
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Обработчики действий
// ---------------------------------------------------------------------------

async function createTransaction(
  raw: Record<string, unknown>,
  today: DateKey,
): Promise<AiActionResult> {
  const type: TxType = raw.type === "INCOME" ? "INCOME" : "EXPENSE";
  const currency = raw.currency === "EUR" ? "EUR" : "USD";
  const rawRate = toNumber(raw.exchangeRate);

  const scalarSchema = transactionInputSchema.omit({
    categoryId: true,
    subcategoryId: true,
    tags: true,
  });
  const parsed = scalarSchema.safeParse({
    type,
    amount: toNumber(raw.amount),
    currency,
    exchangeRate: rawRate !== undefined && rawRate > 0 && rawRate <= 1000 ? rawRate : undefined,
    description: toStr(raw.description) ?? "",
    // Модель иногда не присылает дату — тогда операция «сегодня» по календарю
    // пользователя (fallback), а не ошибка валидации.
    date: coerceDateKey(raw.date) ?? today,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ActionError(`${path}${issue.message}`, 400);
  }
  const input = parsed.data;

  const rate =
    input.currency === "EUR"
      ? (input.exchangeRate ?? (await fetchEurUsdRate(input.date)))
      : 1;
  const amountUsd = round2(input.amount * rate);

  const categoryId = await resolveCategory(toStr(raw.categoryId), toStr(raw.categoryName), type);
  const subcategoryId = await resolveSubcategory(
    toStr(raw.subcategoryId),
    toStr(raw.subcategoryName),
    categoryId,
  );

  const pairError = await categoryPairError(type, categoryId, subcategoryId);
  if (pairError) throw pairError;

  const tx = await prisma.transaction.create({
    data: {
      type,
      amount: new Prisma.Decimal(amountUsd.toFixed(2)),
      originalAmount: new Prisma.Decimal(input.amount.toFixed(2)),
      currency: input.currency,
      exchangeRate: new Prisma.Decimal(rate.toFixed(6)),
      description: input.description,
      categoryId,
      subcategoryId,
      date: dateKeyToUtc(input.date),
    },
    include: { category: true, subcategory: true },
  });

  const subLabel = tx.subcategory ? ` → ${tx.subcategory.name}` : "";
  return {
    ok: true,
    status: 200,
    result: `Запись создана: ${tx.category.name}${subLabel} — ${tx.description} — $${amountUsd.toFixed(2)}`,
    transactionId: tx.id,
    categoryId,
    subcategoryId: subcategoryId ?? undefined,
  };
}

async function editTransaction(raw: Record<string, unknown>): Promise<AiActionResult> {
  const txId = toStr(raw.transactionId);
  if (!txId) throw new ActionError("Не указан transactionId", 400);

  const tx = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!tx) throw new ActionError("Запись не найдена", 404);

  const data: Prisma.TransactionUpdateInput = {};

  // --- Простые поля: меняем только присланные ---
  if (raw.description !== undefined) {
    const d = transactionInputSchema.shape.description.safeParse(String(raw.description ?? ""));
    if (!d.success) throw new ActionError(`description: ${d.error.issues[0].message}`, 400);
    data.description = d.data;
  }

  let dateKey: DateKey | undefined;
  if (raw.date !== undefined) {
    const key = coerceDateKey(raw.date);
    if (!key) throw new ActionError("date: дата должна быть в формате YYYY-MM-DD", 400);
    dateKey = key;
    data.date = dateKeyToUtc(dateKey);
  }

  // --- Тип: только если прислан явно ---
  let newType: TxType = tx.type;
  if (raw.type !== undefined) {
    const t = txTypeSchema.safeParse(raw.type);
    if (!t.success) throw new ActionError("type: допустимо INCOME или EXPENSE", 400);
    newType = t.data;
    data.type = newType;
  }

  // --- Категория и подкатегория ---
  let categoryId = tx.categoryId;
  let subcategoryId: string | null = tx.subcategoryId;
  const catRef = toStr(raw.categoryId);
  const catName = toStr(raw.categoryName);
  if (catRef || catName) {
    categoryId = await resolveCategory(catRef, catName, newType);
    data.category = { connect: { id: categoryId } };
    // Старая подкатегория относится к прежней категории — сбрасываем
    subcategoryId = null;
    data.subcategory = { disconnect: true };
  }
  if (raw.subcategoryId === null || raw.subcategoryId === "") {
    subcategoryId = null;
    data.subcategory = { disconnect: true };
  } else if (toStr(raw.subcategoryId) || toStr(raw.subcategoryName)) {
    subcategoryId = await resolveSubcategory(
      toStr(raw.subcategoryId),
      toStr(raw.subcategoryName),
      categoryId,
    );
    if (subcategoryId) data.subcategory = { connect: { id: subcategoryId } };
  }

  const pairError = await categoryPairError(newType, categoryId, subcategoryId);
  if (pairError) throw pairError;

  // --- Деньги: валюту не меняем, пока её не прислали явно ---
  const amountProvided = raw.amount !== undefined;
  const currencyProvided = raw.currency !== undefined;
  const rawRate = toNumber(raw.exchangeRate);
  const rateProvided = rawRate !== undefined && rawRate > 0 && rawRate <= 1000;

  if (amountProvided || currencyProvided || rateProvided) {
    let currency: "USD" | "EUR";
    if (currencyProvided) {
      const c = currencySchema.safeParse(raw.currency);
      if (!c.success) throw new ActionError("currency: допустимо USD или EUR", 400);
      currency = c.data;
    } else {
      currency = tx.currency === "EUR" ? "EUR" : "USD";
    }

    let amount: number;
    if (amountProvided) {
      const a = amountSchema.safeParse(toNumber(raw.amount));
      if (!a.success) throw new ActionError(`amount: ${a.error.issues[0].message}`, 400);
      amount = a.data;
    } else {
      amount = Number(tx.originalAmount);
    }

    let rate: number;
    if (currency === "USD") {
      rate = 1;
    } else if (rateProvided) {
      rate = rawRate;
    } else if (!currencyProvided && Number(tx.exchangeRate) > 0) {
      // EUR-запись, меняется только сумма — пересчёт по СОХРАНЁННОМУ курсу
      rate = Number(tx.exchangeRate);
    } else {
      rate = await fetchEurUsdRate(dateKey ?? utcDateToKey(tx.date));
    }

    data.currency = currency;
    data.exchangeRate = new Prisma.Decimal(rate.toFixed(6));
    data.originalAmount = new Prisma.Decimal(amount.toFixed(2));
    data.amount = new Prisma.Decimal(round2(amount * rate).toFixed(2));
  }

  await prisma.transaction.update({ where: { id: tx.id }, data });
  return { ok: true, status: 200, result: "Запись обновлена", transactionId: tx.id };
}

async function deleteTransaction(raw: Record<string, unknown>): Promise<AiActionResult> {
  const txId = toStr(raw.transactionId);
  if (!txId) throw new ActionError("Не указан transactionId", 400);

  const tx = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!tx) throw new ActionError("Запись не найдена", 404);

  await prisma.transaction.delete({ where: { id: tx.id } });
  return {
    ok: true,
    status: 200,
    result: `Удалено: ${tx.description} — $${Number(tx.amount).toFixed(2)}`,
  };
}

async function createCategory(raw: Record<string, unknown>): Promise<AiActionResult> {
  const name = toStr(raw.name);
  if (!name) throw new ActionError("Не указано название категории", 400);
  const type: TxType = raw.type === "INCOME" ? "INCOME" : "EXPENSE";
  const rawColor = toStr(raw.color);
  const color = rawColor && /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#6366f1";

  const existing = await prisma.category.findFirst({
    where: { type, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return {
      ok: true,
      status: 200,
      result: `Категория "${existing.name}" уже существует`,
      categoryId: existing.id,
    };
  }

  const slug = makeSlug(name);
  try {
    const maxOrder = await prisma.category.aggregate({
      where: { type },
      _max: { sortOrder: true },
    });
    const cat = await prisma.category.create({
      data: { name, type, slug, color, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    });
    return { ok: true, status: 200, result: `Категория "${cat.name}" создана`, categoryId: cat.id };
  } catch {
    // Гонка по unique [type, slug]: перечитываем
    const again = await prisma.category.findFirst({
      where: { type, OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
    });
    if (again) {
      return {
        ok: true,
        status: 200,
        result: `Категория "${again.name}" уже существует`,
        categoryId: again.id,
      };
    }
    throw new ActionError("Не удалось создать категорию", 500);
  }
}

async function editCategory(raw: Record<string, unknown>): Promise<AiActionResult> {
  const newName = toStr(raw.name);
  if (!newName) throw new ActionError("Не указано новое название категории", 400);

  const found = await findCategoryAnyType(toStr(raw.categoryId), toStr(raw.categoryName));
  if (!found) throw new ActionError("Категория не найдена", 404);

  await prisma.category.update({ where: { id: found.id }, data: { name: newName } });
  return {
    ok: true,
    status: 200,
    result: `Категория переименована в "${newName}"`,
    categoryId: found.id,
  };
}

async function deleteCategory(raw: Record<string, unknown>): Promise<AiActionResult> {
  const found = await findCategoryAnyType(toStr(raw.categoryId), toStr(raw.categoryName));
  if (!found) throw new ActionError("Категория не найдена", 404);

  const txCount = await prisma.transaction.count({ where: { categoryId: found.id } });
  if (txCount > 0) {
    throw new ActionError(`Невозможно удалить: ${txCount} записей используют эту категорию`, 400);
  }

  // Подкатегории удаляются каскадом (onDelete: Cascade)
  await prisma.category.delete({ where: { id: found.id } });
  return { ok: true, status: 200, result: "Категория удалена" };
}

async function createSubcategory(raw: Record<string, unknown>): Promise<AiActionResult> {
  const name = toStr(raw.name);
  if (!name) throw new ActionError("Не указано название подкатегории", 400);

  let category = await findCategoryAnyType(toStr(raw.categoryId), toStr(raw.categoryName));
  if (!category) {
    const catName = toStr(raw.categoryName);
    if (!catName) throw new ActionError("Не указана категория (categoryId или categoryName)", 400);
    // Совместимость со старым поведением: создаём категорию-расход
    const createdId = await resolveCategory(undefined, catName, "EXPENSE");
    category = await prisma.category.findUnique({ where: { id: createdId } });
    if (!category) throw new ActionError("Не удалось создать категорию", 500);
  }

  const existing = await prisma.subcategory.findFirst({
    where: { categoryId: category.id, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return {
      ok: true,
      status: 200,
      result: `Подкатегория "${existing.name}" уже существует`,
      subcategoryId: existing.id,
      categoryId: category.id,
    };
  }

  const subId = await resolveSubcategory(undefined, name, category.id);
  return {
    ok: true,
    status: 200,
    result: `Подкатегория "${name}" создана`,
    subcategoryId: subId ?? undefined,
    categoryId: category.id,
  };
}

async function deleteSubcategory(raw: Record<string, unknown>): Promise<AiActionResult> {
  let subId = toStr(raw.subcategoryId);
  const subName = toStr(raw.subcategoryName);
  const catName = toStr(raw.categoryName);

  if (subId) {
    const byId = await prisma.subcategory.findUnique({ where: { id: subId } });
    if (!byId) subId = undefined;
  }
  if (!subId && subName && catName) {
    const cat = await findCategoryAnyType(undefined, catName);
    if (cat) {
      const sub = await prisma.subcategory.findFirst({
        where: { categoryId: cat.id, name: { equals: subName, mode: "insensitive" } },
      });
      if (sub) subId = sub.id;
    }
  }
  if (!subId) throw new ActionError("Подкатегория не найдена", 404);

  await prisma.transaction.updateMany({
    where: { subcategoryId: subId },
    data: { subcategoryId: null },
  });
  await prisma.subcategory.delete({ where: { id: subId } });
  return { ok: true, status: 200, result: "Подкатегория удалена" };
}

// ---------------------------------------------------------------------------
// Точка входа
// ---------------------------------------------------------------------------

/**
 * Исполняет одно действие ассистента; никогда не бросает исключений.
 * options.today — «сегодня» по календарю пользователя (для операций без даты);
 * по умолчанию берётся календарь сервера.
 */
export async function executeAiAction(
  payload: unknown,
  options: { today?: DateKey } = {},
): Promise<AiActionResult> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, result: "Некорректное действие" };
  }
  const raw = payload as Record<string, unknown>;
  const action = typeof raw.action === "string" ? raw.action : "";
  const today = options.today ?? todayKey();

  try {
    switch (action) {
      case "create_transaction":
        return await createTransaction(raw, today);
      case "edit_transaction":
        return await editTransaction(raw);
      case "delete_transaction":
        return await deleteTransaction(raw);
      case "create_category":
        return await createCategory(raw);
      case "edit_category":
        return await editCategory(raw);
      case "delete_category":
        return await deleteCategory(raw);
      case "create_subcategory":
        return await createSubcategory(raw);
      case "delete_subcategory":
        return await deleteSubcategory(raw);
      default:
        return { ok: false, status: 400, result: `Неизвестное действие: ${action || "—"}` };
    }
  } catch (err) {
    if (err instanceof ActionError) {
      return { ok: false, status: err.status, result: err.message };
    }
    return {
      ok: false,
      status: 500,
      result: `Ошибка: ${err instanceof Error ? err.message : "Неизвестная"}`,
    };
  }
}
