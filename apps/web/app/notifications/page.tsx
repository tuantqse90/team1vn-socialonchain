"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Avatar, Empty } from "@/components/bits";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { displayName, profileHref, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Notification } from "@/lib/types";

const ICON: Record<Notification["kind"], IconName> = {
  follow: "userplus",
  reply: "reply",
  like: "heart",
  repost: "repost",
  mention: "at",
  joined: "arch",
};

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const { token, status } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", token],
    queryFn: () => api<{ unread: number; items: Notification[] }>("/notifications"),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });

  // Đánh dấu đã đọc khi mở trang.
  useEffect(() => {
    if (q.data && q.data.unread > 0) {
      void api("/notifications/read", { method: "POST", json: {} }).then(() =>
        qc.invalidateQueries({ queryKey: ["unread"] }),
      );
    }
  }, [q.data, qc]);

  if (status !== "ready") return <Empty icon="bell" text={t("title")} />;

  return (
    <div>
      <h1 className="px-4 pt-4 pb-2 text-[22px] font-bold tracking-tight">{t("title")}</h1>
      {q.isPending && <div className="skeleton mx-4 h-16 rounded-2xl" />}
      {q.data?.items.length === 0 && <Empty icon="bell" text="—" />}
      <ul data-testid="notifications">
        {q.data?.items.map((n) => {
          const href = n.post ? `/p/${n.post.id}` : (profileHref(n.actor) ?? "#");
          return (
            <li
              key={n.id}
              className={`border-b border-[var(--line)] ${n.read ? "" : "bg-[var(--accent)]/[0.04]"}`}
            >
              <Link href={href} className="flex gap-3 px-4 py-3 hover:bg-[var(--soft)]/50">
                <div className="relative">
                  <Avatar author={n.actor} size={40} />
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--bg)] ${
                      n.kind === "like" ? "bg-[var(--accent)] text-white" : "bg-[var(--ink)] text-[var(--bg)]"
                    }`}
                  >
                    <Icon name={ICON[n.kind]} className="h-2.5 w-2.5" filled={n.kind === "like"} />
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-[14px]">
                  <p>
                    <span className="font-semibold">{displayName(n.actor)}</span>{" "}
                    <span className="text-[var(--muted)]">{t(n.kind)}</span>{" "}
                    <span className="text-[var(--muted)]">· {timeAgo(n.createdAt)}</span>
                  </p>
                  {n.post && !n.post.deleted && (
                    <p className="mt-0.5 line-clamp-2 text-[var(--muted)]">{n.post.text}</p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
