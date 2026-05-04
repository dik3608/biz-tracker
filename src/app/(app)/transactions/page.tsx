"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { formatLocalDateKey, todayLocalDateKey } from "@/lib/date-utils";

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
  exchangeRate: number;
  description: string;
  date: string;
  tags: string;
  category: { id: string; name: string; color: string };
  subcategory?: { id: string; name: string } | null;
};

type Filters = {
  type: "" | "INCOME" | "EXPENSE";
  categoryId: string;
  from: string;
  to: string;
  search: string;
};

const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
function fmtAmt(tx: Transaction) {
  const a = tx.originalAmount || tx.amount;
  const c = tx.currency || "USD";
  return c === "EUR" ? fmtEUR.format(a) : fmtUSD.format(a);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

function toInputDate(iso: string) {
  return iso.slice(0, 10);
}

/* ── date preset helpers ── */
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => formatLocalDateKey(d);
  switch (key) {
    case "month":
      return { from: fmt(startOfMonth(now)), to: todayLocalDateKey() };
    case "prev_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    }
    case "quarter": {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      return {
        from: fmt(new Date(now.getFullYear(), qm, 1)),
        to: fmt(now),
      };
    }
    case "year":
      return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: todayLocalDateKey() };
    default:
      return { from: "", to: "" };
  }
}

/* ================================================================ */

export default function TransactionsPage() {
  /* ── categories ── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [eurRate, setEurRate] = useState(1.08);

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
  }, []);

  /* ── filters ── */
  const emptyFilters: Filters = {
    type: "",
    categoryId: "",
    from: "",
    to: "",
    search: "",
  };
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const limit = 30;

  const patch = (p: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...p }));
    setPage(1);
  };

  const filteredCategories = useMemo(
    () =>
      filters.type
        ? categories.filter((c) => c.type === filters.type)
        : categories,
    [categories, filters.type],
  );

  /* ── fetch transactions ── */
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.type) qs.set("type", filters.type);
    if (filters.categoryId) qs.set("categoryId", filters.categoryId);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (filters.search) qs.set("search", filters.search);
    qs.set("page", String(page));
    qs.set("limit", String(limit));

    try {
      const r = await fetch(`/api/transactions?${qs}`);
      const d = await r.json();
      setRows(d.transactions ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── selection mode ── */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const bulkDelete = async () => {
    await fetch("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    setSelectMode(false);
    setShowBulkConfirm(false);
    load();
  };

  /* ── edit modal ── */
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({
    type: "" as "INCOME" | "EXPENSE",
    amount: "",
    categoryId: "",
    subcategoryId: "",
    description: "",
    date: "",
    tags: "",
    currency: "USD" as "USD" | "EUR",
    exchangeRate: 1,
  });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setEditForm({
      type: tx.type,
      amount: String(tx.originalAmount || tx.amount),
      categoryId: tx.category.id,
      subcategoryId: tx.subcategory?.id ?? "",
      description: tx.description,
      date: toInputDate(tx.date),
      tags: tx.tags ?? "",
      currency: (tx.currency as "USD" | "EUR") || "USD",
      exchangeRate: tx.exchangeRate || 1,
    });
    setShowDeleteConfirm(false);
  };

  const editCategories = useMemo(
    () => categories.filter((c) => c.type === editForm.type),
    [categories, editForm.type],
  );
  const editSubcategories = useMemo(
    () => subcategories.filter((s) => s.categoryId === editForm.categoryId),
    [editForm.categoryId, subcategories],
  );

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await fetch(`/api/transactions/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editForm.type,
          amount: Number(editForm.amount),
          categoryId: editForm.categoryId,
          subcategoryId: editForm.subcategoryId || null,
          description: editForm.description,
          date: editForm.date,
          tags: editForm.tags,
          currency: editForm.currency,
          exchangeRate: editForm.currency === "EUR" ? editForm.exchangeRate : 1,
        }),
      });
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteOne = async () => {
    if (!editing) return;
    await fetch(`/api/transactions/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    load();
  };

  /* ================================================================ */

  return (
    <div className="space-y-4">
      <div>
        <div className="premium-kicker mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Ledger control
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Записи</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Фильтруйте, проверяйте и аккуратно редактируйте финансовые операции.
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="glass-card-sm flex flex-wrap items-center gap-2 p-3">
        {/* type pills */}
        {(
          [
            ["", "Все"],
            ["INCOME", "Доходы"],
            ["EXPENSE", "Расходы"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => patch({ type: val, categoryId: "" })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              filters.type === val
                ? val === "INCOME"
                  ? "bg-emerald-600/30 text-emerald-300"
                  : val === "EXPENSE"
                    ? "bg-rose-600/30 text-rose-300"
                    : "bg-indigo-600/30 text-indigo-300"
                : "text-[var(--text-muted)] hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}

        {/* category dropdown */}
        <select
          value={filters.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
          className="!w-auto min-w-[120px]"
        >
          <option value="">Категория</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* date range */}
        <input
          type="date"
          value={filters.from}
          onChange={(e) => patch({ from: e.target.value })}
          className="!w-auto"
        />
        <span className="text-[var(--text-muted)]">—</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => patch({ to: e.target.value })}
          className="!w-auto"
        />

        {/* quick presets */}
        {(
          [
            ["month", "Месяц"],
            ["prev_month", "Пр. месяц"],
            ["quarter", "Квартал"],
            ["year", "Год"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => patch(presetRange(key))}
            className="btn-ghost !px-2 !py-1 !text-xs"
          >
            {label}
          </button>
        ))}

        {/* search */}
        <div className="relative ml-auto min-w-[160px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            placeholder="Поиск…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            className="!w-full !pl-8"
          />
        </div>

        {/* reset */}
        <button
          onClick={() => {
            setFilters(emptyFilters);
            setPage(1);
          }}
          className="btn-ghost flex items-center gap-1 !px-2 !py-1 !text-xs"
        >
          <X size={12} /> Сбросить
        </button>
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          className={`btn-ghost flex items-center gap-1 ${selectMode ? "!border-indigo-500 !text-indigo-400" : ""}`}
        >
          <CheckSquare size={14} />
          {selectMode ? "Отмена" : "Выбрать"}
        </button>

        {selectMode && selected.size > 0 && (
          <button
            onClick={() => setShowBulkConfirm(true)}
            className="flex items-center gap-1 rounded-lg bg-rose-600/20 px-3 py-1.5 text-sm font-medium text-rose-400 transition hover:bg-rose-600/30"
          >
            <Trash2 size={14} /> Удалить выбранные ({selected.size})
          </button>
        )}

        <span className="ml-auto text-xs text-[var(--text-muted)]">
          Всего: {total}
        </span>
      </div>

      {/* ── Table / list ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-[var(--text-muted)]">
          Транзакций не найдено
        </p>
      ) : (
        <>
          {/* desktop table */}
          <div className="glass-card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-[var(--text-muted)]">
                  {selectMode && (
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === rows.length && rows.length > 0}
                        onChange={toggleSelectAll}
                        className="!w-4 accent-indigo-500"
                      />
                    </th>
                  )}
                  <th className="p-3">Дата</th>
                  <th className="p-3">Описание</th>
                  <th className="p-3">Категория</th>
                  <th className="p-3 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => !selectMode && openEdit(tx)}
                    className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.03]"
                  >
                    {selectMode && (
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          className="!w-4 accent-indigo-500"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                      {fmtDate(tx.date)}
                    </td>
                    <td className="max-w-[260px] truncate p-3">{tx.description}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: tx.category.color }}
                        />
                        <span>
                          {tx.category.name}
                          {tx.subcategory && (
                            <span className="ml-1 text-xs text-[var(--text-muted)]">
                              / {tx.subcategory.name}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap p-3 text-right font-medium ${
                        tx.type === "INCOME" ? "income-text" : "expense-text"
                      }`}
                    >
                      {tx.type === "EXPENSE" ? "−\u00A0" : "+\u00A0"}
                      {fmtAmt(tx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((tx) => (
              <div
                key={tx.id}
                onClick={() => !selectMode && openEdit(tx)}
                className="glass-card-sm flex cursor-pointer items-center gap-3 p-3"
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(tx.id);
                    }}
                    className="!w-4 shrink-0 accent-indigo-500"
                  />
                )}
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: tx.category.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{tx.description}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {fmtDate(tx.date)} · {tx.category.name}
                    {tx.subcategory ? ` / ${tx.subcategory.name}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    tx.type === "INCOME" ? "income-text" : "expense-text"
                  }`}
                >
                  {tx.type === "EXPENSE" ? "−" : "+"}
                  {fmtAmt(tx)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-ghost flex items-center gap-1 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <span className="text-sm text-[var(--text-muted)]">
            Страница {page} из {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost flex items-center gap-1 disabled:opacity-30"
          >
            Вперёд <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Bulk delete confirmation ── */}
      {showBulkConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowBulkConfirm(false)}
        >
          <div
            className="glass-card w-full max-w-sm space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Подтвердите удаление</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Удалить {selected.size} транзакций? Это действие нельзя отменить.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="btn-ghost"
                onClick={() => setShowBulkConfirm(false)}
              >
                Отмена
              </button>
              <button
                onClick={bulkDelete}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="glass-card w-full max-w-md space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Редактировать запись</h2>

            {/* type toggle */}
            <div className="flex gap-2">
              {(["INCOME", "EXPENSE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setEditForm((f) => ({ ...f, type: t, categoryId: "", subcategoryId: "" }))
                  }
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    editForm.type === t
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

            {/* currency + amount */}
            <div className="flex gap-1.5">
              {(["USD", "EUR"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setEditForm((f) => ({
                      ...f,
                      currency: c,
                      exchangeRate: c === "EUR" ? (f.currency === "EUR" ? f.exchangeRate : eurRate) : 1,
                    }))
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    editForm.currency === c
                      ? "bg-[var(--accent-blue)] text-white"
                      : "bg-white/5 text-[var(--text-muted)]"
                  }`}
                >
                  {c === "USD" ? "$ USD" : "€ EUR"}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="Сумма"
              value={editForm.amount}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, amount: e.target.value }))
              }
            />
            {editForm.currency === "EUR" && (
              <p className="text-xs text-[var(--text-muted)]">
                Курс сохранения: 1 EUR = {editForm.exchangeRate.toFixed(4)} USD
              </p>
            )}

            {/* category */}
            <select
              value={editForm.categoryId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))
              }
            >
              <option value="">Категория</option>
              {editCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {editSubcategories.length > 0 && (
              <select
                value={editForm.subcategoryId}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, subcategoryId: e.target.value }))
                }
              >
                <option value="">Подкатегория (необязательно)</option>
                {editSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </option>
                ))}
              </select>
            )}

            {/* description */}
            <input
              placeholder="Описание"
              value={editForm.description}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, description: e.target.value }))
              }
            />

            {/* date */}
            <input
              type="date"
              value={editForm.date}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, date: e.target.value }))
              }
            />

            {/* tags */}
            <input
              placeholder="Теги (через запятую)"
              value={editForm.tags}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, tags: e.target.value }))
              }
            />

            {/* actions */}
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveEdit} className="btn-primary" disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                Отмена
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="ml-auto text-sm text-rose-400 transition hover:text-rose-300"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* delete confirm inline */}
            {showDeleteConfirm && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-600/10 p-3 text-sm">
                <span className="text-rose-300">Точно удалить?</span>
                <button
                  onClick={deleteOne}
                  className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white"
                >
                  Да
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn-ghost !px-2 !py-1 !text-xs"
                >
                  Нет
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
