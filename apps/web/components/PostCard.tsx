"use client";

import type { Reason } from "@socialonchain/feed-sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";
import { track } from "@/lib/api";
import { txUrl } from "@/lib/chain";
import { displayName, handleOf, profileHref } from "@/lib/format";
import type { Post } from "@/lib/types";
import { Avatar } from "./bits";
import { useCompose } from "./Compose";
import { Embeds } from "./Embeds";
import { ActButton, Arrow, FcChip, LikeButton, MoreButton, ShareButton, useReactions } from "./feed/actions";
import { PostMenu } from "./feed/PostMenu";
import { useAgo } from "./feed/util";
import { WhySheet } from "./feed/WhySheet";
import { Icon } from "./Icon";
import { Verified } from "./kit";
import { PostText } from "./PostText";

export { WhySheet } from "./feed/WhySheet";

type Props = {
  post: Post;
  /** Có `reasons` (kể cả rỗng) nghĩa là bài nằm trong feed xếp hạng: hiện nút "vì sao". */
  reasons?: Reason[];
  score?: number;
  /** Hạng trong feed (1-based) và tổng số bài được xếp. */
  rank?: number;
  total?: number;
  origins?: string[];
  /** Bài gốc của trang thread: chữ to, nút ↗ explorer ở cuối hàng hành động. */
  big?: boolean;
  /** Đường nối từ avatar xuống các trả lời bên dưới. */
  showThreadLine?: boolean;
  /** Ghi đè nút trả lời (trang thread: focus thanh trả lời). */
  onReply?: () => void;
};

export const PostCard = memo(function PostCard({
  post,
  reasons,
  score,
  rank,
  total,
  origins,
  big = false,
  showThreadLine = false,
  onReply,
}: Props) {
  const t = useTranslations("card");
  const router = useRouter();
  const ago = useAgo();
  const compose = useCompose();
  const r = useReactions(post);
  const [why, setWhy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const onchain = post.source === "onchain";
  const href = profileHref(post.author);
  const inFeed = reasons !== undefined;
  const handle = post.author.displayName ? handleOf(post.author) : null;
  const tx = big && onchain && post.txHash ? txUrl(post.txHash) : null;

  if (collapsed) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5" data-testid="post-hidden">
        <span className="flex w-9 shrink-0 justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--muted)]">
            <Icon name="eyeoff" className="h-4 w-4" strokeWidth={2} />
          </span>
        </span>
        <span className="text-[15px] text-[var(--muted)]">{t("hidden")}</span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="press h-11 px-2 text-[15px] font-semibold text-[var(--ink)]"
        >
          {t("undo")}
        </button>
      </div>
    );
  }

  if (post.deleted) {
    return (
      <article className="flex items-center gap-3 px-4 py-3" data-testid="post" data-post-id={post.id}>
        <span className="flex w-9 shrink-0 justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--muted)] text-[var(--muted)]">
            <Icon name="trash" className="h-[15px] w-[15px]" strokeWidth={2} />
          </span>
        </span>
        <span className="text-[15px] text-[var(--muted)]">{t("deleted")}</span>
        <time
          className="text-[14px] text-[var(--muted)]"
          dateTime={new Date(post.createdAt * 1000).toISOString()}
        >
          {ago(post.createdAt)}
        </time>
      </article>
    );
  }

  const openThread = () => router.push(`/p/${post.id}`);
  const reply = () => {
    if (onReply) onReply();
    else if (r.canAct) compose.open({ parent: post });
    else openThread();
  };
  const avatar = <Avatar author={post.author} size={big ? 40 : 36} />;

  return (
    <article
      className={`relative flex gap-3 px-4 ${big ? "pt-3.5" : "cursor-pointer pt-3 pb-1"}`}
      data-testid="post"
      data-post-id={post.id}
      onClick={(e) => {
        if (big) return;
        // Sheet (why, menu) render qua portal: click trong đó vẫn nổi bọt tới đây theo cây React.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest("a,button,textarea,input")) return;
        openThread();
      }}
      onKeyDown={(e) => {
        if (!big && e.key === "Enter" && e.target === e.currentTarget) openThread();
      }}
    >
      <div className={`flex shrink-0 flex-col items-center ${big ? "w-10" : "w-9"}`}>
        {href ? (
          <Link href={href} aria-label={displayName(post.author)}>
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        {showThreadLine && <span className="mt-1.5 min-h-3 w-[2px] flex-1 rounded-full bg-[var(--line)]" />}
      </div>
      <div className={`min-w-0 flex-1 ${big ? "pb-1" : ""}`}>
        <header className={`flex items-center gap-[5px] ${big ? "h-10" : "h-[22px]"}`}>
          {href ? (
            <Link
              href={href}
              className={`min-w-0 truncate font-semibold hover:underline ${big ? "text-[16px]" : "text-[15px]"}`}
            >
              {displayName(post.author)}
            </Link>
          ) : (
            <span className={`min-w-0 truncate font-semibold ${big ? "text-[16px]" : "text-[15px]"}`}>
              {displayName(post.author)}
            </span>
          )}
          <Verified count={post.author.contractsDeployed} size={big ? 17 : 16} />
          {handle && (
            <span
              className={`min-w-0 shrink-[2] truncate text-[15px] text-[var(--muted)] ${big ? "" : "hidden sm:inline"}`}
            >
              {handle}
            </span>
          )}
          <time
            className="shrink-0 text-[15px] whitespace-nowrap text-[var(--muted)]"
            dateTime={new Date(post.createdAt * 1000).toISOString()}
          >
            {ago(post.createdAt)}
          </time>
          {!onchain && <FcChip post={post} />}
          {inFeed ? (
            <WhyButton
              reasons={reasons}
              onClick={() => {
                setWhy(true);
                track("why_opened", { reasons: reasons.length });
              }}
            />
          ) : (
            <MoreButton onClick={() => setMenu(true)} className="-my-3 -mr-3 ml-auto" />
          )}
        </header>
        <PostText
          text={post.text}
          className={big ? "mt-0.5 text-[17px] leading-[1.45]" : "mt-0.5 leading-[1.42]"}
        />
        <Embeds urls={post.embeds} />
        {post.channel && (
          <Link
            href={`/c/${post.channel}`}
            className="flex h-10 w-fit items-center text-[14px] font-semibold text-[var(--red-ink)] hover:underline"
          >
            /{post.channel}
          </Link>
        )}
        {onchain ? (
          <div className={`-ml-2.5 flex h-11 items-center ${post.channel ? "" : "mt-0.5"}`}>
            <LikeButton on={r.isLiked} count={r.likeCount} onClick={r.toggleLike} />
            <ActButton
              icon="reply"
              label={t("reply")}
              count={post.stats.replies}
              onClick={reply}
              testId="reply"
            />
            <ActButton
              icon="repost"
              label={t("repost")}
              count={r.repostCount}
              active={r.isReposted}
              onClick={r.toggleRepost}
            />
            <ShareButton path={`/p/${post.id}`} />
            <span className="flex-1" />
            {tx && (
              <a
                href={tx}
                target="_blank"
                rel="noreferrer"
                aria-label={t("explorer")}
                title={t("explorer")}
                className="press -mr-1.5 flex h-11 w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <Arrow />
              </a>
            )}
            {inFeed && <MoreButton onClick={() => setMenu(true)} className="-mr-2" />}
          </div>
        ) : (
          <div
            className={`-ml-2.5 flex h-11 items-center text-[13px] text-[var(--muted)] ${post.channel ? "" : "mt-0.5"}`}
          >
            <span className="flex h-11 items-center gap-1.5 px-2.5">
              <Icon name="heart" className="h-5 w-5" />
              {post.stats.likes > 0 && <span className="tabular-nums">{post.stats.likes}</span>}
            </span>
            <Link
              href={`/p/${post.id}`}
              aria-label={t("reply")}
              title={t("reply")}
              data-testid="reply"
              className="press flex h-11 min-w-11 items-center gap-1.5 px-2.5"
            >
              <Icon name="reply" className="h-5 w-5" />
              {post.stats.replies > 0 && <span className="tabular-nums">{post.stats.replies}</span>}
            </Link>
            <span className="flex h-11 items-center gap-1.5 px-2.5">
              <Icon name="repost" className="h-5 w-5" />
              {post.stats.reposts > 0 && <span className="tabular-nums">{post.stats.reposts}</span>}
            </span>
            <span className="flex-1" />
            {inFeed && <MoreButton onClick={() => setMenu(true)} className="-mr-2" />}
          </div>
        )}
        {!big && post.stats.replies > 0 && (
          <Link
            href={`/p/${post.id}`}
            className="mb-1 flex h-[22px] w-fit items-center text-[13px] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {t("replies", { n: post.stats.replies })}
          </Link>
        )}
      </div>
      {why && reasons && (
        <WhySheet
          post={post}
          reasons={reasons}
          score={score}
          rank={rank}
          total={total}
          origins={origins}
          onClose={() => setWhy(false)}
        />
      )}
      {menu && (
        <PostMenu
          post={post}
          onClose={() => setMenu(false)}
          onReported={big ? undefined : () => setCollapsed(true)}
        />
      )}
    </article>
  );
});

/** Nút "vì sao" 32px: mũi tên lên (ưu tiên) / xuống (giảm) theo rule nặng nhất, không có rule thì sparkle. */
function WhyButton({ reasons, onClick }: { reasons: Reason[]; onClick: () => void }) {
  const t = useTranslations("card");
  const top = reasons.reduce<Reason | null>(
    (a, b) => (!a || Math.abs(b.weight) > Math.abs(a.weight) ? b : a),
    null,
  );
  const kind = !top ? "none" : top.action === "boost" ? "up" : "down";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("why")}
      title={t("why")}
      data-testid="why"
      className="press -my-[11px] -mr-2.5 ml-auto flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full ${
          kind === "up"
            ? "bg-[var(--blush)] text-[var(--red-ink)]"
            : kind === "down"
              ? "bg-[var(--soft)] text-[var(--muted)]"
              : "text-[var(--ink)]"
        }`}
      >
        <Icon
          name={kind === "up" ? "up" : kind === "down" ? "down" : "sparkle"}
          className="h-4 w-4"
          strokeWidth={kind === "none" ? 1.8 : 2.6}
        />
      </span>
    </button>
  );
}
