"use client";

import { postsAbi } from "@socialonchain/protocol";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type CSSProperties, useState } from "react";
import { contracts } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import type { Post } from "@/lib/types";
import { Icon, type IconName } from "../Icon";
import { fcUrl, rawId } from "./util";

const KIND_LIKE = 1;
const KIND_REPOST = 2;
/** Góc 8 hạt bung khi thả tim. */
const BURST = [0, 45, 90, 135, 180, 225, 270, 315];

/** Like/repost lạc quan bằng session key: bấm là đổi ngay, tx chạy nền, lỗi thì trả lại. */
export function useReactions(post: Post) {
  const t = useTranslations("card");
  const router = useRouter();
  const { status, owner } = useSession();
  const write = useSessionWrite();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [reposted, setReposted] = useState<boolean | null>(null);
  const isLiked = liked ?? post.viewer?.liked ?? false;
  const isReposted = reposted ?? post.viewer?.reposted ?? false;
  const likeCount = post.stats.likes + (liked === null ? 0 : (liked ? 1 : 0) - (post.viewer?.liked ? 1 : 0));
  const repostCount =
    post.stats.reposts + (reposted === null ? 0 : (reposted ? 1 : 0) - (post.viewer?.reposted ? 1 : 0));
  const canAct = post.source === "onchain" && status === "ready" && !post.deleted;

  async function react(kind: number, on: boolean, set: (v: boolean) => void) {
    if (!canAct || !contracts || !owner) {
      if (status !== "ready") router.push("/welcome");
      return;
    }
    set(on);
    const ok = await write(kind === KIND_LIKE ? t("like") : t("repost"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: on ? "react" : "unreact",
      args: [owner, rawId(post.id), kind],
    }).catch(() => false);
    if (!ok) set(!on);
  }

  return {
    canAct,
    isLiked,
    likeCount,
    isReposted,
    repostCount,
    toggleLike: () => void react(KIND_LIKE, !isLiked, setLiked),
    toggleRepost: () => void react(KIND_REPOST, !isReposted, setReposted),
  };
}

const ACT =
  "press inline-flex h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-[13px] transition-colors";

/** Tim: bấm thích thì nảy 1.35 và chuyển đỏ. */
export function LikeButton({
  on,
  count,
  onClick,
  small,
}: {
  on: boolean;
  count: number;
  onClick: () => void;
  small?: boolean;
}) {
  const t = useTranslations("card");
  const [pop, setPop] = useState(0);
  return (
    <button
      type="button"
      aria-label={t("like")}
      title={t("like")}
      aria-pressed={on}
      data-testid="like"
      onClick={() => {
        if (!on) setPop((p) => p + 1);
        onClick();
      }}
      className={`${ACT} ${on ? "text-[var(--red-ink)]" : "text-[var(--ink)]"}`}
    >
      <span
        key={pop}
        className={`relative inline-flex ${pop ? "anim-heart" : ""} ${on ? "text-[var(--accent)]" : ""}`}
      >
        <Icon name="heart" filled={on} className={small ? "h-[19px] w-[19px]" : "h-[21px] w-[21px]"} />
        {pop > 0 && on && (
          <>
            <span aria-hidden className="like-ring" />
            <span aria-hidden className="burst sm">
              {BURST.map((a, i) => (
                <i
                  key={a}
                  style={
                    {
                      "--a": `${a}deg`,
                      "--d": `${i % 2 ? 15 : 21}px`,
                      background: i % 3 === 1 ? "var(--warn)" : "var(--accent)",
                    } as CSSProperties
                  }
                />
              ))}
            </span>
          </>
        )}
      </span>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

/** Nút hành động icon + số (số màu muted). */
export function ActButton({
  icon,
  label,
  count,
  onClick,
  href,
  active,
  testId,
}: {
  icon: IconName;
  label: string;
  count?: number;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <Icon name={icon} className="h-5 w-5" />
      {count !== undefined && count > 0 && (
        <span className={`tabular-nums ${active ? "" : "text-[var(--muted)]"}`}>{count}</span>
      )}
    </>
  );
  const cls = `${ACT} ${active ? "text-[var(--red-ink)]" : "text-[var(--ink)]"}`;
  if (href)
    return (
      <Link href={href} aria-label={label} title={label} data-testid={testId} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={cls}
    >
      {inner}
    </button>
  );
}

/** Chia sẻ: share sheet của hệ thống, không có thì chép link (icon chuyển thành dấu check). */
export function ShareButton({ path }: { path: string }) {
  const t = useTranslations("card");
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard bị chặn: bỏ qua
    }
  }
  return (
    <button
      type="button"
      aria-label={copied ? t("copied") : t("share")}
      title={copied ? t("copied") : t("share")}
      onClick={() => void share()}
      className={`${ACT} text-[var(--ink)]`}
    >
      <span key={String(copied)} className={`inline-flex ${copied ? "anim-pop text-[var(--ok-ink)]" : ""}`}>
        <Icon name={copied ? "check" : "send"} className="h-5 w-5" />
      </span>
    </button>
  );
}

/** Nút "…" mở menu bài (chép link, ẩn tác giả, báo cáo, xoá). */
export function MoreButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const t = useTranslations("card");
  return (
    <button
      type="button"
      aria-label={t("more")}
      title={t("more")}
      data-testid="post-menu"
      onClick={onClick}
      className={`press flex h-11 w-11 shrink-0 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] ${className}`}
    >
      <Icon name="more" className="h-5 w-5" strokeWidth={3} />
    </button>
  );
}

/** Mũi tên ↗ (link ra ngoài). */
export function Arrow({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/** Nhãn nguồn Farcaster (chữ xám) + ↗ tới bài gốc. */
export function FcChip({ post, iconOnly = false }: { post: Post; iconOnly?: boolean }) {
  const t = useTranslations("card");
  const url = fcUrl(post);
  const body = (
    <>
      <Icon name="arch" className="h-[13px] w-[13px]" strokeWidth={2.2} />
      {!iconOnly && <span>Farcaster</span>}
      {url && !iconOnly && <Arrow className="h-3 w-3" />}
    </>
  );
  const cls = "inline-flex shrink-0 items-center gap-[3px] text-[12px] font-semibold text-[var(--muted)]";
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={t("openFc")}
      title={t("openFc")}
      className={`${cls} -my-3 py-3 hover:text-[var(--ink)]`}
    >
      {body}
    </a>
  ) : (
    <span role="img" aria-label="Farcaster" className={cls}>
      {body}
    </span>
  );
}
