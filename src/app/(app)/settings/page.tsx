"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { CategoryDto, SubcategoryDto, TxType } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { errorMessage, useToast } from "@/components/ui/Toast";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { logout } from "@/components/navigation/Sidebar";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** «1 операция», «2 операции», «5 операций». */
function pluralOps(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} операция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} операции`;
  return `${n} операций`;
}

const DEFAULT_COLORS: Record<TxType, string> = {
  INCOME: "#22c55e",
  EXPENSE: "#f43f5e",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { toast } = useToast();

  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoadError(null);
    try {
      const data = await apiGet<{ categories: CategoryDto[] }>("/api/categories");
      if (requestId !== requestRef.current) return;
      setCategories(data.categories);
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    // Загрузка данных при монтировании — setState происходит после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Точечное обновление категории в локальном стейте. */
  const applyLocal = useCallback((id: string, patch: Partial<CategoryDto>) => {
    setCategories((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev,
    );
  }, []);

  /** Перестановка sortOrder категории с соседом (двумя PATCH-запросами). */
  const moveCategory = useCallback(
    async (list: CategoryDto[], index: number, dir: -1 | 1) => {
      const cat = list[index];
      const other = list[index + dir];
      if (!cat || !other) return;
      const a = cat.sortOrder;
      const b = other.sortOrder;
      // Оптимистичный локальный обмен
      setCategories((prev) =>
        prev
          ? prev.map((c) =>
              c.id === cat.id
                ? { ...c, sortOrder: b }
                : c.id === other.id
                  ? { ...c, sortOrder: a }
                  : c,
            )
          : prev,
      );
      try {
        await Promise.all([
          apiPatch(`/api/categories/${cat.id}`, { sortOrder: b }),
          apiPatch(`/api/categories/${other.id}`, { sortOrder: a }),
        ]);
      } catch (e) {
        toast(errorMessage(e), "error");
        void load();
      }
    },
    [load, toast],
  );

  const sorted = (type: TxType) =>
    (categories ?? [])
      .filter((c) => c.type === type)
      .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name, "ru"));

  async function downloadExport(format: "xlsx" | "csv") {
    try {
      await apiDownload("/api/export", { format });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-tight">Настройки</h1>

      {/* ===== Категории ===== */}
      <section>
        {categories === null && !loadError ? (
          <Card>
            <Spinner />
          </Card>
        ) : loadError ? (
          <Card className="px-5 py-4">
            <p className="text-sm text-ink-2">{loadError}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Повторить
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryColumn
              title="Доходы"
              type="INCOME"
              list={sorted("INCOME")}
              applyLocal={applyLocal}
              reload={load}
              onMove={moveCategory}
            />
            <CategoryColumn
              title="Расходы"
              type="EXPENSE"
              list={sorted("EXPENSE")}
              applyLocal={applyLocal}
              reload={load}
              onMove={moveCategory}
            />
          </div>
        )}
      </section>

      {/* ===== Данные ===== */}
      <Card>
        <CardHeader title="Данные" subtitle="Экспорт всех операций в файл" />
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            onClick={() => downloadExport("xlsx")}
          >
            Скачать все данные (Excel)
          </Button>
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            onClick={() => downloadExport("csv")}
          >
            Скачать CSV
          </Button>
        </div>
      </Card>

      {/* ===== Сессия ===== */}
      <Card>
        <CardHeader title="Сессия" subtitle="Завершить работу и выйти из аккаунта" />
        <div className="px-5 pb-4">
          <Button variant="danger" icon={<LogOut size={15} />} onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Колонка категорий одного типа                                      */
/* ------------------------------------------------------------------ */

function CategoryColumn({
  title,
  type,
  list,
  applyLocal,
  reload,
  onMove,
}: {
  title: string;
  type: TxType;
  list: CategoryDto[];
  applyLocal: (id: string, patch: Partial<CategoryDto>) => void;
  reload: () => Promise<void>;
  onMove: (list: CategoryDto[], index: number, dir: -1 | 1) => Promise<void>;
}) {
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[type]);
  const [creating, setCreating] = useState(false);

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await apiPost("/api/categories", { name, type, color: newColor });
      toast("Категория добавлена");
      setNewName("");
      setNewColor(DEFAULT_COLORS[type]);
      setAdding(false);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader title={title} />
      <div className="flex flex-col px-5 pb-4">
        {list.length === 0 ? (
          <EmptyState title="Нет категорий" hint="Добавьте первую категорию ниже" />
        ) : (
          <div className="flex flex-col divide-y divide-edge">
            {list.map((cat, index) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                first={index === 0}
                last={index === list.length - 1}
                onMoveUp={() => void onMove(list, index, -1)}
                onMoveDown={() => void onMove(list, index, 1)}
                applyLocal={applyLocal}
                reload={reload}
              />
            ))}
          </div>
        )}

        {adding ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Цвет новой категории"
              className="h-8 w-8 shrink-0 cursor-pointer rounded-[8px] border border-edge bg-surface-2 p-0.5"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createCategory();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
              placeholder="Название категории"
              autoFocus
              className="flex-1"
            />
            <Button
              variant="primary"
              size="sm"
              loading={creating}
              disabled={!newName.trim()}
              onClick={() => void createCategory()}
            >
              Добавить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Отмена
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            className="mt-3 self-start"
            onClick={() => setAdding(true)}
          >
            Новая категория
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Строка категории                                                   */
/* ------------------------------------------------------------------ */

function CategoryRow({
  cat,
  first,
  last,
  onMoveUp,
  onMoveDown,
  applyLocal,
  reload,
}: {
  cat: CategoryDto;
  first: boolean;
  last: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  applyLocal: (id: string, patch: Partial<CategoryDto>) => void;
  reload: () => Promise<void>;
}) {
  const { toast } = useToast();
  const txCount = cat.transactionCount ?? 0;

  /* ---- Цвет (debounce PATCH) ---- */
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (colorTimer.current) clearTimeout(colorTimer.current);
    };
  }, []);

  function handleColorChange(value: string) {
    applyLocal(cat.id, { color: value });
    if (colorTimer.current) clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(async () => {
      try {
        await apiPatch(`/api/categories/${cat.id}`, { color: value });
        toast("Цвет обновлён");
      } catch (e) {
        toast(errorMessage(e), "error");
        void reload();
      }
    }, 500);
  }

  /* ---- Переименование ---- */
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(cat.name);
  const cancelRef = useRef(false);

  function startEdit() {
    setNameDraft(cat.name);
    cancelRef.current = false;
    setEditing(true);
  }

  async function commitName() {
    setEditing(false);
    if (cancelRef.current) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === cat.name) return;
    try {
      await apiPatch(`/api/categories/${cat.id}`, { name: trimmed });
      applyLocal(cat.id, { name: trimmed });
      toast("Категория переименована");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  /* ---- Удаление категории ---- */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteCategory() {
    setDeleting(true);
    try {
      await apiDelete(`/api/categories/${cat.id}`);
      toast("Категория удалена");
      setConfirmDelete(false);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeleting(false);
    }
  }

  /* ---- Подкатегории ---- */
  const [confirmSub, setConfirmSub] = useState<SubcategoryDto | null>(null);
  const [deletingSub, setDeletingSub] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subName, setSubName] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);

  async function deleteSub(sub: SubcategoryDto) {
    setDeletingSub(true);
    try {
      await apiDelete(`/api/subcategories/${sub.id}`);
      toast("Подкатегория удалена");
      setConfirmSub(null);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeletingSub(false);
    }
  }

  function requestDeleteSub(sub: SubcategoryDto) {
    if ((sub.transactionCount ?? 0) > 0) {
      setConfirmSub(sub);
    } else {
      void deleteSub(sub);
    }
  }

  async function createSub() {
    const name = subName.trim();
    if (!name) return;
    setCreatingSub(true);
    try {
      await apiPost("/api/subcategories", { name, categoryId: cat.id });
      toast("Подкатегория добавлена");
      setSubName("");
      setAddingSub(false);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setCreatingSub(false);
    }
  }

  const subs = [...cat.subcategories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
  );

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        {/* Цветной кружок с невидимым color-input поверх */}
        <span className="relative inline-flex h-5 w-5 shrink-0" title="Изменить цвет">
          <span
            aria-hidden
            className="h-5 w-5 rounded-full border border-edge-strong"
            style={{ background: cat.color }}
          />
          <input
            type="color"
            value={cat.color}
            onChange={(e) => handleColorChange(e.target.value)}
            aria-label={`Цвет категории «${cat.name}»`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>

        {editing ? (
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                cancelRef.current = true;
                e.currentTarget.blur();
              }
            }}
            onBlur={() => void commitName()}
            autoFocus
            className="!h-7 flex-1 text-[13.5px]"
          />
        ) : (
          <>
            <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">
              {cat.name}
            </span>
            <IconButton onClick={startEdit} aria-label="Переименовать" title="Переименовать">
              <Pencil size={13} />
            </IconButton>
            <span className="shrink-0 text-[12px] text-ink-3">{pluralOps(txCount)}</span>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <IconButton
            onClick={onMoveUp}
            disabled={first}
            className="disabled:pointer-events-none disabled:opacity-30"
            aria-label="Выше"
            title="Выше"
          >
            <ArrowUp size={14} />
          </IconButton>
          <IconButton
            onClick={onMoveDown}
            disabled={last}
            className="disabled:pointer-events-none disabled:opacity-30"
            aria-label="Ниже"
            title="Ниже"
          >
            <ArrowDown size={14} />
          </IconButton>
          <IconButton
            danger
            disabled={txCount > 0}
            onClick={() => setConfirmDelete(true)}
            className="disabled:pointer-events-none disabled:opacity-30"
            aria-label="Удалить категорию"
            title={txCount > 0 ? "Сначала перенесите операции" : "Удалить категорию"}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* Чипы подкатегорий */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[30px]">
        {subs.map((sub) => (
          <span
            key={sub.id}
            className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12px] text-ink-2"
          >
            {sub.name}
            <button
              onClick={() => requestDeleteSub(sub)}
              aria-label={`Удалить подкатегорию «${sub.name}»`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-danger/15 hover:text-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {addingSub ? (
          <Input
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createSub();
              if (e.key === "Escape") {
                setAddingSub(false);
                setSubName("");
              }
            }}
            onBlur={() => {
              if (!subName.trim() && !creatingSub) setAddingSub(false);
            }}
            placeholder="Название"
            autoFocus
            disabled={creatingSub}
            className="!h-6 w-36 rounded-full px-2.5 text-[12px]"
          />
        ) : (
          <button
            onClick={() => setAddingSub(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-edge px-2.5 py-0.5 text-[12px] text-ink-3 transition-colors hover:border-edge-strong hover:text-ink-2"
          >
            <Plus size={11} />
            добавить
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteCategory()}
        title="Удалить категорию?"
        message={
          <>
            Категория «{cat.name}» будет удалена вместе с подкатегориями. Это действие нельзя
            отменить.
          </>
        }
        loading={deleting}
      />

      <ConfirmDialog
        open={confirmSub !== null}
        onClose={() => setConfirmSub(null)}
        onConfirm={() => {
          if (confirmSub) void deleteSub(confirmSub);
        }}
        title="Удалить подкатегорию?"
        message={
          confirmSub ? (
            <>
              У подкатегории «{confirmSub.name}» — {pluralOps(confirmSub.transactionCount ?? 0)}.
              Операции останутся без подкатегории.
            </>
          ) : null
        }
        loading={deletingSub}
      />
    </div>
  );
}
