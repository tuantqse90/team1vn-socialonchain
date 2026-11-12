"use client";

/**
 * Component nhỏ dùng chung theo Foundations của design canvas: badge Verified builder, segmented có thumb trượt,
 * số đếm chạy, hạt bung khi thành công. Ít chữ, trạng thái bằng icon + số.
 */
import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/** Dấu Verified builder (tín hiệu onchain_builder) + số contract đã deploy trên Avalanche. */
export function Verified({
  count,
  size = 15,
  showCount = true,
  href,
}: {
  count: number;
  size?: number;
  showCount?: boolean;
  href?: string | null;
}) {
  const t = useTranslations("common");
  if (count <= 0) return null;
  const label = t("verifiedBuilder", { n: count });
  const inner = (
    <>
      <span className="inline-flex text-[var(--accent)]">
        <Icon name="verified" filled className="" />
      </span>
      {showCount && <span className="mono text-[12px] font-semibold tabular-nums">{count}</span>}
    </>
  );
  const cls =
    "inline-flex shrink-0 items-center gap-0.5 text-[var(--red-ink)] [&_svg]:h-[var(--vs)] [&_svg]:w-[var(--vs)] [&_svg]:stroke-[var(--bg)]";
  const style = { "--vs": `${size}px` } as CSSProperties;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className={cls}
      style={style}
    >
      {inner}
    </a>
  ) : (
    <span role="img" aria-label={label} title={label} className={cls} style={style}>
      {inner}
    </span>
  );
}

/** Segmented control có thumb trượt (spring). Mỗi mục: icon + nhãn 1–2 từ (nhãn có thể ẩn, vẫn có aria). */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  iconOnly = false,
  testId,
}: {
  items: { key: K; icon?: IconName; label: string; dot?: boolean }[];
  value: K;
  onChange: (k: K) => void;
  iconOnly?: boolean;
  testId?: string;
}) {
  const idx = Math.max(
    0,
    items.findIndex((i) => i.key === value),
  );
  return (
    <div
      role="tablist"
      data-testid={testId}
      className="relative grid rounded-full bg-[var(--soft)] p-1"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-1 top-1 left-1 rounded-full bg-[var(--bg)] shadow-sm"
        style={{
          width: `calc((100% - 8px) / ${items.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: "transform .42s var(--spring)",
        }}
      />
      {items.map((i) => {
        const active = i.key === value;
        return (
          <button
            key={i.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={i.label}
            title={i.label}
            data-testid={testId ? `${testId}-${i.key}` : undefined}
            onClick={() => onChange(i.key)}
            className={`press relative z-10 flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] ${
              active ? "text-[var(--ink)]" : "text-[var(--muted)]"
            }`}
          >
            {i.icon && <Icon name={i.icon} className="h-[18px] w-[18px]" filled={false} />}
            {!iconOnly && <span className="truncate">{i.label}</span>}
            {i.dot && (
              <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Số chạy từ giá trị cũ tới giá trị mới (ease in-out). Tôn trọng prefers-reduced-motion. */
export function CountUp({
  value,
  decimals = 0,
  duration = 700,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      {format ? format(shown) : shown.toFixed(decimals)}
    </span>
  );
}

/** Hạt bung (12 hạt) khi thành công. Đặt trong phần tử `relative`; đổi `k` để bắn lại. */
export function Burst({ k, color }: { k: number; color?: string }) {
  if (!k) return null;
  return (
    <span className="burst" key={k} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: hạt trang trí, thứ tự cố định
          key={i}
          style={
            {
              "--a": `${i * 30}deg`,
              "--d": `${40 + (i % 3) * 14}px`,
              background: color,
              animationDelay: `${(i % 4) * 20}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Vòng lớn có số ở giữa (quota, ngày còn lại của session key). */
export function BigRing({
  value,
  size = 96,
  stroke = 8,
  color = "var(--accent)",
  children,
  label,
  orbit = false,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
  orbit?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${c * v} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray .8s var(--spring)" }}
        />
      </svg>
      {orbit && v > 0 && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ transform: `rotate(${v * 360}deg)`, transition: "transform .8s var(--spring)" }}
        >
          <span
            className="absolute left-1/2 rounded-full bg-[var(--bg)]"
            style={{
              top: stroke / 2 - 3,
              width: 6,
              height: 6,
              marginLeft: -3,
              boxShadow: `0 0 0 2px ${color}`,
            }}
          />
        </span>
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </span>
    </span>
  );
}

/** Cột equalizer nhỏ (nhịp kênh / hoạt động). */
export function Eq({ className = "h-3.5" }: { className?: string }) {
  return (
    <span className={`eq inline-flex items-end gap-[2px] ${className}`} aria-hidden>
      <i style={{ height: "60%" }} />
      <i style={{ height: "100%" }} />
      <i style={{ height: "75%" }} />
    </span>
  );
}
