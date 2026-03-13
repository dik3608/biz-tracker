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
  description: string;
  date: string;
  tags: string;
  category: { id: string; name: string; color: string };
};

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

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
};

export default function AddPage() {
  /* ── categories ── */
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  /* ── form state ── */
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const patch = (p: Partial<typeof form>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  /* ── quick input ── */
  const [quickText, setQuickText] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);

  const applyQuick = () => {
    const text = quickText.trim();
    if (!text) return;

    const match = text.match(/^(.+?)\s+([\d.,]+)$/);
    if (match) {
      const desc = match[1].trim();
      const amt = match[2].replace(",", ".");
      patch({ description: desc, amount: amt });
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

  /* ── submit ── */
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);

  const submit = useCallback(async () => {
    if (!form.amount || !form.description || !form.categoryId || !form.date)
      return;
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
  }, [form]);

  /* ── repeat last ── */
  const [lastTx, setLastTx] = useState<Transaction | null>(null);

  useEffect(() => {
    fetch("/api/transactions?limit=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.transactions?.length) setLastTx(d.transactions[0]);
      });
  }, []);

  const repeatLast = () => {
    if (!lastTx) return;
    setForm({
      type: lastTx.type,
      amount: String(lastTx.amount),
      categoryId: lastTx.category.id,
      description: lastTx.description,
      date: today(),
      tags: lastTx.tags ?? "",
    });
  };

  /* ================================================================ */

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Добавить запись</h1>

      {/* ── Quick input ── */}
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

      {/* ── Full form ── */}
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

        {/* amount */}
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => patch({ amount: e.target.value })}
          className="!text-3xl !font-bold !tracking-tight"
        />

        {/* category */}
        <select
          value={form.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
        >
          <option value="">Категория</option>
          {filteredCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
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

      {/* ── Repeat last ── */}
      {lastTx && (
        <div className="glass-card-sm flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--text-muted)]">Последняя запись</p>
            <p className="truncate text-sm">
              {lastTx.description} —{" "}
              <span
                className={
                  lastTx.type === "INCOME" ? "income-text" : "expense-text"
                }
              >
                {EUR.format(lastTx.amount)}
              </span>
            </p>
          </div>
          <button
            onClick={repeatLast}
            className="btn-ghost flex items-center gap-1"
          >
            <Repeat size={14} /> Повторить
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-emerald-600/90 px-5 py-3 text-sm font-medium text-white shadow-lg backdrop-blur">
          <Check size={16} /> Запись сохранена
        </div>
      )}
    </div>
  );
}
