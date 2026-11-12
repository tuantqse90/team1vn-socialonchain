"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { SessionChip } from "@/components/AppShell";
import { Avatar, Empty } from "@/components/bits";
import { PostSkeleton } from "@/components/FeedList";
import { Arrow, FcChip, LikeButton, MoreButton, useReactions } from "@/components/feed/actions";
import { PostMenu } from "@/components/feed/PostMenu";
import { ReplyBar } from "@/components/feed/ReplyBar";
import { fcUrl, useAgo } from "@/components/feed/util";
import { Icon } from "@/components/Icon";
import { Verified } from "@/components/kit";
import { PostCard } from "@/components/PostCard";
import { PostText } from "@/components/PostText";
import { api, qs } from "@/lib/api";
import { displayName, profileHref } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Post } from "@/lib/types";

type Thread = { root: Post; replies: Post[] };
type Row = { post: Post; depth: 0 | 1 };

/** Thứ tự đọc: mỗi trả lời nằm ngay dưới bài cha (DFS theo thời gian), thụt 1 bậc cho trả lời lồng. */
function order(data: Thread): Row[] {
  const kids = new Map<string, Post[]>();
  const ids = new Set(data.replies.map((r) => r.id));
  for (const r of data.replies) {
    const parent = r.parentId && ids.has(r.parentId) ? r.parentId : data.root.id;
    const list = kids.get(parent) ?? [];
    list.push(r);
    kids.set(parent, list);
  }
  const out: Row[] = [];
  const walk = (id: string, depth: number) => {
    for (const r of (kids.get(id) ?? []).sort((a, b) => a.createdAt - b.createdAt)) {
      out.push({ post: r, depth: depth > 0 ? 1 : 0 });
      walk(r.id, depth + 1);
    }
  };
  walk(data.root.id, 0);
  return out;
}

export function ThreadView({ id }: { id: string }) {
  const t = useTranslations("thread");
  const router = useRouter();
  const { owner } = useSession();
  const viewer = owner?.toLowerCase();
  const q = useQuery({
    queryKey: ["thread", id, viewer],
    queryFn: () => api<Thread>(`/threads/${encodeURIComponent(id)}${qs({ viewer })}`),
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<Post | null>(null);
  // Id trả lời có từ lần tải đầu: trả lời mới (vừa gửi) không nằm trong đây thì "rơi" vào (anim-drop).
  const [initial, setInitial] = useState<Set<string> | null>(null);
  const justSent = useRef(false);
  const [sentTick, setSentTick] = useState(0);

  const data = q.data;
  useEffect(() => {
    if (data && !initial) setInitial(new Set(data.replies.map((r) => r.id)));
  }, [data, initial]);
  const rows = useMemo(() => (data ? order(data) : []), [data]);

  const lower = id.toLowerCase();
  const focused = data
    ? data.root.id === lower
      ? data.root
      : (data.replies.find((r) => r.id === lower) ?? data.root)
    : null;
  const target =
    replyTo ?? (focused && !focused.deleted && focused.source === "onchain" ? focused : (data?.root ?? null));

  // Mở link tới 1 trả lời: cuộn tới nó (1 lần).
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current) return;
    scrolled.current = true;
    if (data.root.id === lower) return;
    document
      .querySelector<HTMLElement>(`[data-post-id="${CSS.escape(lower)}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [data, lower]);

  // Vừa gửi xong: cuộn tới trả lời mới nhất của mình (dữ liệu có thể đã làm mới trước khi tx trả về).
  // biome-ignore lint/correctness/useExhaustiveDependencies: sentTick chỉ để kích hoạt lại sau khi gửi
  useEffect(() => {
    if (!justSent.current || !data || !initial || !owner) return;
    const mine = data.replies.filter((r) => !initial.has(r.id) && r.author.address === owner.toLowerCase());
    const last = mine[mine.length - 1];
    if (!last) return;
    justSent.current = false;
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-post-id="${CSS.escape(last.id)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, [data, initial, owner, sentTick]);

  const focusReply = (p?: Post) => {
    if (p) setReplyTo(p);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-dvh flex-col md:min-h-[calc(100dvh_-_3.5rem)]">
      <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between px-1.5 md:top-14 md:z-20">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="press relative z-10 flex h-11 w-11 items-center justify-center"
          aria-label={t("back")}
          title={t("back")}
        >
          <Icon name="left" className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 text-center text-[17px] font-bold tracking-tight">
          {t("title")}
        </h1>
        <span className="relative z-10 pr-1 md:hidden">
          <SessionChip />
        </span>
      </header>

      <div className="flex-1 border-t border-[var(--line)]">
        {q.isPending && <PostSkeleton />}
        {q.isError && <Empty icon="alert" text="404" />}
        {data && (
          <>
            <PostCard
              post={data.root}
              big
              showThreadLine={rows.length > 0}
              onReply={() => focusReply(data.root)}
            />
            <div className="px-4 pb-7">
              {rows.map((r, i) => (
                <ReplyRow
                  key={r.post.id}
                  post={r.post}
                  depth={r.depth}
                  last={i === rows.length - 1}
                  focused={r.post.id === lower && data.root.id !== lower}
                  fresh={Boolean(initial && !initial.has(r.post.id))}
                  hidden={hidden.has(r.post.id)}
                  onUndo={() =>
                    setHidden((s) => {
                      const n = new Set(s);
                      n.delete(r.post.id);
                      return n;
                    })
                  }
                  onReply={() => focusReply(r.post)}
                  onMore={() => setMenuFor(r.post)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {data &&
        target &&
        !target.deleted &&
        (data.root.source === "farcaster" ? (
          <FcFooter post={data.root} />
        ) : (
          <ReplyBar
            root={data.root}
            target={target}
            inputRef={inputRef}
            onSent={() => {
              justSent.current = true;
              setSentTick((n) => n + 1);
              setReplyTo(null);
            }}
          />
        ))}

      {menuFor && (
        <PostMenu
          post={menuFor}
          onClose={() => setMenuFor(null)}
          onReported={() => setHidden((s) => new Set(s).add(menuFor.id))}
        />
      )}
    </div>
  );
}

/** Một trả lời: cột trái có đoạn nối 10px phía trên avatar 32px và đuôi nối xuống trả lời kế tiếp. */
function ReplyRow({
  post,
  depth,
  last,
  focused,
  fresh,
  hidden,
  onUndo,
  onReply,
  onMore,
}: {
  post: Post;
  depth: 0 | 1;
  last: boolean;
  focused: boolean;
  fresh: boolean;
  hidden: boolean;
  onUndo: () => void;
  onReply: () => void;
  onMore: () => void;
}) {
  const t = useTranslations("card");
  const ago = useAgo();
  const r = useReactions(post);
  const href = profileHref(post.author);
  const onchain = post.source === "onchain";
  const dead = post.deleted;

  return (
    <article
      data-testid="post"
      data-post-id={post.id}
      className={`flex gap-3 rounded-2xl ${depth ? "pl-7" : ""} ${fresh ? "anim-drop" : ""} ${focused ? "bg-[var(--soft)]" : ""}`}
    >
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className="h-2.5 w-[2px] bg-[var(--line)]" />
        {dead ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--muted)] text-[var(--muted)]">
            <Icon name="trash" className="h-[15px] w-[15px]" strokeWidth={2} />
          </span>
        ) : hidden ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--muted)]">
            <Icon name="eyeoff" className="h-4 w-4" strokeWidth={2} />
          </span>
        ) : href ? (
          <Link href={href} aria-label={displayName(post.author)}>
            <Avatar author={post.author} size={32} />
          </Link>
        ) : (
          <Avatar author={post.author} size={32} />
        )}
        <span
          className={`mt-1 min-h-2 w-[2px] flex-1 rounded-full ${last ? "bg-transparent" : "bg-[var(--line)]"}`}
        />
      </div>
      <div className="min-w-0 flex-1 pt-2.5 pb-1.5">
        {dead ? (
          <div className="flex h-8 items-center gap-2 pb-3.5 text-[15px] text-[var(--muted)]">
            {t("deleted")}
            <span className="text-[14px]">{ago(post.createdAt)}</span>
          </div>
        ) : hidden ? (
          <div className="flex h-8 items-center gap-1 pb-3.5 text-[15px] text-[var(--muted)]">
            {t("hidden")}
            <button
              type="button"
              onClick={onUndo}
              className="press h-11 px-2 text-[15px] font-semibold text-[var(--ink)]"
            >
              {t("undo")}
            </button>
          </div>
        ) : (
          <>
            <header className="flex h-8 items-center gap-[5px]">
              {href ? (
                <Link href={href} className="min-w-0 truncate text-[15px] font-semibold hover:underline">
                  {displayName(post.author)}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-[15px] font-semibold">{displayName(post.author)}</span>
              )}
              <Verified count={post.author.contractsDeployed} size={15} />
              <time
                className="shrink-0 text-[14px] whitespace-nowrap text-[var(--muted)]"
                dateTime={new Date(post.createdAt * 1000).toISOString()}
              >
                {ago(post.createdAt)}
              </time>
              {!onchain && <FcChip post={post} iconOnly />}
              <MoreButton onClick={onMore} className="-my-1.5 -mr-3 ml-auto" />
            </header>
            <PostText text={post.text} className="leading-[1.42]" />
            {onchain ? (
              <div className="-ml-2.5 flex h-10 items-center">
                <LikeButton on={r.isLiked} count={r.likeCount} onClick={r.toggleLike} small />
                <button
                  type="button"
                  onClick={onReply}
                  aria-label={t("reply")}
                  title={t("reply")}
                  data-testid="reply"
                  className="press flex h-11 min-w-11 items-center justify-center px-2.5 text-[var(--ink)]"
                >
                  <Icon name="reply" className="h-[18px] w-[18px]" />
                </button>
              </div>
            ) : (
              <div className="flex h-10 items-center gap-1.5 text-[13px] text-[var(--muted)]">
                <Icon name="heart" className="h-[18px] w-[18px]" />
                {post.stats.likes > 0 && <span className="tabular-nums">{post.stats.likes}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/** Thread Farcaster: chỉ đọc, mở bài gốc trên Farcaster. */
function FcFooter({ post }: { post: Post }) {
  const t = useTranslations("thread");
  const url = fcUrl(post);
  return (
    <div className="sticky bottom-0 z-20 flex items-center gap-2.5 border-t border-[var(--line)] bg-[var(--bg)] pt-2 pr-3 pb-[max(8px,env(safe-area-inset-bottom))] pl-4">
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--muted)]">
        <Icon name="eye" className="h-[18px] w-[18px]" strokeWidth={2} />
        {t("readOnly")}
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="press ml-auto flex h-12 items-center gap-2 rounded-full bg-[var(--ink)] pr-[18px] pl-4 text-[15px] font-semibold text-[var(--bg)]"
        >
          <Icon name="arch" className="h-[18px] w-[18px]" strokeWidth={2.2} />
          {t("openFc")}
          <Arrow className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
