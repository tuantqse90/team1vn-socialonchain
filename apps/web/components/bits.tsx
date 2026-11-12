"use client";

import { Icon, type IconName } from "@socialonchain/ui";
import Link from "next/link";
import { avatarHue, displayName } from "@/lib/format";
import type { Author } from "@/lib/types";

export { Button, Chip, Empty, Ring, Sheet, Spinner } from "@socialonchain/ui";

/** Nền avatar chữ: 4 bảng màu theo token (ink, mist, đỏ, blush), tự đổi theo dark mode. */
const AVATAR_TONES = [
  "bg-[var(--ink)] text-[var(--bg)]",
  "bg-[var(--soft)] text-[var(--ink)]",
  "bg-[var(--accent)] text-[var(--accent-ink)]",
  "bg-[var(--blush)] text-[var(--red-ink)]",
];

/** 1–2 chữ cái đầu: "linh_builds" → "LB", "Gia Bảo" → "GB", địa chỉ → 2 ký tự hex đầu. */
function initials(a: Pick<Author, "displayName" | "handle" | "fcUsername" | "address">): string {
  const name = a.displayName || a.handle || a.fcUsername;
  if (!name) return a.address ? a.address.slice(2, 4).toUpperCase() : "?";
  const words = name.split(/[\s_.-]+/u).filter(Boolean);
  const first = [...(words[0] ?? name)][0] ?? "?";
  const second = words.length > 1 ? ([...(words[1] ?? "")][0] ?? "") : "";
  return (first + second).toUpperCase();
}

/**
 * Avatar tròn: ảnh nếu có, không thì chữ cái đầu trên nền token. Không gắn badge:
 * dấu Verified builder đặt cạnh tên (`Verified` trong kit.tsx).
 */
export function Avatar({
  author,
  size = 40,
}: {
  author: Pick<
    Author,
    "avatarUrl" | "address" | "handle" | "fcUsername" | "displayName" | "fid" | "contractsDeployed"
  >;
  size?: number;
}) {
  const seed = author.address ?? author.fcUsername ?? String(author.fid ?? "?");
  const tone = AVATAR_TONES[avatarHue(seed) % AVATAR_TONES.length];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {author.avatarUrl ? (
        // biome-ignore lint/performance/noImgElement: ảnh avatar từ nhiều nguồn ngoài, không tối ưu được qua next/image
        <img src={author.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full font-bold tracking-tight ${tone}`}
          style={{ fontSize: Math.max(9, Math.round(size * 0.36)) }}
          aria-hidden
        >
          {initials(author)}
        </span>
      )}
    </span>
  );
}

export function Name({ author }: { author: Author }) {
  return <span className="truncate font-semibold">{displayName(author)}</span>;
}

export function IconButton({
  icon,
  label,
  onClick,
  active,
  count,
  href,
  disabled,
  testId,
  filled,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  count?: number;
  href?: string;
  disabled?: boolean;
  testId?: string;
  filled?: boolean;
}) {
  const cls = `press inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[13px] transition-colors ${
    active ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
  } disabled:opacity-40`;
  const inner = (
    <>
      <Icon name={icon} className="h-[19px] w-[19px]" filled={filled ?? active} />
      {count !== undefined && count > 0 && <span className="mono tabular-nums">{count}</span>}
      <span className="sr-only">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label} title={label} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={testId}
    >
      {inner}
    </button>
  );
}
