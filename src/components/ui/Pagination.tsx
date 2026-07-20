"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "./Select";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-3">
      <span className="tnum">
        {from}–{to} из {total}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="w-[110px]"
            aria-label="Строк на странице"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} строк
              </option>
            ))}
          </Select>
        ) : null}
        <div className="flex items-center gap-1">
          <button
            aria-label="Предыдущая страница"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-edge bg-surface-2 text-ink-2 transition-colors hover:border-edge-strong disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="tnum min-w-[70px] text-center text-ink-2">
            {page} / {Math.max(totalPages, 1)}
          </span>
          <button
            aria-label="Следующая страница"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-edge bg-surface-2 text-ink-2 transition-colors hover:border-edge-strong disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
