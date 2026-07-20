"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

/** Обёртка «подпись + контрол + ошибка» для любых полей формы. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      {label ? (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClasses =
  "h-9 w-full rounded-control border border-edge bg-surface-2 px-3 text-sm text-ink " +
  "placeholder:text-ink-3 transition-colors hover:border-edge-strong " +
  "focus:border-accent focus:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(inputClasses, className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={clsx(inputClasses, "h-auto min-h-[72px] py-2 resize-y", className)}
        {...rest}
      />
    );
  },
);
