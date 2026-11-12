"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

/** Nhóm cài đặt: nhãn mono nhỏ + thẻ bo tròn chứa các dòng. */
export function Group({
  label,
  children,
  id,
  bare = false,
  testId,
}: {
  label: string;
  children: ReactNode;
  id?: string;
  /** Không bọc thẻ (form). */
  bare?: boolean;
  testId?: string;
}) {
  return (
    <section id={id} className="mt-6 scroll-mt-16">
      <h2 className="mono mb-2 ml-3.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </h2>
      {bare ? (
        children
      ) : (
        <div
          className="divide-y divide-[var(--line)] overflow-hidden rounded-[22px] bg-[var(--soft)]"
          data-testid={testId}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/** Ô icon vuông bo góc đầu dòng. */
export function Tile({ icon, children }: { icon?: IconName; children?: ReactNode }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ink)] text-[var(--bg)] dark:bg-[var(--line)] dark:text-[var(--ink)]">
      {children ?? (icon && <Icon name={icon} className="h-[17px] w-[17px]" strokeWidth={2.1} />)}
    </span>
  );
}

/** Một dòng: icon + nhãn 1–2 từ + phần phải. Có `href`/`onClick` thì thành link/nút có mũi tên. */
export function Row({
  icon,
  tile,
  label,
  children,
  href,
  onClick,
  testId,
}: {
  icon?: IconName;
  tile?: ReactNode;
  label: string;
  children?: ReactNode;
  href?: string;
  onClick?: () => void;
  testId?: string;
}) {
  const inner = (
    <>
      <Tile icon={icon}>{tile}</Tile>
      <span className="min-w-0 flex-1 text-[15px] font-semibold">{label}</span>
      {children}
      {(href || onClick) && (
        <Icon name="chevronr" className="h-4 w-4 shrink-0 text-[var(--muted)]" strokeWidth={2.4} />
      )}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-2.5 py-1 text-left";
  const tap = "transition-colors active:bg-[var(--line)]";
  if (href)
    return (
      <Link href={href} className={`${cls} ${tap}`} data-testid={testId}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={`${cls} ${tap}`} data-testid={testId}>
        {inner}
      </button>
    );
  return (
    <div className={cls} data-testid={testId}>
      {inner}
    </div>
  );
}

/** Công tắc bật/tắt (spring). `locked`: luôn bật, có ổ khoá trên núm. */
export function Switch({
  on,
  onChange,
  label,
  locked = false,
  lockedLabel,
  testId,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  locked?: boolean;
  lockedLabel?: string;
  testId?: string;
}) {
  const full = locked && lockedLabel ? `${label} · ${lockedLabel}` : label;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={full}
      title={full}
      disabled={locked}
      onClick={() => onChange(!on)}
      data-testid={testId}
      className="flex h-11 w-[52px] shrink-0 items-center"
    >
      <span
        className={`flex h-8 w-[52px] items-center rounded-full p-0.5 transition-colors duration-300 ${
          on
            ? "bg-[var(--ink)] dark:bg-[var(--accent)]"
            : "bg-[color-mix(in_srgb,var(--muted)_35%,var(--soft))]"
        }`}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[var(--ink)] shadow-md dark:text-[var(--accent)]"
          style={{ transform: `translateX(${on ? 20 : 0}px)`, transition: "transform .42s var(--bouncy)" }}
        >
          {locked && <Icon name="lock" className="h-3.5 w-3.5" strokeWidth={2.4} />}
        </span>
      </span>
    </button>
  );
}

/** Segmented nhỏ ở cuối dòng (VI/EN, sáng/tối/tự động): thumb trượt bouncy, mỗi ô ≥ 44px. */
export function Seg<K extends string>({
  label,
  items,
  value,
  onChange,
  testId,
}: {
  label: string;
  items: { key: K; label: string; content: ReactNode }[];
  value: K;
  onChange: (k: K) => void;
  testId?: string;
}) {
  const idx = Math.max(
    0,
    items.findIndex((i) => i.key === value),
  );
  return (
    <fieldset
      aria-label={label}
      data-testid={testId}
      className="relative grid h-[50px] min-w-0 shrink-0 rounded-[14px] bg-[var(--line)] p-[3px]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, width: items.length * 48 + 6 }}
    >
      <span
        aria-hidden
        className="absolute bottom-[3px] left-[3px] top-[3px] rounded-[11px] bg-[var(--bg)] shadow-sm"
        style={{
          width: `calc((100% - 6px) / ${items.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: "transform .45s var(--bouncy)",
        }}
      />
      {items.map((i) => {
        const on = i.key === value;
        return (
          <button
            key={i.key}
            type="button"
            aria-pressed={on}
            aria-label={i.label}
            title={i.label}
            onClick={() => onChange(i.key)}
            data-testid={testId ? `${testId}-${i.key}` : undefined}
            className={`relative z-10 flex items-center justify-center transition-colors ${
              on ? "text-[var(--ink)]" : "text-[var(--muted)]"
            }`}
          >
            {i.content}
          </button>
        );
      })}
    </fieldset>
  );
}

/** Vòng nửa đặc: "tự động" theo hệ thống (cũng là icon dòng Giao diện). */
export function AutoIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </svg>
  );
}
