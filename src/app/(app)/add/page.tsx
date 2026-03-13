"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Repeat, Plus, Loader2 } from "lucide-react";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
  slug: string;
};

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  originalAmount: number;
  currency: string;
  description: string;
  date: string;
  tags: string;
  category: { id: string; name: string; color: string };
};

type Currency = "USD" | "EUR";

const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
function fmtAmount(amount: number, currency: string) {
  return currency === "EUR" ? fmtEUR.format(amount) : fmtUSD.format(amount);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  amount: "",
  categoryId: "",
  description: "",
  date: today(),
  tags: "",
  currency: "USD" as Currency,
};

export default function AddPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [eurRate, setEurRate] = useState<number>(1.08);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/exchange-rate")
      .then((r) => r.json())
      .then((d) => setEurRate(d.rate ?? 1.08))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const patch = (p: Partial<typeof form>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  const convertedAmount = useMemo(() => {
    const amt = Number(form.amount);
    if (!amt || form.currency === "USD") return null;
    return amt * eurRate;
  }, [form.amount, form.currency, eurRate]);

  const [quickText, setQuickText] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);

  const applyQuick = () => {
    const text = quickText.trim();
    if (!text) return;
    const match = text.match(/^(.+?)\s+([\d.,]+)$/);
    if (match) {
      patch({ description: match[1].trim(), amount: match[2].replace(",", ".") });
    } else {
      const numOnly = text.replace(",", ".");
      if (!isNaN(Number(numOnly)) && numOnly !== "") {
        patch({ amount: numOnly });
      } else {
        patch({ description: text });
      }
    }
    setQuickText("");
    quickRef.current?.blur();
  };

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);

  const submit = useCallback(async () => {
    if (!form.amount || !form.description || !form.categoryId || !form.date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: Number(form.amount),
          description: form.description,
          categoryId: form.categoryId,
          date: form.date,
          tags: form.tags,
          currency: form.currency,
          exchangeRate: form.currency === "EUR" ? eurRate : 1,
        }),
      });
      if (!res.ok) throw new Error();
      const data: Transaction = await res.json();
      setLastTx(data);
      setForm({ ...EMPTY_FORM, date: today() });
      setToast(true);
      setTimeout(() => setToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [form, eurRate]);

  const [lastTx, setLastTx] = useState<Transaction | null>(null);

  useEffect(() => {
    fetch("/api/transactions?limit=1")
      .then((r) => r.json())
      .then((d) => { if (d.transactions?.length) setLastTx(d.transactions[0]); });
  }, []);

  const repeatLast = () => {
    if (!lastTx) return;
    setForm({
      type: lastTx.type,
      amount: String(lastTx.originalAmount || lastTx.amount),
      categoryId: lastTx.category.id,
      description: lastTx.description,
      date: today(),
      tags: lastTx.tags ?? "",
      currency: (lastTx.currency as Currency) || "USD",
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Добавить запись</h1>

      {/* Quick input */}
      <div className="glass-card-sm flex items-center gap-2 p-3">
        <input
          ref={quickRef}
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyQuick()}
          placeholder="Google Ads 500 или просто сумму…"
          className="flex-1"
        />
        <button onClick={applyQuick} className="btn-primary flex items-center gap-1">
          <Plus size={16} /> Добавить
        </button>
      </div>

      {/* Full form */}
      <div className="glass-card space-y-5 p-5">
        {/* type toggle */}
        <div className="flex gap-2">
          {(["INCOME", "EXPENSE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => patch({ type: t, categoryId: "" })}
              className={`flex-1 rounded-xl py-3 text-base font-semibold transition ${
                form.type === t
                  ? t === "INCOME"
                    ? "bg-emerald-600/30 text-emerald-300"
                    : "bg-rose-600/30 text-rose-300"
                  : "bg-white/5 text-[var(--text-muted)]"
              }`}
            >
              {t === "INCOME" ? "Доход" : "Расход"}
            </button>
          ))}
        </div>

        {/* currency toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">Валюта:</span>
          <div className="flex gap-1.5">
            {(["USD", "EUR"] as const).map((c) => (
              <button
                key={c}
                onClick={() => patch({ currency: c })}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                  form.currency === c
                    ? "bg-[var(--accent-blue)] text-white"
                    : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10"
                }`}
              >
                {c === "USD" ? "$ USD" : "€ EUR"}
              </button>
            ))}
          </div>
          {form.currency === "EUR" && (
            <span className="text-xs text-[var(--text-muted)]">
              1 EUR = {eurRate.toFixed(4)} USD
            </span>
          )}
        </div>

        {/* amount */}
        <div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-[var(--text-muted)]">
              {form.currency === "USD" ? "$" : "€"}
            </span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => patch({ amount: e.target.value })}
              className="!pl-10 !text-3xl !font-bold !tracking-tight"
            />
          </div>
          {convertedAmount !== null && (
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              ≈ {fmtUSD.format(convertedAmount)} (по курсу {eurRate.toFixed(4)})
            </p>
          )}
        </div>

        {/* category */}
        <select
          value={form.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
        >
          <option value="">Категория</option>
          {filteredCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* description */}
        <input
          placeholder="Описание"
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
        />

        {/* date */}
        <input
          type="date"
          value={form.date}
          onChange={(e) => patch({ date: e.target.value })}
        />

        {/* tags */}
        <input
          placeholder="Теги (через запятую, необязательно)"
          value={form.tags}
          onChange={(e) => patch({ tags: e.target.value })}
        />

        {/* submit */}
        <button
          onClick={submit}
          disabled={saving || !form.amount || !form.description || !form.categoryId}
          className="btn-primary w-full !py-3 text-base disabled:opacity-40"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Сохранение…
            </span>
          ) : (
            "Сохранить запись"
          )}
        </button>
      </div>

      {/* Repeat last */}
      {lastTx && (
        <div className="glass-card-sm flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--text-muted)]">Последняя запись</p>
            <p className="truncate text-sm">
              {lastTx.description} —{" "}
              <span className={lastTx.type === "INCOME" ? "income-text" : "expense-text"}>
                {fmtAmount(lastTx.originalAmount || lastTx.amount, lastTx.currency || "USD")}
              </span>
              {lastTx.currency === "EUR" && (
                <span className="text-[var(--text-muted)]">
                  {" "}({fmtUSD.format(lastTx.amount)})
                </span>
              )}
            </p>
          </div>
          <button onClick={repeatLast} className="btn-ghost flex items-center gap-1">
            <Repeat size={14} /> Повторить
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-emerald-600/90 px-5 py-3 text-sm font-medium text-white shadow-lg backdrop-blur">
          <Check size={16} /> Запись сохранена
        </div>
      )}
    </div>
  );
}
