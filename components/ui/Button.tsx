import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-indigo-500/25 hover:shadow-md hover:shadow-indigo-500/30 hover:-translate-y-px active:translate-y-0 disabled:from-blue-300 disabled:to-blue-300 disabled:shadow-none disabled:translate-y-0",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:-translate-y-px active:translate-y-0 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:
    "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-sm shadow-red-500/25 hover:shadow-md hover:shadow-red-500/30 hover:-translate-y-px active:translate-y-0",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
