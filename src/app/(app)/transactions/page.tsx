"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { formatDay, todayKey } from "@/lib/dates";
import { formatSigned, type Currency } from "@/lib/money";
import type {
  CategoryDto,
  TransactionDto,
  TransactionInput,
  TransactionListResponse,
  TxType,
} from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { defaultPeriod, PeriodPicker, usePeriod } from "@/components/ui/PeriodPicker";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { errorMessage, useToast } from "@/components/ui/Toast";
import { CategoryBadge, EmptyState, Skeleton, TxAmount } from "@/components/ui/misc";
import { TransactionForm } from "@/components/TransactionForm";

type TypeFilter = "all" | TxType;
type CurrencyFilter = "all" | Currency;
type SortCol = "date" | "amount";
type SortDir = "asc" | "desc";

/** «1 операцию / 2 операции / 5 операций» — для подтверждений удаления. */
function pluralOps(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  alignRight,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  alignRight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 font-medium transition-colors hover:text-ink",
        active ? "text-ink" : "text-ink-3",
        alignRight && "justify-end",
      )}
    >
      {label}
      {active ? (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
    </button>
  );
}

const checkboxClasses = "h-4 w-4 shrink-0 cursor-pointer accent-accent";

export default function TransactionsPage() {
  const { toast } = useToast();
  const today = todayKey();

  // ---------- Фильтры ----------
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [period, setPeriod] = usePeriod("tx-period");

  // ---------- Сортировка и пагинация ----------
  const [sort, setSort] = useState<SortCol>("date");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Дебаунс поиска: 300 мс
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);
  useEffect(() => {
    setPage(1);
  }, [search]);

  // ---------- Справочник категорий ----------
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGet<{ categories: CategoryDto[] }>("/api/categories")
      .then((d) => {
        if (!cancelled) setCategories(d.categories);
      })
      .catch(() => {
        // фильтр по категориям деградирует молча — список операций важнее
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const incomeCategories = useMemo(() => categories.filter((c) => c.type === "INCOME"), [categories]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "EXPENSE"), [categories]);
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // ---------- Данные списка ----------
  const [items, setItems] = useState<TransactionDto[] | null>(null);
  const [totals, setTotals] = useState<TransactionListResponse["totals"] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const data = await apiGet<TransactionListResponse>("/api/transactions", {
          from: period.range?.from,
          to: period.range?.to,
          type: type === "all" ? undefined : type,
          categoryId: categoryId || undefined,
          subcategoryId: subcategoryId || undefined,
          currency: currency === "all" ? undefined : currency,
          search: search || undefined,
          page,
          pageSize,
          sort,
          dir,
        });
        if (requestId !== requestSeq.current) return;
        setItems(data.transactions);
        setTotals(data.totals);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setLoading(false);
      } catch (e) {
        if (requestId !== requestSeq.current) return;
        setLoadError(errorMessage(e));
        setLoading(false);
      }
    })();
  }, [period, type, categoryId, subcategoryId, currency, search, page, pageSize, sort, dir, reloadTick]);

  const refresh = () => setReloadTick((t) => t + 1);

  // ---------- Выделение (сбрасывается при смене фильтров/страницы/сортировки) ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [period, type, categoryId, subcategoryId, currency, search, page, pageSize, sort, dir]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = !!items && items.length > 0 && items.every((t) => selected.has(t.id));
  const toggleSelectAll = () => {
    if (!items) return;
    setSelected(allOnPageSelected ? new Set() : new Set(items.map((t) => t.id)));
  };

  // ---------- Обработчики фильтров ----------
  const onTypeChange = (t: TypeFilter) => {
    setType(t);
    setPage(1);
    if (t !== "all" && selectedCategory && selectedCategory.type !== t) {
      setCategoryId("");
      setSubcategoryId("");
    }
  };

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId("");
    setPage(1);
    if (id) {
      const cat = categories.find((c) => c.id === id);
      // Категория «неверного» типа приводит фильтр типа в соответствие
      if (cat && type !== "all" && cat.type !== type) setType(cat.type);
    }
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setType("all");
    setCategoryId("");
    setSubcategoryId("");
    setCurrency("all");
    setPeriod(defaultPeriod());
    setPage(1);
  };

  const def = defaultPeriod();
  const periodActive =
    period.preset !== def.preset || JSON.stringify(period.range) !== JSON.stringify(def.range);
  const hasActiveFilters =
    searchInput.trim() !== "" ||
    type !== "all" ||
    categoryId !== "" ||
    subcategoryId !== "" ||
    currency !== "all" ||
    periodActive;

  // ---------- Сортировка ----------
  const toggleSort = (col: SortCol) => {
    setPage(1);
    if (sort === col) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setDir("desc");
    }
  };

  // ---------- Удаление ----------
  const [deleteTarget, setDeleteTarget] = useState<TransactionDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  /** После удаления: если страница опустела — на предыдущую, иначе перезагрузка. */
  const afterRemoval = (removedIds: string[]) => {
    const removed = new Set(removedIds);
    const remaining = (items ?? []).filter((t) => !removed.has(t.id)).length;
    if (remaining === 0 && page > 1) setPage((p) => p - 1);
    else refresh();
  };

  const confirmDeleteOne = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete<{ ok: boolean }>(`/api/transactions/${deleteTarget.id}`);
      toast("Операция удалена");
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      afterRemoval([removedId]);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await apiPost<{ ok: boolean; deleted: number }>("/api/transactions/bulk-delete", {
        ids,
      });
      toast(`Удалено: ${res.deleted} ${pluralOps(res.deleted, "операция", "операции", "операций")}`);
      setBulkConfirmOpen(false);
      setSelected(new Set());
      afterRemoval(ids);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBulkDeleting(false);
    }
  };

  // ---------- Редактирование ----------
  const [editing, setEditing] = useState<TransactionDto | null>(null);

  const submitEdit = async (input: TransactionInput) => {
    if (!editing) return;
    try {
      await apiPut<TransactionDto>(`/api/transactions/${editing.id}`, input);
      toast("Сохранено");
      setEditing(null);
      refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
      throw e;
    }
  };

  // ---------- Ячейки, общие для таблицы и карточек ----------
  const rowActions = (tx: TransactionDto) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton aria-label="Редактировать" onClick={() => setEditing(tx)}>
        <Pencil size={14} />
      </IconButton>
      <IconButton danger aria-label="Удалить" onClick={() => setDeleteTarget(tx)}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );

  const tagChips = (tags: string[]) =>
    tags.length > 0 ? (
      <span className="inline-flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-edge bg-surface-2 px-1.5 py-px text-[11px] text-ink-3"
          >
            {tag}
          </span>
        ))}
      </span>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Операции</h1>
        <Link href="/add">
          <Button variant="primary" icon={<Plus size={15} />}>
            Добавить
          </Button>
        </Link>
      </div>

      {/* Фильтры */}
      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="relative w-full sm:w-56">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по описанию и тегам"
            className="pl-8"
            aria-label="Поиск"
          />
        </div>

        <SegmentedControl<TypeFilter>
          options={[
            { value: "all", label: "Все" },
            { value: "INCOME", label: "Доход", tone: "income" },
            { value: "EXPENSE", label: "Расход", tone: "expense" },
          ]}
          value={type}
          onChange={onTypeChange}
        />

        <Select
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-44"
          aria-label="Категория"
        >
          <option value="">Все категории</option>
          {incomeCategories.length > 0 ? (
            <optgroup label="Доход">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {expenseCategories.length > 0 ? (
            <optgroup label="Расход">
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>

        {selectedCategory && selectedCategory.subcategories.length > 0 ? (
          <Select
            value={subcategoryId}
            onChange={(e) => {
              setSubcategoryId(e.target.value);
              setPage(1);
            }}
            className="w-44"
            aria-label="Подкатегория"
          >
            <option value="">Все подкатегории</option>
            {selectedCategory.subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value as CurrencyFilter);
            setPage(1);
          }}
          className="w-32"
          aria-label="Валюта"
        >
          <option value="all">Все валюты</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </Select>

        <PeriodPicker
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setPage(1);
          }}
          className="ml-auto"
        />

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={resetFilters}>
            Сбросить
          </Button>
        ) : null}
      </Card>

      {/* Итоги по фильтру */}
      {totals && !loadError ? (
        <div className="tnum px-1 text-[13px] text-ink-3">
          Доход{" "}
          <span className="font-medium text-income">{formatSigned(totals.income)}</span>
          {" · "}Расход{" "}
          <span className="font-medium text-ink-2">{formatSigned(-totals.expense)}</span>
          {" · "}Итог{" "}
          <span
            className={clsx(
              "font-medium",
              totals.net > 0 ? "text-income" : totals.net < 0 ? "text-expense" : "text-ink-2",
            )}
          >
            {formatSigned(totals.net)}
          </span>
        </div>
      ) : null}

      {/* Панель выделения */}
      {selected.size > 0 ? (
        <Card className="flex items-center justify-between gap-3 border-accent/40 px-4 py-2.5">
          <span className="text-sm text-ink-2">
            Выбрано: <span className="tnum font-semibold text-ink">{selected.size}</span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Отменить
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => setBulkConfirmOpen(true)}
            >
              Удалить
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Содержимое: загрузка / ошибка / пусто / данные */}
      {loading ? (
        <Card className="px-4 py-4">
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      ) : loadError ? (
        <Card className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <p className="text-sm text-ink-2">{loadError}</p>
          <Button variant="secondary" onClick={refresh}>
            Повторить
          </Button>
        </Card>
      ) : !items || items.length === 0 ? (
        <Card>
          <EmptyState
            title="Ничего не найдено"
            hint={
              hasActiveFilters
                ? "Попробуйте изменить условия фильтров"
                : "Добавьте первую операцию, чтобы она появилась здесь"
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              ) : (
                <Link href="/add">
                  <Button variant="primary" size="sm" icon={<Plus size={14} />}>
                    Добавить
                  </Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Таблица (десктоп) */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[12px] text-ink-3">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Выбрать всё на странице"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className={checkboxClasses}
                    />
                  </th>
                  <th className="px-3 py-2.5">
                    <SortHeader
                      label="Дата"
                      active={sort === "date"}
                      dir={dir}
                      onClick={() => toggleSort("date")}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Описание</th>
                  <th className="px-3 py-2.5 font-medium">Категория</th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader
                      label="Сумма"
                      active={sort === "amount"}
                      dir={dir}
                      onClick={() => toggleSort("amount")}
                      alignRight
                    />
                  </th>
                  <th className="w-20 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr
                    key={tx.id}
                    className={clsx(
                      "border-b border-edge transition-colors last:border-b-0 hover:bg-surface-2",
                      selected.has(tx.id) && "bg-surface-2",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Выбрать операцию"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        className={checkboxClasses}
                      />
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-ink-2">
                      {formatDay(tx.date, { today })}
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-ink">{tx.description || "—"}</span>
                        {tagChips(tx.tags)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <CategoryBadge name={tx.category.name} color={tx.category.color} />
                        {tx.subcategory ? (
                          <span className="truncate text-[12px] text-ink-3">
                            {tx.subcategory.name}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <TxAmount
                        type={tx.type}
                        amount={tx.amount}
                        originalAmount={tx.originalAmount}
                        currency={tx.currency}
                      />
                    </td>
                    <td className="px-4 py-2.5">{rowActions(tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Карточки (мобила) */}
          <div className="flex flex-col gap-2 md:hidden">
            {items.map((tx) => (
              <Card key={tx.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Выбрать операцию"
                  checked={selected.has(tx.id)}
                  onChange={() => toggleSelect(tx.id)}
                  className={clsx(checkboxClasses, "mt-1")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">
                      {tx.description || "—"}
                    </p>
                    <TxAmount
                      type={tx.type}
                      amount={tx.amount}
                      originalAmount={tx.originalAmount}
                      currency={tx.currency}
                      className="shrink-0"
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                    <span className="tnum">{formatDay(tx.date, { today })}</span>
                    <CategoryBadge name={tx.category.name} color={tx.category.color} />
                    {tx.subcategory ? <span>{tx.subcategory.name}</span> : null}
                    {tagChips(tx.tags)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">{rowActions(tx)}</div>
              </Card>
            ))}
          </div>

          {/* Пагинация */}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Удаление одной операции */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteOne}
        title="Удалить операцию"
        loading={deleting}
        message={
          deleteTarget ? (
            <>
              Удалить операцию{" "}
              <span className="font-medium text-ink">
                {deleteTarget.description || formatDay(deleteTarget.date, { today })}
              </span>
              ? Это действие необратимо.
            </>
          ) : null
        }
      />

      {/* Массовое удаление */}
      <ConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={confirmBulkDelete}
        title="Удалить выбранные операции"
        loading={bulkDeleting}
        message={`Удалить ${selected.size} ${pluralOps(selected.size, "операцию", "операции", "операций")}? Это действие необратимо.`}
      />

      {/* Редактирование */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Редактировать операцию"
      >
        {editing ? (
          <TransactionForm
            initial={editing}
            categories={categories}
            onSubmit={submitEdit}
            submitLabel="Сохранить"
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
