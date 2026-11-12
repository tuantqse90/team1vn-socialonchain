"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Avatar, Empty, Spinner } from "@/components/bits";
import { AvatarStack } from "@/components/explore/AvatarStack";
import { Mentions, nameOf, plain, useAgo } from "@/components/explore/text";
import { FollowButton } from "@/components/FollowButton";
import { Icon, type IconName } from "@/components/Icon";
import { Verified } from "@/components/kit";
import { PersonRow } from "@/components/PersonRow";
import { api, qs } from "@/lib/api";
import { profileHref } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Notification } from "@/lib/types";

type Filter = "all" | "reply" | "mention" | "follow" | "builder";
const FILTERS: { key: Filter; icon: IconName }[] = [
  { key: "all", icon: "bell" },
  { key: "reply", icon: "reply" },
  { key: "mention", icon: "at" },
  { key: "follow", icon: "userplus" },
  { key: "builder", icon: "verified" },
];
type Page = { unread: number; items: Notification[]; nextBefore: number | null };
type Kind = Exclude<Notification["kind"], "joined">;

/** Thích/đăng lại chỉ hiện ở "Tất cả"; `joined` bỏ hẳn. Builder = người có contract đã deploy. */
function matches(f: Filter, n: Notification): boolean {
  if (n.kind === "joined") return false;
  if (f === "all") return true;
  if (f === "builder") return n.kind !== "like" && n.kind !== "repost" && n.actor.contractsDeployed > 0;
  return n.kind === f;
}

type Row = { type: "one"; n: Notification } | { type: "group"; items: Notification[] };

/** Gộp các thông báo follow liền nhau thành một hàng. */
function groupRows(list: Notification[]): Row[] {
  const out: Row[] = [];
  for (const n of list) {
    const last = out[out.length - 1];
    if (n.kind === "follow" && last) {
      if (last.type === "group") {
        last.items.push(n);
        continue;
      }
      if (last.n.kind === "follow") {
        out[out.length - 1] = { type: "group", items: [last.n, n] };
        continue;
      }
    }
    out.push({ type: "one", n });
  }
  return out;
}

const BADGE: Record<Kind, { icon: IconName; cls: string; filled: boolean }> = {
  reply: { icon: "reply", cls: "bg-[var(--ink)] text-[var(--bg)]", filled: true },
  mention: { icon: "at", cls: "bg-[var(--accent)] text-[var(--accent-ink)]", filled: false },
  like: { icon: "heart", cls: "bg-[var(--accent)] text-[var(--accent-ink)]", filled: true },
  repost: { icon: "repost", cls: "bg-[var(--ink)] text-[var(--bg)]", filled: false },
  follow: { icon: "user", cls: "bg-[var(--ink)] text-[var(--bg)]", filled: true },
};

function KindBadge({ kind }: { kind: Kind }) {
  const b = BADGE[kind];
  return (
    <span
      aria-hidden
      className={`anim-pop absolute -bottom-[5px] -right-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--bg)] ${b.cls}`}
      style={{ animationDelay: "120ms" }}
    >
      <Icon name={b.icon} className="h-[11px] w-[11px]" filled={b.filled} strokeWidth={2.6} />
    </span>
  );
}

function UnreadDot({ on, delay = 0 }: { on: boolean; delay?: number }) {
  return (
    <span
      aria-hidden
      className="absolute left-2 top-8 h-[7px] w-[7px] rounded-full bg-[var(--accent)]"
      style={{ transform: `scale(${on ? 1 : 0})`, transition: `transform .4s var(--bouncy) ${delay}ms` }}
    />
  );
}

/** Mũi tên "trả lời bài này" trước dòng ngữ cảnh. */
function ReturnArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 4v6a4 4 0 0 0 4 4h11M16 10l4 4-4 4" />
    </svg>
  );
}

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const ago = useAgo();
  const { token, status } = useSession();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  // Đã đọc tại chỗ (lạc quan): theo id, và "tất cả tới id X" khi bấm đánh dấu tất cả.
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(() => new Set());
  const [readUpTo, setReadUpTo] = useState(0);
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());

  const q = useInfiniteQuery({
    queryKey: ["notifications", token],
    queryFn: ({ pageParam }) => api<Page>(`/notifications${qs({ before: pageParam })}`),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });

  const items = useMemo(() => {
    const seen = new Set<number>();
    const out: Notification[] = [];
    for (const n of q.data?.pages.flatMap((p) => p.items) ?? []) {
      if (seen.has(n.id) || n.kind === "joined") continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  }, [q.data]);

  const isUnread = (n: Notification) => !n.read && n.id > readUpTo && !readIds.has(n.id);
  const anyUnread = items.some(isUnread);
  const rows = useMemo(() => groupRows(items.filter((n) => matches(filter, n))), [items, filter]);
  const idx = FILTERS.findIndex((f) => f.key === filter);

  /** Đánh dấu đã đọc (không có ids = tất cả), cập nhật badge ở tab bar. */
  function markRead(ids?: number[]) {
    if (ids) {
      const fresh = ids.filter((id) => !readIds.has(id));
      if (fresh.length === 0) return;
      setReadIds((s) => new Set([...s, ...fresh]));
    } else {
      setReadUpTo(items.reduce((m, n) => Math.max(m, n.id), 0));
    }
    void api("/notifications/read", { method: "POST", json: ids ? { ids } : {} })
      .then(() => qc.invalidateQueries({ queryKey: ["unread", token] }))
      .catch(() => undefined);
  }

  function markOne(n: Notification) {
    if (isUnread(n)) markRead([n.id]);
  }

  if (status !== "ready") return <Empty icon="bell" text={t("title")} />;

  return (
    <div>
      <header className="flex h-[52px] items-center justify-between pl-5 pr-2">
        <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-[-0.045em]">{t("title")}</h1>
        <button
          type="button"
          onClick={() => markRead()}
          disabled={!anyUnread}
          aria-label={t("markAll")}
          title={t("markAll")}
          data-testid="notif-mark-all"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] transition-colors disabled:text-[var(--muted)] disabled:opacity-50"
        >
          <Icon name="checks" className="h-6 w-6" strokeWidth={2} />
        </button>
      </header>

      <div
        role="toolbar"
        aria-label={t("filterNav")}
        className="relative mx-4 mt-1 mb-3 flex h-11 items-center gap-2"
      >
        <span
          aria-hidden
          className="absolute left-0 top-0 h-11 w-11 rounded-full bg-[var(--ink)]"
          style={{
            transform: `translateX(${Math.max(0, idx) * 52}px)`,
            transition: "transform .5s var(--bouncy), background-color .3s",
          }}
        />
        {FILTERS.map((f) => {
          const on = f.key === filter;
          const dot = items.some((n) => isUnread(n) && matches(f.key, n));
          return (
            <button
              key={f.key}
              type="button"
              aria-label={t(`f.${f.key}`)}
              aria-pressed={on}
              title={t(`f.${f.key}`)}
              onClick={() => setFilter(f.key)}
              data-testid={`notif-filter-${f.key}`}
              className={`press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                on ? "text-[var(--bg)]" : "text-[var(--ink)]"
              }`}
            >
              {f.key === "builder" ? (
                <span className="inline-flex text-[var(--accent)] [&_svg]:stroke-[var(--bg)]">
                  <Icon name="verified" filled className="h-[22px] w-[22px]" strokeWidth={1.6} />
                </span>
              ) : (
                <Icon name={f.icon} className="h-[22px] w-[22px]" strokeWidth={1.9} />
              )}
              <span
                aria-hidden
                className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-[var(--accent)]"
                style={{
                  transform: `scale(${dot ? 1 : 0})`,
                  boxShadow: `0 0 0 2px ${on ? "var(--ink)" : "var(--bg)"}`,
                  transition: "transform .4s var(--bouncy), box-shadow .3s",
                }}
              />
            </button>
          );
        })}
        <span
          aria-live="polite"
          className="ml-auto flex h-11 items-center whitespace-nowrap text-[14px] font-semibold text-[var(--muted)]"
        >
          <span key={filter} className="anim-rise inline-block">
            {t(`f.${filter}`)}
          </span>
        </span>
      </div>

      {q.isPending && (
        <div className="border-t border-[var(--line)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 py-3.5 pl-[22px] pr-4">
              <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-3 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {q.isSuccess && rows.length === 0 && <Empty icon="bell" text={t("empty")} />}

      <ul key={filter} data-testid="notifications" className="border-t border-[var(--line)]">
        {rows.map((r, i) => {
          const delay = { animationDelay: `${Math.min(i, 6) * 26}ms` };
          if (r.type === "group") {
            const first = r.items[0]!;
            const ids = r.items.map((n) => n.id);
            const isOpen = open.has(first.id);
            const unread = r.items.some(isUnread);
            return (
              <li key={`g${first.id}`} className="anim-drop relative" style={delay}>
                <UnreadDot on={unread} delay={i * 60} />
                <GroupRow
                  items={r.items}
                  open={isOpen}
                  ago={ago(first.createdAt)}
                  onToggle={() => {
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(first.id)) next.delete(first.id);
                      else next.add(first.id);
                      return next;
                    });
                    if (unread) markRead(ids.filter((id) => !readIds.has(id)));
                  }}
                />
              </li>
            );
          }
          const n = r.n;
          return (
            <li key={n.id} className="anim-drop relative" style={delay}>
              <UnreadDot on={isUnread(n)} delay={i * 60} />
              {n.kind === "follow" ? (
                <FollowRow n={n} ago={ago(n.createdAt)} onOpen={() => markOne(n)} />
              ) : (
                <PostRow n={n} ago={ago(n.createdAt)} onOpen={() => markOne(n)} />
              )}
            </li>
          );
        })}
      </ul>

      {q.hasNextPage && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            data-testid="notif-more"
            className="press flex h-11 items-center gap-1.5 rounded-full bg-[var(--soft)] px-5 text-[14px] font-semibold"
          >
            {q.isFetchingNextPage ? <Spinner /> : <Icon name="down" className="h-4 w-4" strokeWidth={2.2} />}
            {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Tên + seal Verified (số contract) + thời gian. */
function NameLine({ n, ago, verb }: { n: Notification; ago: string; verb: string }) {
  return (
    <span className="flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className="truncate text-[15px] font-semibold">{nameOf(n.actor)}</span>
      <span className="sr-only">{verb}</span>
      <Verified count={n.actor.contractsDeployed} size={16} />
      <span className="shrink-0 text-[14px] text-[var(--muted)]">{ago}</span>
    </span>
  );
}

function PostRow({ n, ago, onOpen }: { n: Notification; ago: string; onOpen: () => void }) {
  const t = useTranslations("notifications");
  const kind = n.kind as Kind;
  const verb = {
    reply: t("repliedYou"),
    mention: t("mentionedYou"),
    like: t("likedYours"),
    repost: t("repostedYours"),
    follow: t("followedYou"),
  }[kind];
  const post = n.post;
  const href = post ? `/p/${post.id}` : (profileHref(n.actor) ?? "#");
  const mine = kind === "like" || kind === "repost";
  return (
    <Link
      href={href}
      onClick={onOpen}
      data-testid="notification"
      className="flex gap-3 border-b border-[var(--line)] py-3.5 pl-[22px] pr-4 hover:bg-[var(--soft)]/40"
    >
      <span className="relative h-10 w-10 shrink-0">
        <Avatar author={plain(n.actor)} size={40} />
        <KindBadge kind={kind} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <NameLine n={n} ago={ago} verb={verb} />
        {kind === "reply" && n.parent && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--muted)]">
            <ReturnArrow />
            <span className={`truncate ${n.parent.deleted ? "italic" : ""}`}>
              {n.parent.deleted ? t("deleted") : n.parent.text}
            </span>
          </span>
        )}
        {post &&
          (post.deleted ? (
            <span className="text-[14px] italic text-[var(--muted)]">{t("deleted")}</span>
          ) : mine ? (
            <span className="line-clamp-2 break-words text-[14px] text-[var(--muted)]">{post.text}</span>
          ) : (
            <span className="line-clamp-3 break-words text-[15px] leading-[1.42] [text-wrap:pretty]">
              <Mentions text={post.text} />
            </span>
          ))}
      </span>
    </Link>
  );
}

function FollowRow({ n, ago, onOpen }: { n: Notification; ago: string; onOpen: () => void }) {
  const t = useTranslations("notifications");
  const href = profileHref(n.actor);
  const inner = (
    <>
      <span className="relative h-10 w-10 shrink-0">
        <Avatar author={plain(n.actor)} size={40} />
        <KindBadge kind="follow" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NameLine n={n} ago={ago} verb="" />
        <span className="text-[14px] text-[var(--muted)]">{t("followedYou")}</span>
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] py-3 pl-[22px] pr-3">
      {href ? (
        <Link href={href} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3">
          {inner}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
      )}
      <span className="flex h-11 shrink-0 items-center">
        <FollowButton
          address={n.actor.address}
          following={n.actor.viewerFollows ?? false}
          back
          testId="notif-follow"
        />
      </span>
    </div>
  );
}

/** Nhóm follow: chồng avatar xoè ra khi chạm, kèm danh sách để follow lại từng người. */
function GroupRow({
  items,
  open,
  ago,
  onToggle,
}: {
  items: Notification[];
  open: boolean;
  ago: string;
  onToggle: () => void;
}) {
  const t = useTranslations("notifications");
  const shown = items.slice(0, 4).map((n) => n.actor);
  const step = open ? 40 : 18;
  const span = (k: number) => 32 + k * (shown.length - 1);
  const first = items[0]!;
  return (
    <div className="flex gap-3 border-b border-[var(--line)] pb-3.5 pl-[22px] pr-4 pt-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft)]"
      >
        <Icon name="userplus" className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t("groupShow", { n: items.length })}
          data-testid="notif-group"
          className="relative h-11 max-w-full text-left"
          style={{ width: span(40) + 30 }}
        >
          <span className="absolute left-0 top-1.5">
            <AvatarStack authors={shown} size={32} step={step} width={span(40)} stagger={open ? 40 : 20} />
          </span>
          <span
            aria-hidden
            className="absolute left-0 top-[13px] text-[var(--muted)]"
            style={{
              transform: `translateX(${span(step) + 6}px) rotate(${open ? 180 : 0}deg)`,
              transition: "transform .55s var(--bouncy)",
            }}
          >
            <Icon name="chevronr" className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
        </button>
        <span className="flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="truncate text-[15px] font-semibold">{nameOf(first.actor)}</span>
          <span className="shrink-0 text-[15px] text-[var(--muted)]">
            {t("groupMore", { n: items.length - 1 })}
          </span>
          <span className="shrink-0 text-[14px] text-[var(--muted)]">{ago}</span>
        </span>
        {open && (
          <ul className="anim-grow-y -mx-2 mt-2">
            {items.map((n) => (
              <li key={n.id}>
                <PersonRow author={n.actor} follow back size={36} className="px-2" />
              </li>
            ))}
          </ul>
        )}
      </span>
    </div>
  );
}
