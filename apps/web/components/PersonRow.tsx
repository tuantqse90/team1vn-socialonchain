"use client";

import Link from "next/link";
import { shortAddr } from "@/lib/format";
import type { Author } from "@/lib/types";
import { Avatar } from "./bits";
import { Highlight, plain } from "./explore/text";
import { FollowButton } from "./FollowButton";
import { Icon } from "./Icon";
import { Verified } from "./kit";

/**
 * Hàng người: avatar, tên + Verified (số contract), handle hoặc địa chỉ rút gọn (mono), nút follow tuỳ chọn.
 * Người chỉ có trên Farcaster (chưa đăng ký): icon vòm, không follow.
 */
export function PersonRow({
  author,
  onClick,
  follow = false,
  back = false,
  q,
  className = "rounded-2xl px-2 hover:bg-[var(--soft)]",
  size = 44,
}: {
  author: Author;
  onClick?: () => void;
  /** Hiện nút follow (dùng `author.viewerFollows`). */
  follow?: boolean;
  /** Nút ghi "Follow lại" (người này đã follow mình). */
  back?: boolean;
  /** Truy vấn tìm kiếm để tô chỗ khớp. */
  q?: string;
  className?: string;
  size?: number;
}) {
  const href = author.handle ? `/u/${author.handle}` : author.address ? `/u/${author.address}` : null;
  const fcOnly = Boolean(author.fid) && !author.registered;
  const name = author.displayName || author.handle || author.fcUsername || shortAddr(author.address);
  // Có tên hiển thị → dòng 2 là handle; không thì tên đã là handle → dòng 2 là địa chỉ rút gọn.
  const sub = author.displayName
    ? author.handle
      ? `@${author.handle}`
      : author.fcUsername
        ? `@${author.fcUsername}`
        : shortAddr(author.address)
    : shortAddr(author.address);
  const inner = (
    <>
      <Avatar author={plain(author)} size={size} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex h-5 items-center gap-1.5 whitespace-nowrap">
          <span className="truncate text-[15px] font-semibold">
            <Highlight text={name} q={q} />
          </span>
          <Verified count={author.contractsDeployed} size={16} />
          {fcOnly && (
            <span className="inline-flex shrink-0 text-[#8a63d2]" title="Farcaster">
              <Icon name="arch" className="h-4 w-4" />
              <span className="sr-only">Farcaster</span>
            </span>
          )}
        </span>
        {sub && sub !== name && (
          <span className="mono truncate text-[12px] text-[var(--muted)]">
            <Highlight text={sub} q={q} />
          </span>
        )}
      </span>
    </>
  );
  const body = "flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2";
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="person-row">
      {href ? (
        <Link href={href} onClick={onClick} className={body}>
          {inner}
        </Link>
      ) : (
        <span className={body}>{inner}</span>
      )}
      {follow && !fcOnly && author.address && (
        <span className="flex h-11 shrink-0 items-center">
          <FollowButton
            address={author.address}
            following={author.viewerFollows ?? false}
            back={back}
            testId="person-follow"
          />
        </span>
      )}
    </div>
  );
}
