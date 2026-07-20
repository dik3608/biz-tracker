/**
 * Деньги в приложении.
 *
 * Базовая валюта учёта — USD: поле amount у транзакции всегда в USD.
 * originalAmount + currency + exchangeRate хранят то, что вводил пользователь.
 * Все суммирования делаются на сервере на Decimal; в JSON уходят числа,
 * округлённые до центов. Клиент никогда не пересчитывает валюту сам.
 */

export type Currency = "USD" | "EUR";

export const CURRENCIES: Currency[] = ["USD", "EUR"];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
};

/** Округление до центов без двоичных сюрпризов (129.995 → 130.00). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const usd = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eur = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdWhole = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "1 234,56 $" — основной формат сумм. */
export function formatMoney(value: number, currency: Currency = "USD"): string {
  return (currency === "EUR" ? eur : usd).format(value);
}

/** Целые доллары — для KPI-карточек, где центы — шум. */
export function formatMoneyWhole(value: number): string {
  return usdWhole.format(value);
}

/** "+1 234,56 $" / "−1 234,56 $" — суммы со знаком (прибыль, изменения). */
export function formatSigned(value: number, currency: Currency = "USD"): string {
  const formatted = formatMoney(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** "$1.2k" / "$3.4m" — только для осей графиков. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")} %`;
}

/**
 * Изменение к прошлому периоду в процентах.
 * null — когда сравнивать не с чем (прошлое значение 0): показываем «—»,
 * а не бессмысленные «+100 %».
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / previous) * 100);
}

/** Парсинг пользовательского ввода суммы: "1 234,56" / "1234.56" → 1234.56. */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  return round2(value);
}
