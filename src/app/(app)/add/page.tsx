"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Repeat, Plus, Loader2, Sparkles, Bot } from "lucide-react";
import { todayLocalDateKey } from "@/lib/date-utils";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
  slug: string;
};

type Subcategory = {
  id: string;
  name: string;
  categoryId: string;
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
  subcategory?: { id: string; name: string } | null;
};

type Currency = "USD" | "EUR";

interface AISuggestion {
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string;
  newSubcategory: boolean;
  type: "INCOME" | "EXPENSE";
}

const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
function fmtAmount(amount: number, currency: string) {
  return currency === "EUR" ? fmtEUR.format(amount) : fmtUSD.format(amount);
}

function today() {
  return todayLocalDateKey();
}

const EMPTY_FORM = {
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  amount: "",
  categoryId: "",
  subcategoryId: "",
  description: "",
  date: today(),
  tags: "",
  currency: "USD" as Currency,
};

export default function AddPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [eurRate, setEurRate] = useState<number>(1.08);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/subcategories")
      .then((r) => r.json())
      .then((d) => setSubcategories(d.subcategories ?? []));
    fetch("/api/exchange-rate")
      .then((r) => r.json())
      .then((d) => setEurRate(d.rate ?? 1.08))
      .catch(() => {});
    setHasApiKey(!!localStorage.getItem("openai_api_key"));
  }, []);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const patch = (p: Partial<typeof form>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const filteredCats = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  const filteredSubs = useMemo(
    () => subcategories.filter((s) => s.categoryId === form.categoryId),
    [subcategories, form.categoryId],
  );

  const convertedAmount = useMemo(() => {
    const amt = Number(form.amount);
    if (!amt || form.currency === "USD") return null;
    return amt * eurRate;
  }, [form.amount, form.currency, eurRate]);

  /* --- Quick input --- */
  const [quickText, setQuickText] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);

  const applyQuick = () => {
    const text = quickText.trim();
    if (!text) return;
    const match = text.match(/^(.+?)\s+([\d.,]+)$/);
    let desc = "";
    if (match) {
      desc = match[1].trim();
      patch({ description: desc, amount: match[2].replace(",", ".") });
    } else {
      const numOnly = text.replace(",", ".");
      if (!isNaN(Number(numOnly)) && numOnly !== "") {
        patch({ amount: numOnly });
      } else {
        desc = text;
        patch({ description: text });
      }
    }
    setQuickText("");
    quickRef.current?.blur();
    if (desc.length >= 3) {
      requestSuggestion(desc);
    }
  };

  /* --- AI Suggest --- */
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const requestSuggestion = useCallback(
    async (desc?: string) => {
      const text = desc ?? form.description;
      const apiKey = localStorage.getItem("openai_api_key");
      if (!apiKey || !text.trim() || text.length < 3) {
        setAiSuggestion(null);
        return;
      }
      setAiLoading(true);
      try {
        const res = await fetch("/api/ai/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenAI-Key": apiKey,
          },
          body: JSON.stringify({ description: text, type: form.type }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiSuggestion(data);
        }
      } catch {}
      setAiLoading(false);
    },
    [form.type, form.description],
  );

  function onDescriptionChange(val: string) {
    patch({ description: val });
    setAiSuggestion(null);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (val.trim().length >= 3 && hasApiKey) {
      suggestTimer.current = setTimeout(() => requestSuggestion(val), 1000);
    }
  }

  async function applySuggestion() {
    if (!aiSuggestion) return;

    const updates: Partial<typeof form> = {};

    if (aiSuggestion.type) updates.type = aiSuggestion.type;
    if (aiSuggestion.categoryId) updates.categoryId = aiSuggestion.categoryId;

    if (aiSuggestion.newSubcategory && aiSuggestion.subcategoryName && aiSuggestion.categoryId) {
      try {
        const res = await fetch("/api/subcategories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: aiSuggestion.subcategoryName,
            categoryId: aiSuggestion.categoryId,
          }),
        });
        if (res.ok) {
          const newSub = await res.json();
          setSubcategories((prev) => [...prev, newSub]);
          updates.subcategoryId = newSub.id;
        }
      } catch {}
    } else if (aiSuggestion.subcategoryId) {
      updates.subcategoryId = aiSuggestion.subcategoryId;
    }

    patch(updates);
    setAiSuggestion(null);
  }

  /* --- Save --- */
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
          subcategoryId: form.subcategoryId || null,
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
      setAiSuggestion(null);
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
      subcategoryId: lastTx.subcategory?.id || "",
      description: lastTx.description,
      date: today(),
      tags: lastTx.tags ?? "",
      currency: (lastTx.currency as Currency) || "USD",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="premium-kicker mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Transaction entry
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Добавить запись</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Быстро внесите доход или расход, при необходимости с категорией и подкатегорией.
        </p>
      </div>

      {/* Quick input */}
      <div className="glass-card-sm flex items-center gap-2 p-3">
        <input
          ref={quickRef}
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyQuick()}
          placeholder="Google Ads 500 или просто описание…"
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
              onClick={() => patch({ type: t, categoryId: "", subcategoryId: "" })}
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

        {/* description */}
        <div>
          <input
            placeholder="Описание (напр. Bing Ads пополнение)"
            value={form.description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>

        {/* AI suggest button */}
        {hasApiKey && form.description.trim().length >= 3 && (
          <button
            onClick={() => requestSuggestion()}
            disabled={aiLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 py-3 text-sm font-medium text-[var(--accent-blue)] transition-all hover:bg-[var(--accent-blue)]/10 disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                AI анализирует…
              </>
            ) : (
              <>
                <Bot size={16} />
                AI подсказка — подобрать категорию
              </>
            )}
          </button>
        )}

        {/* AI suggestion result */}
        {aiSuggestion && !aiLoading && (
          <div className="rounded-xl border-2 border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-blue)]/15">
                <Sparkles size={18} className="text-[var(--accent-blue)]" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-[var(--accent-blue)]">AI рекомендует:</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    aiSuggestion.type === "INCOME"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}>
                    {aiSuggestion.type === "INCOME" ? "Доход" : "Расход"}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">→</span>
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold">
                    {aiSuggestion.categoryName}
                  </span>
                  {aiSuggestion.subcategoryName && (
                    <>
                      <span className="text-xs text-[var(--text-muted)]">→</span>
                      <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold">
                        {aiSuggestion.subcategoryName}
                        {aiSuggestion.newSubcategory && (
                          <span className="ml-1.5 rounded bg-[var(--accent-blue)]/25 px-1.5 py-0.5 text-[10px] font-medium">новая</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={applySuggestion}
                className="shrink-0 rounded-xl bg-[var(--accent-blue)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-blue)]/20 transition hover:brightness-110"
              >
                Подставить
              </button>
            </div>
          </div>
        )}

        {/* category */}
        <select
          value={form.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value, subcategoryId: "" })}
        >
          <option value="">Категория</option>
          {filteredCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* subcategory */}
        {form.categoryId && filteredSubs.length > 0 && (
          <select
            value={form.subcategoryId}
            onChange={(e) => patch({ subcategoryId: e.target.value })}
          >
            <option value="">Подкатегория (необязательно)</option>
            {filteredSubs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

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
              {lastTx.subcategory && (
                <span className="ml-1 text-xs text-[var(--text-muted)]">
                  [{lastTx.subcategory.name}]
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
