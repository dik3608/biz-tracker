"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  daysInMonth,
  dateKeyToUtc,
  MONTH_FULL_RU,
  startOfMonthKey,
  todayKey,
  type DateKey,
  type DateRange,
} from "@/lib/dates";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function monthGrid(monthStart: DateKey): (DateKey | null)[] {
  const [y, m] = monthStart.split("-").map(Number);
  const firstWeekday = (dateKeyToUtc(monthStart).getUTCDay() + 6) % 7; // 0 = Пн
  const total = daysInMonth(y, m);
  const cells: (DateKey | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${monthStart.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  }
  return cells;
}

function MonthView({
  monthStart,
  range,
  hovered,
  onHover,
  onPick,
  today,
}: {
  monthStart: DateKey;
  range: Partial<DateRange>;
  hovered: DateKey | null;
  onHover: (d: DateKey | null) => void;
  onPick: (d: DateKey) => void;
  today: DateKey;
}) {
  const { from, to } = range;
  // Пока выбрана только начальная дата, подсвечиваем диапазон до курсора
  const previewTo = from && !to && hovered && hovered >= from ? hovered : to;

  const inRange = (d: DateKey) => !!from && !!previewTo && d >= from && d <= previewTo;

  return (
    <div className="w-[238px]">
      <div className="mb-1.5 text-center text-[13px] font-semibold text-ink">
        {MONTH_FULL_RU[Number(monthStart.slice(5, 7)) - 1]} {monthStart.slice(0, 4)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[11px] font-medium text-ink-3">
            {w}
          </div>
        ))}
        {monthGrid(monthStart).map((d, i) =>
          d === null ? (
            <div key={`e${i}`} />
          ) : (
            <button
              key={d}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              className={clsx(
                "relative mx-auto flex h-7.5 w-7.5 items-center justify-center rounded-[8px] text-[12.5px] tnum transition-colors",
                inRange(d) && d !== from && d !== previewTo && "bg-accent/15 rounded-none",
                (d === from || d === previewTo) && "bg-accent font-semibold text-accent-ink",
                !inRange(d) && d !== from && "text-ink-2 hover:bg-surface-3 hover:text-ink",
                d === today && d !== from && d !== previewTo && "font-bold text-accent",
                d > today && "opacity-40",
              )}
            >
              {Number(d.slice(8, 10))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Двухмесячный календарь выбора диапазона: первый клик — начало,
 * второй — конец (клик раньше начала переносит начало).
 */
export function RangeCalendar({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (range: DateRange) => void;
}) {
  const today = todayKey();
  const [draft, setDraft] = useState<Partial<DateRange>>(value ?? {});
  const [hovered, setHovered] = useState<DateKey | null>(null);
  const [viewMonth, setViewMonth] = useState<DateKey>(
    startOfMonthKey(value?.to ?? today),
  );

  const leftMonth = addMonths(viewMonth, -1);

  const pick = (d: DateKey) => {
    if (draft.from && !draft.to && d >= draft.from) {
      const complete = { from: draft.from, to: d };
      setDraft(complete);
      onChange(complete);
    } else {
      setDraft({ from: d });
    }
  };

  return (
    <div>
      <div className="relative flex gap-5">
        <button
          aria-label="Предыдущий месяц"
          onClick={() => setViewMonth(addMonths(viewMonth, -1))}
          className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface-3 hover:text-ink"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          aria-label="Следующий месяц"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface-3 hover:text-ink"
        >
          <ChevronRight size={15} />
        </button>
        <MonthView
          monthStart={leftMonth}
          range={draft}
          hovered={hovered}
          onHover={setHovered}
          onPick={pick}
          today={today}
        />
        <div className="hidden sm:block">
          <MonthView
            monthStart={viewMonth}
            range={draft}
            hovered={hovered}
            onHover={setHovered}
            onPick={pick}
            today={today}
          />
        </div>
      </div>
      {draft.from && !draft.to ? (
        <p className="mt-2 text-center text-[12px] text-ink-3">
          Выберите конечную дату{" "}
          <button
            className="text-accent hover:underline"
            onClick={() => {
              const single = { from: draft.from!, to: draft.from! };
              setDraft(single);
              onChange(single);
            }}
          >
            или возьмите один день
          </button>
        </p>
      ) : null}
    </div>
  );
}
