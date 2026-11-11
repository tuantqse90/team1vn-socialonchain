"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Empty } from "@/components/bits";
import { Composer } from "@/components/Compose";
import { PostSkeleton } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { PostCard } from "@/components/PostCard";
import { api, qs } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Post } from "@/lib/types";

export function ThreadView({ id }: { id: string }) {
  const t = useTranslations("post");
  const router = useRouter();
  const { owner, status } = useSession();
  const viewer = owner?.toLowerCase();
  const q = useQuery({
    queryKey: ["thread", id, viewer],
    queryFn: () =>
      api<{ root: Post; replies: Post[] }>(`/threads/${encodeURIComponent(id)}${qs({ viewer })}`),
  });

  const target = q.data
    ? q.data.root.id === id
      ? q.data.root
      : q.data.replies.find((r) => r.id === id)
    : undefined;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--soft)]"
          aria-label="back"
        >
          <Icon name="left" className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">{t("thread")}</span>
      </div>
      {q.isPending && <PostSkeleton />}
      {q.isError && <Empty icon="alert" text="404" />}
      {q.data && (
        <>
          <div className={q.data.root.id === id ? "" : "opacity-80"}>
            <PostCard
              post={q.data.root}
              big={q.data.root.id === id}
              showThreadLine={q.data.replies.length > 0 && q.data.root.id !== id}
            />
          </div>
          {target && status === "ready" && target.source === "onchain" && !target.deleted && (
            <div className="border-y border-[var(--line)] px-4 py-3">
              <Composer parent={target} compact />
            </div>
          )}
          <div className="text-[var(--muted)]">
            {q.data.replies.length > 0 && (
              <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide">
                <Icon name="reply" className="h-3.5 w-3.5" /> {q.data.replies.length}
              </div>
            )}
          </div>
          {q.data.replies.map((r) => (
            <div
              key={r.id}
              className={`border-b border-[var(--line)] ${r.parentId && r.parentId !== q.data.root.id ? "pl-8" : ""} ${r.id === id ? "bg-[var(--soft)]/50" : ""}`}
            >
              <PostCard post={r} big={r.id === id} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
