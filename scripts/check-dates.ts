// Санити-проверка логики дат: npx tsx scripts/check-dates.ts
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  endOfMonthKey,
  enumerateDays,
  enumerateMonths,
  isDateKey,
  presetRange,
  previousComparableRange,
  startOfWeekKey,
  utcDateToKey,
  dateKeyToUtc,
} from "../src/lib/dates";

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.error(`FAIL  ${label}: got ${a}, want ${e}`);
  }
}

// Базовая арифметика
eq(addDays("2026-03-01", -1), "2026-02-28", "addDays через границу месяца");
eq(addDays("2024-02-28", 1), "2024-02-29", "високосный год");
eq(addDays("2026-12-31", 1), "2027-01-01", "через новый год");
eq(addMonths("2026-01-31", 1), "2026-02-28", "addMonths с клампом дня");
eq(addMonths("2026-01-15", -2), "2025-11-15", "addMonths назад через год");
eq(diffDays("2026-07-01", "2026-07-31"), 30, "diffDays");
eq(daysInMonth(2026, 2), 28, "февраль 2026");
eq(endOfMonthKey("2026-02-10"), "2026-02-28", "endOfMonthKey");
eq(startOfWeekKey("2026-07-19"), "2026-07-13", "воскресенье → понедельник той недели");
eq(startOfWeekKey("2026-07-13"), "2026-07-13", "понедельник → сам понедельник");
eq(isDateKey("2026-02-30"), false, "невалидная дата отвергается");
eq(isDateKey("2026-07-19"), true, "валидная дата");
eq(enumerateMonths("2026-01-15", "2026-03-02"), ["2026-01", "2026-02", "2026-03"], "enumerateMonths");
eq(enumerateDays("2026-07-01", "2026-07-03").length, 3, "enumerateDays");

// Round-trip хранения: DateKey → UTC-полночь → DateKey
eq(utcDateToKey(dateKeyToUtc("2026-07-19")), "2026-07-19", "round-trip UTC");

// Пресеты (сегодня = 2026-07-19, воскресенье)
const T = "2026-07-19";
eq(presetRange("today", T), { from: T, to: T }, "today");
eq(presetRange("yesterday", T), { from: "2026-07-18", to: "2026-07-18" }, "yesterday");
eq(presetRange("last7", T), { from: "2026-07-13", to: T }, "last7 = 7 дней включительно");
eq(presetRange("this_month", T), { from: "2026-07-01", to: "2026-07-31" }, "this_month");
eq(presetRange("last_month", T), { from: "2026-06-01", to: "2026-06-30" }, "last_month");
eq(presetRange("this_quarter", T), { from: "2026-07-01", to: "2026-09-30" }, "this_quarter");
eq(presetRange("this_year", T), { from: "2026-01-01", to: "2026-12-31" }, "this_year");
eq(presetRange("all_time", T), null, "all_time = null");

// Сравнимые прошлые периоды
eq(
  previousComparableRange("this_month", { from: "2026-07-01", to: "2026-07-31" }, T),
  { from: "2026-06-01", to: "2026-06-19" },
  "this_month → прошлый месяц по то же число (MTD)",
);
eq(
  previousComparableRange("last_month", { from: "2026-06-01", to: "2026-06-30" }, T),
  { from: "2026-05-01", to: "2026-05-31" },
  "last_month → позапрошлый целиком",
);
eq(
  previousComparableRange("custom", { from: "2026-07-10", to: "2026-07-16" }, T),
  { from: "2026-07-03", to: "2026-07-09" },
  "custom 7 дней → предыдущие 7 дней",
);
eq(
  previousComparableRange("today", { from: T, to: T }, T),
  { from: "2026-07-18", to: "2026-07-18" },
  "today → вчера",
);
eq(
  previousComparableRange("this_year", { from: "2026-01-01", to: "2026-12-31" }, T),
  { from: "2025-01-01", to: "2025-07-19" },
  "this_year → прошлый год до той же даты (YTD)",
);
// Январь: this_month через границу года
eq(
  previousComparableRange("this_month", { from: "2026-01-01", to: "2026-01-31" }, "2026-01-15"),
  { from: "2025-12-01", to: "2025-12-15" },
  "январь MTD → декабрь по то же число",
);

if (failed) {
  console.error(`\n${failed} проверок провалено`);
  process.exit(1);
}
console.log("\nВсе проверки дат прошли.");
