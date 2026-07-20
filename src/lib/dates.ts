/**
 * Единый контракт дат для всего приложения.
 *
 * Правило: во всей бизнес-логике дата — это строка "YYYY-MM-DD" (DateKey).
 * JS Date используется только в двух местах:
 *  1. Получение «сегодня» по календарю пользователя (todayKey — клиент).
 *  2. Границы Prisma-запросов (dateKeyToUtc — сервер). В БД @db.Date
 *     хранится как календарная дата; Prisma читает/пишет её как UTC-полночь.
 *
 * Никакой другой код не должен создавать Date из данных транзакций.
 */

export type DateKey = string; // "YYYY-MM-DD"
export type MonthKey = string; // "YYYY-MM"

export interface DateRange {
  from: DateKey;
  to: DateKey;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysInMonth(year: number, month: number): number {
  // month: 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Календарное «сегодня» в часовом поясе пользователя/сервера. */
export function todayKey(now: Date = new Date()): DateKey {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** UTC-полночь данной календарной даты — ТОЛЬКО для границ Prisma-запросов. */
export function dateKeyToUtc(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Обратное преобразование значения @db.Date, прочитанного Prisma (UTC-полночь). */
export function utcDateToKey(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** ISO-строка из JSON-сериализации Prisma ("2026-07-01T00:00:00.000Z") → DateKey. */
export function isoToKey(iso: string): DateKey {
  return iso.slice(0, 10);
}

// ---------- Арифметика на DateKey (без таймзон вообще) ----------

export function addDays(key: DateKey, days: number): DateKey {
  const d = dateKeyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToKey(d);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const [y, m, day] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(day, daysInMonth(ny, nm)))}`;
}

/** Разница в днях: b - a. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((dateKeyToUtc(b).getTime() - dateKeyToUtc(a).getTime()) / 86_400_000);
}

export function startOfMonthKey(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonthKey(key: DateKey): DateKey {
  const [y, m] = key.split("-").map(Number);
  return `${key.slice(0, 7)}-${pad2(daysInMonth(y, m))}`;
}

export function monthKeyOf(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function monthKeyToRange(month: MonthKey): DateRange {
  const from = `${month}-01`;
  return { from, to: endOfMonthKey(from) };
}

/** Понедельник недели, в которую входит дата (ISO-неделя). */
export function startOfWeekKey(key: DateKey): DateKey {
  const d = dateKeyToUtc(key);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  return addDays(key, -weekday);
}

export function enumerateDays(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function enumerateMonths(from: DateKey, to: DateKey): MonthKey[] {
  const out: MonthKey[] = [];
  const last = monthKeyOf(to);
  for (let k = startOfMonthKey(from); monthKeyOf(k) <= last; k = addMonths(k, 1)) {
    out.push(monthKeyOf(k));
  }
  return out;
}

// ---------- Пресеты периодов ----------

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all_time"
  | "custom";

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  last7: "7 дней",
  last30: "30 дней",
  this_month: "Этот месяц",
  last_month: "Прошлый месяц",
  this_quarter: "Квартал",
  this_year: "Год",
  all_time: "Всё время",
  custom: "Свой период",
};

/**
 * Диапазон пресета. Для all_time возвращает null — вызывающая сторона
 * трактует это как «без ограничений».
 */
export function presetRange(preset: PeriodPreset, today: DateKey): DateRange | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "this_month":
      return { from: startOfMonthKey(today), to: endOfMonthKey(today) };
    case "last_month": {
      const lm = addMonths(startOfMonthKey(today), -1);
      return { from: lm, to: endOfMonthKey(lm) };
    }
    case "this_quarter": {
      const [y, m] = today.split("-").map(Number);
      const qStart = `${y}-${pad2(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
      return { from: qStart, to: endOfMonthKey(addMonths(qStart, 2)) };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    default:
      return null;
  }
}

/**
 * Период для сравнения «а что было раньше».
 * Для календарных пресетов сравниваем сопоставимые окна:
 * этот месяц ↔ прошлый месяц (по то же число), год ↔ прошлый год.
 * Для скользящих — окно той же длины непосредственно перед from.
 * effectiveTo — конец фактических данных (обычно min(to, today)).
 */
export function previousComparableRange(
  preset: PeriodPreset,
  range: DateRange,
  today: DateKey,
): DateRange {
  const effectiveTo = range.to < today ? range.to : today;
  switch (preset) {
    case "this_month": {
      const prevStart = addMonths(range.from, -1);
      const elapsed = diffDays(range.from, effectiveTo);
      const prevEnd = addDays(prevStart, elapsed);
      return { from: prevStart, to: prevEnd < endOfMonthKey(prevStart) ? prevEnd : endOfMonthKey(prevStart) };
    }
    case "last_month": {
      const prevStart = addMonths(range.from, -1);
      return { from: prevStart, to: endOfMonthKey(prevStart) };
    }
    case "this_quarter": {
      const prevStart = addMonths(range.from, -3);
      const elapsed = diffDays(range.from, effectiveTo);
      const prevQuarterEnd = endOfMonthKey(addMonths(prevStart, 2));
      const prevEnd = addDays(prevStart, elapsed);
      return { from: prevStart, to: prevEnd < prevQuarterEnd ? prevEnd : prevQuarterEnd };
    }
    case "this_year": {
      const prevStart = addMonths(range.from, -12);
      const elapsed = diffDays(range.from, effectiveTo);
      return { from: prevStart, to: addDays(prevStart, elapsed) };
    }
    default: {
      const len = diffDays(range.from, effectiveTo) + 1;
      const prevTo = addDays(range.from, -1);
      return { from: addDays(prevTo, -(len - 1)), to: prevTo };
    }
  }
}

// ---------- Форматирование для интерфейса (русский) ----------

export const MONTH_SHORT_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
] as const;

export const MONTH_FULL_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

const WEEKDAY_SHORT_RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** "15 июл" или "15 июл 2025" если год отличается от текущего. */
export function formatDay(key: DateKey, opts: { withYear?: boolean; today?: DateKey } = {}): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = `${d} ${MONTH_SHORT_RU[m - 1]}`;
  const today = opts.today ?? todayKey();
  const withYear = opts.withYear ?? key.slice(0, 4) !== today.slice(0, 4);
  return withYear ? `${base} ${y}` : base;
}

/** "Сегодня" / "Вчера" / "15 июл, ср". */
export function formatDayHuman(key: DateKey, today: DateKey = todayKey()): string {
  if (key === today) return "Сегодня";
  if (key === addDays(today, -1)) return "Вчера";
  const weekday = WEEKDAY_SHORT_RU[(dateKeyToUtc(key).getUTCDay() + 6) % 7];
  return `${formatDay(key, { today })}, ${weekday}`;
}

export function formatMonth(month: MonthKey, opts: { short?: boolean } = {}): string {
  const [y, m] = month.split("-").map(Number);
  if (opts.short) return `${MONTH_SHORT_RU[m - 1]} ${String(y).slice(2)}`;
  return `${MONTH_FULL_RU[m - 1]} ${y}`;
}

export function formatRange(range: DateRange | null, today: DateKey = todayKey()): string {
  if (!range) return "Всё время";
  if (range.from === range.to) return formatDayHuman(range.from, today);
  if (
    range.from === startOfMonthKey(range.from) &&
    range.to === endOfMonthKey(range.from) &&
    monthKeyOf(range.from) === monthKeyOf(range.to)
  ) {
    return formatMonth(monthKeyOf(range.from));
  }
  return `${formatDay(range.from, { today })} — ${formatDay(range.to, { today })}`;
}
