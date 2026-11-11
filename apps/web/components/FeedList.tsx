"use client";

import type { Reason } from "@socialonchain/feed-sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Post } from "@/lib/types";
import { Button, Empty } from "./bits";
import { Icon } from "./Icon";
import { PostCard } from "./PostCard";

export type Row = { post: Post; reasons?: Reason[] };
export type RowPage = { rows: Row[]; nextCursor: number | null; hidden?: number };

export function PostSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="skeleton h-[38px] w-[38px] shrink-0 rounded-full" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

/** Danh sách bài cuộn vô hạn, ảo hoá theo window (TanStack Virtual). */
export function FeedList({
  queryKey,
  fetchPage,
  emptyText,
  header,
}: {
  queryKey: readonly unknown[];
  fetchPage: (cursor: number | null) => Promise<RowPage>;
  emptyText?: string;
  header?: React.ReactNode;
}) {
  const t = useTranslations("common");
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  // Vị trí danh sách trong trang (header phía trên có thể đổi chiều cao).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
    if (top !== margin) setMargin(top);
  });

  const v = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 132,
    overscan: 6,
    scrollMargin: margin,
    getItemKey: (i) => rows[i]?.post.id ?? i,
  });
  const items = v.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? -1;

  useEffect(() => {
    if (lastIndex >= rows.length - 4 && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [lastIndex, rows.length, q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  return (
    <div>
      {header}
      {q.isPending && (
        <div>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}
      {q.isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-[var(--muted)]">
          <Icon name="alert" className="h-7 w-7" />
          {t("error")}
          <Button variant="outline" onClick={() => void q.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {q.isSuccess && rows.length === 0 && <Empty text={emptyText ?? t("empty")} />}
      <div ref={listRef} style={{ height: v.getTotalSize(), position: "relative" }} data-testid="feed">
        {items.map((it) => {
          const row = rows[it.index];
          if (!row) return null;
          return (
            <div
              key={it.key}
              data-index={it.index}
              ref={v.measureElement}
              className="absolute left-0 top-0 w-full border-b border-[var(--line)]"
              style={{ transform: `translateY(${it.start - v.options.scrollMargin}px)` }}
            >
              <PostCard post={row.post} reasons={row.reasons} />
            </div>
          );
        })}
      </div>
      {q.isFetchingNextPage && <PostSkeleton />}
    </div>
  );
}
