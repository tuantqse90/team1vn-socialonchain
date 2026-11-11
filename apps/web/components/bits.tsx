"use client";

import { Icon, type IconName } from "@socialonchain/ui";
import Link from "next/link";
import { avatarHue, displayName } from "@/lib/format";
import type { Author } from "@/lib/types";

export { Button, Chip, Empty, Ring, Sheet, Spinner } from "@socialonchain/ui";

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
  const letter = (author.displayName || author.handle || author.fcUsername || "?").slice(0, 1).toUpperCase();
  const verified = author.contractsDeployed > 0;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {author.avatarUrl ? (
        // biome-ignore lint/performance/noImgElement: ảnh avatar từ nhiều nguồn ngoài, không tối ưu được qua next/image
        <img src={author.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ background: `hsl(${avatarHue(seed)} 55% 52%)`, fontSize: size * 0.42 }}
        >
          {letter}
        </span>
      )}
      {verified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[var(--bg)] p-[1px] text-[var(--accent)]"
          title="Verified builder"
        >
          <Icon name="verified" className="h-3.5 w-3.5" filled />
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
