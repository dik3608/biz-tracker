"use client";

/**
 * Общая форма транзакции: создание (страница «Добавить») и редактирование
 * (страница «Операции»). Никакой AI-магии — быстрая и предсказуемая.
 */

import type * as React from "react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import clsx from "clsx";
import { apiGet } from "@/lib/api-client";
import { addDays, formatDay, isDateKey, todayKey, type DateKey } from "@/lib/dates";
import { formatMoney, parseAmountInput, round2, type Currency } from "@/lib/money";
import type {
  CategoryDto,
  ExchangeRateResponse,
  TransactionDto,
  TransactionInput,
  TxType,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, inputClasses } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CategoryDot } from "@/components/ui/misc";
import { errorMessage, useToast } from "@/components/ui/Toast";

export interface TransactionFormProps {
  /** null = создание новой транзакции. */
  initial: TransactionDto | null;
  categories: CategoryDto[];
  /** Кидает ApiRequestError при ошибке — форма покажет toast и снимет loading. */
  onSubmit: (input: TransactionInput) => Promise<void>;
  submitLabel: string;
  onCancel: () => void;
  /**
   * Стартовые значения при создании (учитывается только при initial === null):
   * серийный ввод на странице «Добавить» сохраняет тип/категорию/дату.
   */
  sticky?: { type: TxType; categoryId: string | null; date: DateKey } | null;
}

interface FormErrors {
  amount?: string;
  description?: string;
  category?: string;
  date?: string;
  rate?: string;
}

const TYPE_OPTIONS = [
  { value: "EXPENSE" as TxType, label: "Расход", tone: "expense" as const },
  { value: "INCOME" as TxType, label: "Доход", tone: "income" as const },
];

const CURRENCY_OPTIONS = [
  { value: "USD" as Currency, label: "USD" },
  { value: "EUR" as Currency, label: "EUR" },
];

function parseRate(raw: string): number | null {
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Группа «подпись + контрол + ошибка» на div (для чипов-кнопок вместо label). */
function ChipGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-danger">{error}</span> : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-ink"
          : "border-edge bg-surface-2 text-ink-2 hover:border-edge-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function TransactionForm({
  initial,
  categories,
  onSubmit,
  submitLabel,
  onCancel,
  sticky = null,
}: TransactionFormProps): React.JSX.Element {
  const { toast } = useToast();
  const today = todayKey();
  const yesterday = addDays(today, -1);

  const [type, setType] = useState<TxType>(initial?.type ?? sticky?.type ?? "EXPENSE");
  const [amount, setAmount] = useState<string>(initial ? String(initial.originalAmount) : "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "USD");
  const [rate, setRate] = useState<string>(initial ? String(initial.exchangeRate) : "");
  const [rateMeta, setRateMeta] = useState<{ date: string; source: "live" | "fallback" } | null>(
    null,
  );
  const [rateLoading, setRateLoading] = useState(false);
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category.id ?? sticky?.categoryId ?? null,
  );
  const [subcategoryId, setSubcategoryId] = useState<string | null>(
    initial?.subcategory?.id ?? null,
  );
  const [date, setDate] = useState<string>(initial?.date ?? sticky?.date ?? today);
  const [tags, setTags] = useState<string>(initial ? initial.tags.join(", ") : "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const clearError = (key: keyof FormErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );
  const selectedCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) ?? null : null),
    [categories, categoryId],
  );

  function changeType(next: TxType) {
    setType(next);
    // Сбрасываем категорию, только если она не подходит новому типу.
    const current = categoryId ? categories.find((c) => c.id === categoryId) : null;
    if (current && current.type !== next) {
      setCategoryId(null);
      setSubcategoryId(null);
    }
    clearError("category");
  }

  function chooseCategory(id: string) {
    if (id !== categoryId) {
      setCategoryId(id);
      setSubcategoryId(null);
    }
    clearError("category");
  }

  // Курс EUR→USD на дату операции: при выборе EUR или смене даты.
  // При редактировании EUR-транзакции первый запрос пропускаем — курс уже сохранён.
  const skipInitialEurFetch = useRef(initial !== null && initial.currency === "EUR");
  const rateRequestId = useRef(0);
  useEffect(() => {
    if (currency !== "EUR") return;
    if (skipInitialEurFetch.current) {
      skipInitialEurFetch.current = false;
      return;
    }
    if (!isDateKey(date)) return;
    const id = ++rateRequestId.current;
    setRateLoading(true);
    apiGet<ExchangeRateResponse>("/api/exchange-rate", { date })
      .then((res) => {
        if (id !== rateRequestId.current) return;
        setRate(String(res.rate));
        setRateMeta({ date: res.date, source: res.source });
        clearError("rate");
      })
      .catch(() => {
        // Курс не загрузился — оставляем текущее значение, поле редактируемое.
      })
      .finally(() => {
        if (id === rateRequestId.current) setRateLoading(false);
      });
  }, [currency, date]);

  const rateValue = parseRate(rate);
  const amountValue = parseAmountInput(amount);

  const rateCaption = useMemo(() => {
    if (rateLoading) return "Загрузка курса…";
    if (rateValue === null) return null;
    const rateText = `1 € = ${rateValue.toFixed(4).replace(".", ",")} $`;
    if (rateMeta?.source === "fallback") return `${rateText} · резервный курс`;
    const captionDate =
      rateMeta && isDateKey(rateMeta.date)
        ? rateMeta.date
        : isDateKey(date)
          ? date
          : null;
    return captionDate ? `${rateText} · курс на ${formatDay(captionDate)}` : rateText;
  }, [rateLoading, rateValue, rateMeta, date]);

  // Только превью — итоговую сумму в USD считает сервер.
  const conversionPreview =
    currency === "EUR" && amountValue !== null && rateValue !== null
      ? `= ${formatMoney(round2(amountValue * rateValue))}`
      : null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: FormErrors = {};
    if (amountValue === null) next.amount = "Введите корректную сумму";
    if (!description.trim()) next.description = "Введите описание";
    if (!categoryId) next.category = "Выберите категорию";
    if (!isDateKey(date)) next.date = "Укажите корректную дату";
    if (currency === "EUR" && rateValue === null) next.rate = "Введите корректный курс";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const input: TransactionInput = {
      type,
      amount: amountValue!,
      currency,
      ...(currency === "EUR" ? { exchangeRate: rateValue! } : {}),
      description: description.trim(),
      categoryId: categoryId!,
      subcategoryId,
      date,
      tags: parseTags(tags),
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={changeType} />

      <Field label="Сумма" error={errors.amount}>
        <div className="flex items-center gap-2.5">
          <Input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              clearError("amount");
            }}
            inputMode="decimal"
            placeholder="0,00"
            className="h-11 flex-1 text-[22px] font-semibold tnum"
          />
          <SegmentedControl
            size="sm"
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={setCurrency}
          />
        </div>
      </Field>

      {currency === "EUR" ? (
        <div>
          <Field label="Курс EUR→USD" error={errors.rate}>
            <Input
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                clearError("rate");
              }}
              placeholder="1,0800"
              className="tnum"
            />
          </Field>
          {rateCaption || conversionPreview ? (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[12px] text-ink-3">
              <span>{rateCaption}</span>
              {conversionPreview ? <span className="tnum">{conversionPreview}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Field label="Описание" error={errors.description}>
        <Input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearError("description");
          }}
          required
          autoFocus={initial === null}
          placeholder="Например: Google Ads, пополнение"
        />
      </Field>

      <ChipGroup label="Категория" error={errors.category}>
        {typeCategories.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            Нет категорий этого типа — добавьте их в настройках.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {typeCategories.map((c) => (
              <Chip key={c.id} active={c.id === categoryId} onClick={() => chooseCategory(c.id)}>
                <CategoryDot color={c.color} size={7} />
                {c.name}
              </Chip>
            ))}
          </div>
        )}
      </ChipGroup>

      {selectedCategory && selectedCategory.subcategories.length > 0 ? (
        <ChipGroup label="Подкатегория">
          <div className="flex flex-wrap gap-2">
            <Chip active={subcategoryId === null} onClick={() => setSubcategoryId(null)}>
              Без подкатегории
            </Chip>
            {selectedCategory.subcategories.map((s) => (
              <Chip key={s.id} active={s.id === subcategoryId} onClick={() => setSubcategoryId(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </ChipGroup>
      ) : null}

      <ChipGroup label="Дата" error={errors.date}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={date === today}
            onClick={() => {
              setDate(today);
              clearError("date");
            }}
          >
            Сегодня
          </Chip>
          <Chip
            active={date === yesterday}
            onClick={() => {
              setDate(yesterday);
              clearError("date");
            }}
          >
            Вчера
          </Chip>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              // input type="date" отдаёт готовый "YYYY-MM-DD" — это и есть DateKey.
              setDate(e.target.value);
              clearError("date");
            }}
            className={clsx(inputClasses, "w-auto")}
          />
        </div>
      </ChipGroup>

      <Field label="Теги" hint="через запятую">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="например: сервер, подписка"
        />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
