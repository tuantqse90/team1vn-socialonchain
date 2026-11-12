import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

/** Vòng tiến độ nhỏ (quota, gas, byte count). */
export function Ring({
  value,
  size = 22,
  stroke = 3,
  danger = false,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  danger?: boolean;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={danger ? "var(--accent)" : "var(--ink)"}
        strokeWidth={stroke}
        strokeDasharray={`${c * v} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray .4s cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = "solid",
  disabled,
  type = "button",
  testId,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "ghost" | "outline" | "accent";
  disabled?: boolean;
  type?: "button" | "submit";
  testId?: string;
  className?: string;
}) {
  const styles = {
    solid: "bg-[var(--ink)] text-[var(--bg)]",
    accent: "bg-[var(--accent)] text-[var(--accent-ink)]",
    outline: "border border-[var(--line)] text-[var(--ink)]",
    ghost: "text-[var(--ink)] hover:bg-[var(--soft)]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`press inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-opacity disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Empty({ icon = "layers", text }: { icon?: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-[var(--muted)]">
      <Icon name={icon} className="h-8 w-8" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

/**
 * Bottom sheet (mobile) / dialog (desktop). Render qua portal ra `document.body`: nếu không, sheet mở từ trong
 * một hàng của list ảo hoá (có `transform`) sẽ bị `position: fixed` neo theo hàng đó thay vì viewport.
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** Nhãn cho trình đọc màn hình khi không hiện tiêu đề. */
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal
      aria-label={title ?? label}
    >
      <button
        type="button"
        aria-label="close"
        className="sheet-backdrop absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="sheet relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[var(--bg)] p-5 pb-8 shadow-2xl md:rounded-[28px]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line)] md:hidden" />
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Chip({
  children,
  active,
  onClick,
  testId,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`press shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}
