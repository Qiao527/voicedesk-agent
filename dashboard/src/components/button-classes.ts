import { clsx } from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClasses(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    variant === "primary" && "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
    variant === "secondary" && "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    variant === "danger" && "text-rose-600 hover:bg-rose-50",
    className,
  );
}
