"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Verified } from "@/components/kit";
import type { Post } from "@/lib/types";
import { fcUrl, Highlight, nameOf, plain, useAgo } from "./text";

/** Nhãn nguồn Farcaster (chỉ đọc) dạng chip nhỏ. */
function FcChip({ external }: { external: boolean }) {
  return (
    <span className="mono flex h-[22px] items-center gap-1 rounded-full bg-[var(--soft)] px-2 text-[11px] font-semibold text-[var(--muted)]">
      <Icon name="arch" className="h-[11px] w-[11px]" strokeWidth={2.6} />
      Farcaster
      {external && <Icon name="external" className="h-[11px] w-[11px]" strokeWidth={2.6} />}
    </span>
  );
}

/**
 * Bài rút gọn trong kết quả tìm kiếm / bài nổi: 3 dòng, không thanh hành động, tô chỗ khớp truy vấn.
 * Chạm → thread. Bài Farcaster có chip "Farcaster ↗" mở cast gốc.
 */
export function CompactPost({ post, q, index = 0 }: { post: Post; q?: string; index?: number }) {
  const t = useTranslations("explore");
  const ago = useAgo();
  const fc = post.source === "farcaster";
  const ext = fc ? fcUrl(post) : null;
  return (
    <div
      className="anim-drop relative border-b border-[var(--line)]"
      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <Link
        href={`/p/${post.id}`}
        className="flex gap-3 px-4 py-3.5 hover:bg-[var(--soft)]/40"
        data-testid="explore-post"
      >
        <Avatar author={plain(post.author)} size={36} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={`flex h-[22px] items-center gap-1.5 whitespace-nowrap ${fc ? "pr-24" : ""}`}>
            <span className="truncate text-[15px] font-semibold">{nameOf(post.author)}</span>
            <Verified count={post.author.contractsDeployed} size={16} />
            <span className="shrink-0 text-[14px] text-[var(--muted)]">{ago(post.createdAt)}</span>
          </span>
          {post.deleted ? (
            <span className="flex items-center gap-1.5 text-[14px] italic text-[var(--muted)]">
              <Icon name="trash" className="h-4 w-4" />
              {t("deleted")}
            </span>
          ) : (
            <span className="line-clamp-3 break-words text-[15px] leading-[1.42] [text-wrap:pretty]">
              <Highlight text={post.text} q={q} />
            </span>
          )}
        </span>
      </Link>
      {fc &&
        (ext ? (
          <a
            href={ext}
            target="_blank"
            rel="noreferrer"
            aria-label={t("openFc")}
            title={t("openFc")}
            className="press absolute right-2.5 top-[3px] flex h-11 items-center px-1.5"
          >
            <FcChip external />
          </a>
        ) : (
          <span className="absolute right-4 top-3.5" title={t("readOnlyFc")}>
            <FcChip external={false} />
          </span>
        ))}
    </div>
  );
}
