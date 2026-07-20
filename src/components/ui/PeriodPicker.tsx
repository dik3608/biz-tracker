"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonthKey,
  formatRange,
  monthKeyOf,
  PERIOD_PRESET_LABELS,
  presetRange,
  startOfMonthKey,
  todayKey,
  type DateRange,
  type PeriodPreset,
} from "@/lib/dates";
import { RangeCalendar } from "./Calendar";

/** Состояние выбора периода: пресет + фактический диапазон (null = всё время). */
export interface Period {
  preset: PeriodPreset;
  range: DateRange | null;
}

export function defaultPeriod(): Period {
  const today = todayKey();
  return { preset: "this_month", range: presetRange("this_month", today) };
}

/**
 * Период с сохранением в localStorage: страницы дашборда и отчётов
 * помнят выбор между визитами.
 */
export function usePeriod(storageKey: string): [Period, (p: Period) => void] {
  const [period, setPeriod] = useState<Period>(defaultPeriod);

  useEffect(() => {
    // Чтение localStorage возможно только на клиенте после гидратации —
    // ленивый useState дал бы расхождение с SSR-разметкой
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Period;
      if (saved && saved.preset) {
        // Пресеты, зависящие от «сегодня», пересчитываем на текущую дату
        if (saved.preset !== "custom" && saved.preset !== "all_time") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPeriod({ preset: saved.preset, range: presetRange(saved.preset, todayKey()) });
        } else {
          setPeriod(saved);
        }
      }
    } catch {
      // повреждённое значение игнорируем
    }
  }, [storageKey]);

  const update = (p: Period) => {
    setPeriod(p);
    try {
      localStorage.setItem(storageKey, JSON.stringify(p));
    } catch {
      // квота/приватный режим — некритично
    }
  };

  return [period, update];
}

const PRESETS: PeriodPreset[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "all_time",
];

/** Сдвиг периода стрелками: месяц двигается на месяц, день — на день, иначе на длину окна. */
function shiftPeriod(period: Period, direction: 1 | -1): Period {
  if (!period.range) return period;
  const { from, to } = period.range;
  const isFullMonth =
    from === startOfMonthKey(from) && to === endOfMonthKey(from) && monthKeyOf(from) === monthKeyOf(to);
  if (isFullMonth) {
    const nf = addMonths(from, direction);
    return { preset: "custom", range: { from: nf, to: endOfMonthKey(nf) } };
  }
  const len = diffDays(from, to) + 1;
  return {
    preset: "custom",
    range: { from: addDays(from, direction * len), to: addDays(to, direction * len) },
  };
}

export function PeriodPicker({
  value,
  onChange,
  className,
}: {
  value: Period;
  onChange: (p: Period) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = todayKey();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pickPreset = (preset: PeriodPreset) => {
    if (preset === "custom") return;
    onChange({ preset, range: presetRange(preset, today) });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <div className="flex items-center gap-1">
        <button
          aria-label="Предыдущий период"
          onClick={() => onChange(shiftPeriod(value, -1))}
          disabled={!value.range}
          className="flex h-9 w-8 items-center justify-center rounded-control border border-edge bg-surface-2 text-ink-3 transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={clsx(
            "flex h-9 min-w-[170px] items-center justify-center gap-2 rounded-control border px-3.5 text-[13px] font-medium transition-colors",
            open
              ? "border-accent bg-surface-2 text-ink"
              : "border-edge bg-surface-2 text-ink hover:border-edge-strong",
          )}
        >
          <CalendarDays size={14} className="text-ink-3" />
          {formatRange(value.range, today)}
        </button>
        <button
          aria-label="Следующий период"
          onClick={() => onChange(shiftPeriod(value, 1))}
          disabled={!value.range}
          className="flex h-9 w-8 items-center justify-center rounded-control border border-edge bg-surface-2 text-ink-3 transition-colors hover:border-edge-strong hover:text-ink disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {open ? (
        <div className="anim-pop absolute right-0 top-11 z-40 flex overflow-hidden rounded-card border border-edge-strong bg-surface shadow-2xl shadow-black/50">
          <div className="w-[150px] border-r border-edge py-1.5">
            {PRESETS.map((p) => {
              const active =
                value.preset === p ||
                (p !== "all_time" &&
                  value.range &&
                  JSON.stringify(presetRange(p, today)) === JSON.stringify(value.range));
              return (
                <button
                  key={p}
                  onClick={() => pickPreset(p)}
                  className={clsx(
                    "flex w-full items-center justify-between px-3.5 py-[7px] text-left text-[13px] transition-colors",
                    active ? "font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {PERIOD_PRESET_LABELS[p]}
                  {active ? <Check size={14} className="text-accent" /> : null}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            <RangeCalendar
              value={value.preset === "custom" ? value.range : null}
              onChange={(range) => {
                onChange({ preset: "custom", range });
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
