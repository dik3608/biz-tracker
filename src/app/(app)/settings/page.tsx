"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Plus,
  Download,
  LogOut,
  Check,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRESET_COLORS = [
  "#f43f5e", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7",
];

type ExportType = "" | "INCOME" | "EXPENSE";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const router = useRouter();

  /* ---------- Categories state ---------- */

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      setCategories(data.categories ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  /* ---------- Editing state ---------- */

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, name: updated.name } : c)),
        );
      }
    } catch {
      /* ignore */
    }
    setEditingId(null);
  }

  /* ---------- Delete ---------- */

  async function deleteCategory(id: string) {
    if (!confirm("Удалить категорию? Это действие нельзя отменить.")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
      } else {
        const body = await res.json();
        alert(body.error ?? "Ошибка при удалении");
      }
    } catch {
      alert("Ошибка сети");
    }
  }

  /* ---------- Add new ---------- */

  const [newIncomeName, setNewIncomeName] = useState("");
  const [newIncomeColor, setNewIncomeColor] = useState(PRESET_COLORS[4]);
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseColor, setNewExpenseColor] = useState(PRESET_COLORS[0]);

  async function addCategory(type: "INCOME" | "EXPENSE") {
    const name = type === "INCOME" ? newIncomeName : newExpenseName;
    const color = type === "INCOME" ? newIncomeColor : newExpenseColor;
    if (!name.trim()) return;

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type, color }),
      });
      if (res.ok) {
        const created = await res.json();
        setCategories((prev) => [...prev, created]);
        if (type === "INCOME") {
          setNewIncomeName("");
          setNewIncomeColor(PRESET_COLORS[4]);
        } else {
          setNewExpenseName("");
          setNewExpenseColor(PRESET_COLORS[0]);
        }
      }
    } catch {
      alert("Ошибка при создании");
    }
  }

  /* ---------- Export state ---------- */

  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportType, setExportType] = useState<ExportType>("");

  async function handleExport() {
    const params = new URLSearchParams();
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);
    if (exportType) params.set("type", exportType);

    const res = await fetch(`/api/export?${params}`);
    if (!res.ok) {
      alert("Ошибка экспорта");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- Logout ---------- */

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>

      {/* ===== Categories ===== */}
      <div className="glass-card p-5">
        <h2 className="mb-5 text-base font-semibold">Категории</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Income column */}
          <CategoryColumn
            title="Доходы"
            items={incomeCategories}
            loading={loading}
            editingId={editingId}
            editName={editName}
            editInputRef={editInputRef}
            onEditNameChange={setEditName}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={deleteCategory}
            newName={newIncomeName}
            onNewNameChange={setNewIncomeName}
            newColor={newIncomeColor}
            onNewColorChange={setNewIncomeColor}
            onAdd={() => addCategory("INCOME")}
          />

          {/* Expense column */}
          <CategoryColumn
            title="Расходы"
            items={expenseCategories}
            loading={loading}
            editingId={editingId}
            editName={editName}
            editInputRef={editInputRef}
            onEditNameChange={setEditName}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={deleteCategory}
            newName={newExpenseName}
            onNewNameChange={setNewExpenseName}
            newColor={newExpenseColor}
            onNewColorChange={setNewExpenseColor}
            onAdd={() => addCategory("EXPENSE")}
          />
        </div>
      </div>

      {/* ===== Export ===== */}
      <div className="glass-card p-5">
        <h2 className="mb-4 text-base font-semibold">Экспорт данных</h2>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              От
            </span>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              До
            </span>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Тип
            </span>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
            >
              <option value="">Все</option>
              <option value="INCOME">Доходы</option>
              <option value="EXPENSE">Расходы</option>
            </select>
          </label>

          <button onClick={handleExport} className="btn-primary flex items-center gap-2">
            <Download size={16} />
            Скачать CSV
          </button>
        </div>
      </div>

      {/* ===== Account ===== */}
      <div className="glass-card p-5">
        <h2 className="mb-4 text-base font-semibold">Аккаунт</h2>
        <button
          onClick={handleLogout}
          className="btn-ghost flex items-center gap-2 text-red-400 hover:text-red-300"
          style={{ borderColor: "rgba(248,113,113,0.3)" }}
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CategoryColumn                                                     */
/* ------------------------------------------------------------------ */

function CategoryColumn({
  title,
  items,
  loading,
  editingId,
  editName,
  editInputRef,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  newName,
  onNewNameChange,
  newColor,
  onNewColorChange,
  onAdd,
}: {
  title: string;
  items: Category[];
  loading: boolean;
  editingId: string | null;
  editName: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onEditNameChange: (v: string) => void;
  onStartEdit: (cat: Category) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  newName: string;
  onNewNameChange: (v: string) => void;
  newColor: string;
  onNewColorChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <h3
        className="mb-3 text-sm font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((cat) => (
            <li
              key={cat.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: cat.color }}
              />

              {editingId === cat.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => onEditNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveEdit(cat.id);
                      if (e.key === "Escape") onCancelEdit();
                    }}
                    className="!py-1 !text-sm"
                  />
                  <button
                    onClick={() => onSaveEdit(cat.id)}
                    className="rounded p-1 text-green-400 hover:bg-green-400/10"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="rounded p-1 hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm">{cat.name}</span>
                  <button
                    onClick={() => onStartEdit(cat)}
                    className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(cat.id)}
                    className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-400/10"
                    style={{ color: "#f87171" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add new */}
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder="Новая категория"
            className="!py-2 !text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
          />
          <button
            onClick={onAdd}
            disabled={!newName.trim()}
            className="btn-primary flex shrink-0 items-center gap-1 disabled:opacity-40"
          >
            <Plus size={14} />
            Добавить
          </button>
        </div>

        <div className="flex gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onNewColorChange(c)}
              className="h-6 w-6 rounded-full transition-transform"
              style={{
                backgroundColor: c,
                outline:
                  newColor === c
                    ? "2px solid white"
                    : "2px solid transparent",
                outlineOffset: "2px",
                transform: newColor === c ? "scale(1.15)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
