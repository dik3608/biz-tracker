"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:bg-accent-hover",
  secondary: "bg-surface-3 text-ink hover:bg-[#2a2f3b] border border-edge",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger/10 text-danger border border-danger/25 hover:bg-danger/18",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center rounded-control font-medium transition-colors select-none",
        "disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

/** Квадратная кнопка под одну иконку (действия в строках таблиц). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }
>(function IconButton({ className, danger, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-3 transition-colors",
        danger ? "hover:bg-danger/12 hover:text-danger" : "hover:bg-surface-3 hover:text-ink",
        className,
      )}
      {...rest}
    />
  );
});
