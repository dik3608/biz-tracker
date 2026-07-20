"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/** Показывает ошибку из catch-блока: берёт message у Error, иначе общий текст. */
export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Что-то пошло не так";
}

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={16} className="text-income" />,
  error: <AlertCircle size={16} className="text-danger" />,
  info: <Info size={16} className="text-accent" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={clsx(
                    "anim-pop pointer-events-auto flex w-auto max-w-full items-center gap-2.5 rounded-control border px-3.5 py-2.5 text-[13px] shadow-lg shadow-black/40",
                    t.kind === "error"
                      ? "border-danger/30 bg-surface-2 text-ink"
                      : "border-edge-strong bg-surface-2 text-ink",
                  )}
                >
                  {icons[t.kind]}
                  <span className="min-w-0 break-words">{t.message}</span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
