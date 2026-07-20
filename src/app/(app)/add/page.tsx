"use client";

/**
 * Страница быстрого добавления операции. После успешного сохранения форма
 * перемонтируется (key++), сохраняя тип/категорию/дату через sticky —
 * для серийного ввода нескольких операций подряд.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { formatDayHuman, type DateKey } from "@/lib/dates";
import type {
  CategoryDto,
  TransactionDto,
  TransactionInput,
  TransactionListResponse,
  TxType,
} from "@/lib/types";
import { TransactionForm } from "@/components/TransactionForm";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, Spinner, TxAmount } from "@/components/ui/misc";
import { errorMessage, useToast } from "@/components/ui/Toast";

interface Sticky {
  type: TxType;
  categoryId: string | null;
  date: DateKey;
}

export default function AddPage() {
  const router = useRouter();
  const { toast } = useToast();

  // --- Категории ---
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setCategories(null);
    setCategoriesError(null);
    try {
      const res = await apiGet<{ categories: CategoryDto[] }>("/api/categories");
      setCategories(res.categories);
    } catch (e) {
      setCategoriesError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // --- Недавно добавленное ---
  const [recent, setRecent] = useState<TransactionDto[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const recentRequestId = useRef(0);

  const loadRecent = useCallback(async () => {
    const id = ++recentRequestId.current;
    setRecentError(null);
    try {
      // «Последнее введённое сверху»: сортировка по времени создания на
      // сервере, иначе запись задним числом не попадёт в топ-6 по дате
      const res = await apiGet<TransactionListResponse>("/api/transactions", {
        pageSize: 6,
        sort: "created",
        dir: "desc",
      });
      if (id !== recentRequestId.current) return;
      setRecent(res.transactions);
    } catch (e) {
      if (id !== recentRequestId.current) return;
      setRecentError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // --- Форма: перемонтирование после успеха, липкие тип/категория/дата ---
  const [formKey, setFormKey] = useState(0);
  const [sticky, setSticky] = useState<Sticky | null>(null);

  const handleSubmit = useCallback(
    async (input: TransactionInput) => {
      const created = await apiPost<TransactionDto>("/api/transactions", input);
      toast(`Добавлено: ${created.description}`);
      setSticky({ type: input.type, categoryId: input.categoryId, date: input.date });
      setFormKey((k) => k + 1);
      void loadRecent();
    },
    [toast, loadRecent],
  );

  // --- Удаление из «Недавно добавлено» ---
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (tx: TransactionDto) => {
      setDeletingId(tx.id);
      try {
        await apiDelete<{ ok: true }>(`/api/transactions/${tx.id}`);
        toast("Удалено");
        await loadRecent();
      } catch (e) {
        toast(errorMessage(e), "error");
      } finally {
        setDeletingId(null);
      }
    },
    [toast, loadRecent],
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-tight">Добавить операцию</h1>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="max-w-xl px-5 py-4">
          {categoriesError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-ink-2">{categoriesError}</p>
              <Button onClick={() => void loadCategories()}>Повторить</Button>
            </div>
          ) : categories === null ? (
            <Spinner />
          ) : (
            <TransactionForm
              key={formKey}
              initial={null}
              sticky={sticky}
              categories={categories}
              onSubmit={handleSubmit}
              submitLabel="Добавить"
              onCancel={() => router.back()}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Недавно добавлено" />
          <div className="px-5 pb-4">
            {recentError ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-ink-2">{recentError}</p>
                <Button size="sm" onClick={() => void loadRecent()}>
                  Повторить
                </Button>
              </div>
            ) : recent === null ? (
              <Spinner />
            ) : recent.length === 0 ? (
              <EmptyState
                title="Пока пусто"
                hint="Добавленные операции появятся здесь"
              />
            ) : (
              <ul className="flex flex-col divide-y divide-edge">
                {recent.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{tx.description}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">{formatDayHuman(tx.date)}</p>
                    </div>
                    <TxAmount
                      type={tx.type}
                      amount={tx.amount}
                      originalAmount={tx.originalAmount}
                      currency={tx.currency}
                      className="text-[13px]"
                    />
                    <IconButton
                      danger
                      aria-label="Удалить"
                      title="Удалить"
                      disabled={deletingId === tx.id}
                      className="disabled:opacity-50"
                      onClick={() => void handleDelete(tx)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
