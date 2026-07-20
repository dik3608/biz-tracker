/**
 * DTO-контракты между API и клиентом.
 * Все даты — строки "YYYY-MM-DD" (DateKey); все суммы — числа в долларах,
 * округлённые до центов на сервере.
 */
import type { DateKey } from "@/lib/dates";
import type { Currency } from "@/lib/money";

export type TxType = "INCOME" | "EXPENSE";

export interface CategoryDto {
  id: string;
  name: string;
  type: TxType;
  color: string;
  sortOrder: number;
  subcategories: SubcategoryDto[];
  /** Сколько транзакций ссылается на категорию (для настроек). */
  transactionCount?: number;
}

export interface SubcategoryDto {
  id: string;
  name: string;
  categoryId: string;
  sortOrder: number;
  transactionCount?: number;
}

export interface TransactionDto {
  id: string;
  type: TxType;
  /** Сумма в USD — базовая валюта учёта. */
  amount: number;
  /** Введённая пользователем сумма в её валюте. */
  originalAmount: number;
  currency: Currency;
  exchangeRate: number;
  description: string;
  date: DateKey;
  tags: string[];
  category: { id: string; name: string; color: string };
  subcategory: { id: string; name: string } | null;
  createdAt: string;
}

export interface TransactionListResponse {
  transactions: TransactionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Итоги по всему отфильтрованному набору (не только текущей странице). */
  totals: {
    income: number;
    expense: number;
    net: number;
  };
}

export interface SummaryResponse {
  income: number;
  expense: number;
  profit: number;
  /** Маржа в процентах или null, если дохода нет. */
  margin: number | null;
  transactionCount: number;
  previous: {
    income: number;
    expense: number;
    profit: number;
    from: DateKey;
    to: DateKey;
  } | null;
  /** Изменения к прошлому периоду в %, null = сравнивать не с чем. */
  incomeChange: number | null;
  expenseChange: number | null;
  profitChange: number | null;
}

export type SeriesGranularity = "day" | "week" | "month";

export interface SeriesPoint {
  /** DateKey начала интервала (день, понедельник недели, 1-е число месяца). */
  bucket: DateKey;
  income: number;
  expense: number;
  profit: number;
}

export interface SeriesResponse {
  granularity: SeriesGranularity;
  points: SeriesPoint[];
}

export interface CategoryBreakdownRow {
  categoryId: string;
  name: string;
  color: string;
  type: TxType;
  total: number;
  /** Доля от общей суммы своего типа за период, 0–100. */
  share: number;
  transactionCount: number;
  subcategories: {
    subcategoryId: string | null;
    name: string;
    total: number;
    transactionCount: number;
  }[];
}

export interface BreakdownResponse {
  income: CategoryBreakdownRow[];
  expense: CategoryBreakdownRow[];
}

export interface MonthlyReportRow {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  profit: number;
}

export interface ExchangeRateResponse {
  /** Сколько USD стоит 1 EUR. */
  rate: number;
  date: string;
  source: "live" | "fallback";
}

/** Тело создания/обновления транзакции. */
export interface TransactionInput {
  type: TxType;
  /** Сумма в валюте currency (то, что ввёл пользователь). */
  amount: number;
  currency: Currency;
  /** Курс EUR→USD; для USD игнорируется. */
  exchangeRate?: number;
  description: string;
  categoryId: string;
  subcategoryId?: string | null;
  date: DateKey;
  tags?: string[];
}

export interface ApiError {
  error: string;
}
