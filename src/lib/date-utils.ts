export const MONTH_SHORT_RU = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

export const MONTH_FULL_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export type DateRangePreset =
  | "current_month"
  | "previous_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "current_year"
  | "all_time"
  | "single_month"
  | "custom";

export interface DateRange {
  from: string;
  to: string;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayLocalDateKey(): string {
  return formatLocalDateKey(new Date());
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatUtcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function monthKeyFromParts(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function monthShortLabel(monthKey: string): string {
  const [, month] = monthKey.split("-");
  return MONTH_SHORT_RU[Number(month) - 1] ?? monthKey;
}

export function monthFullLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const name = MONTH_FULL_RU[Number(month) - 1] ?? monthKey;
  return `${name} ${year}`;
}

export function monthInputToRange(monthKey: string): DateRange {
  const [year, month] = monthKey.split("-").map(Number);
  const from = `${year}-${pad2(month)}-01`;
  const end = new Date(Date.UTC(year, month, 0));
  return { from, to: formatUtcDateKey(end) };
}

export function getDateRangePreset(preset: DateRangePreset, reference = new Date()): DateRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();

  switch (preset) {
    case "current_month": {
      const from = new Date(year, month, 1);
      return { from: formatLocalDateKey(from), to: formatLocalDateKey(reference) };
    }
    case "previous_month": {
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0);
      return { from: formatLocalDateKey(from), to: formatLocalDateKey(to) };
    }
    case "last_3_months":
    case "last_6_months":
    case "last_12_months": {
      const months = preset === "last_3_months" ? 3 : preset === "last_6_months" ? 6 : 12;
      const from = new Date(year, month - months + 1, 1);
      return { from: formatLocalDateKey(from), to: formatLocalDateKey(reference) };
    }
    case "current_year": {
      const from = new Date(year, 0, 1);
      return { from: formatLocalDateKey(from), to: formatLocalDateKey(reference) };
    }
    default:
      return { from: "", to: "" };
  }
}

export function enumerateMonthKeys(from: string, to: string): string[] {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const result: string[] = [];

  while (cursor <= last) {
    result.push(monthKeyFromDate(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

export function rangeLabel(range: DateRange): string {
  if (!range.from && !range.to) return "Всё время";
  if (range.from === range.to) return range.from;
  return `${range.from} — ${range.to}`;
}
