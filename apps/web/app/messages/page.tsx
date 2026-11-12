"use client";

import { Icon } from "@socialonchain/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, Empty } from "@/components/bits";
import styles from "@/components/dm/dm.module.css";
import { EmojiText } from "@/components/dm/EmojiText";
import { EnableDm } from "@/components/dm/EnableDm";
import { api } from "@/lib/api";
import { type DmThreadItem, useDecrypted, useDmKeys, useDmUnread, usePeerKeys } from "@/lib/dm";
import { displayName, handleOf, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";

type Box = "main" | "requests";

export default function MessagesPage() {
  const t = useTranslations("dm");
  const dm = useDmKeys();
  const [box, setBox] = useState<Box>("main");
  const unread = useDmUnread();

  if (dm.status === "no-session") return <Empty icon="lock" text={t("needsLogin")} />;

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h1 className="text-[22px] font-bold tracking-tight">{t("title")}</h1>
        <Icon name="lock" className="h-4 w-4 text-[var(--muted)]" />
      </div>
      {dm.status === "loading" && <div className="skeleton mx-4 h-16 rounded-2xl" />}
      {(dm.status === "off" || dm.status === "stale") && <EnableDm dm={dm} />}
      {dm.status === "ready" && (
        <>
          <div className="px-4 pb-2">
            <div className="relative grid grid-cols-2 rounded-full bg-[var(--soft)] p-1" role="tablist">
              <span
                aria-hidden
                className={`${styles.slide} absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-[var(--bg)] shadow-sm`}
                style={{ transform: box === "main" ? "translateX(0)" : "translateX(100%)" }}
              />
              {(["main", "requests"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={box === b}
                  onClick={() => setBox(b)}
                  data-testid={`dm-tab-${b}`}
                  className={`press relative z-10 flex h-9 items-center justify-center gap-1.5 text-[14px] font-semibold ${
                    box === b ? "text-[var(--ink)]" : "text-[var(--muted)]"
                  }`}
                >
                  {t(b)}
                  {b === "requests" && (unread.data?.requests ?? 0) > 0 && (
                    <span className="mono flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                      {unread.data?.requests}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <p className="flex items-center justify-center gap-1.5 pb-1 text-[11px] text-[var(--muted)]">
            <Icon name="lock" className="h-3 w-3" />
            {t("e2e")}
          </p>
          <ThreadList key={box} box={box} dm={dm} />
        </>
      )}
    </div>
  );
}

function ThreadList({ box, dm }: { box: Box; dm: ReturnType<typeof useDmKeys> }) {
  const t = useTranslations("dm");
  const { token } = useSession();
  const q = useQuery({
    queryKey: ["dm", "threads", box, token],
    queryFn: () => api<{ items: DmThreadItem[] }>(`/dm/threads?box=${box}`),
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });
  if (q.isPending) return <div className="skeleton mx-4 mt-2 h-16 rounded-2xl" />;
  if (!q.data?.items.length)
    return (
      <Empty
        icon={box === "main" ? "send" : "shield"}
        text={box === "main" ? t("emptyMain") : t("emptyRequests")}
      />
    );
  return (
    <ul data-testid={`dm-list-${box}`}>
      {q.data.items.map((it, i) => (
        <ThreadRow key={it.peer.address} item={it} dm={dm} index={i} />
      ))}
    </ul>
  );
}

function ThreadRow({
  item,
  dm,
  index,
}: {
  item: DmThreadItem;
  dm: ReturnType<typeof useDmKeys>;
  index: number;
}) {
  const t = useTranslations("dm");
  const qc = useQueryClient();
  const { owner } = useSession();
  const me = owner?.toLowerCase();
  const peer = item.peer.address as string;
  const keys = usePeerKeys(peer);
  const plain = useDecrypted(
    item.lastMessage ? [item.lastMessage] : [],
    me,
    dm.keys,
    new Map(keys.data ? [[peer, keys.data.verified]] : []),
  );
  const [leaving, setLeaving] = useState(false);
  const last = item.lastMessage;
  const dec = last ? plain.data?.get(last.id) : undefined;
  const preview =
    dec?.ok && dec.payload.t === "text"
      ? dec.payload.text
      : dec?.ok
        ? dec.payload.t === "react" && dec.payload.emoji
        : null;

  async function setState(state: "accepted" | "declined") {
    setLeaving(true);
    await api(`/dm/threads/${peer}/state`, { method: "POST", json: { state } }).catch(() =>
      setLeaving(false),
    );
    await new Promise((r) => setTimeout(r, 280));
    await qc.invalidateQueries({ queryKey: ["dm"] });
  }

  return (
    <li
      className={`${leaving ? styles.leave : styles.rise} relative border-b border-[var(--line)]`}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      data-testid="dm-thread"
    >
      <Link
        href={`/messages/${peer}`}
        className={`flex gap-3 px-4 py-3 hover:bg-[var(--soft)]/50 ${item.box === "requests" ? "pr-[104px]" : ""}`}
      >
        <Avatar author={item.peer} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px]">
            <span className={`truncate ${item.unread ? "font-bold" : "font-semibold"}`}>
              {displayName(item.peer)}
            </span>
            <span className="truncate text-[13px] text-[var(--muted)]">{handleOf(item.peer)}</span>
            {last && (
              <span className="shrink-0 text-[13px] text-[var(--muted)]">· {timeAgo(last.createdAt)}</span>
            )}
          </div>
          <p
            className={`mt-0.5 truncate text-[14px] ${item.unread ? "font-medium text-[var(--ink)]" : "text-[var(--muted)]"}`}
            data-testid="dm-preview"
          >
            {last?.sender === me && t("you")}
            {preview ? (
              <EmojiText text={preview} />
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <Icon name="lock" className="h-3 w-3" />
                {dec && !dec.ok
                  ? t(
                      dec.reason === "old-key"
                        ? "oldKey"
                        : dec.reason === "unverified"
                          ? "unverified"
                          : "locked",
                    )
                  : t("locked")}
              </span>
            )}
          </p>
          {item.box === "requests" && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {item.peer.contractsDeployed > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 font-medium text-[var(--accent)]">
                  <Icon name="cube" className="h-3 w-3" />
                  {t("contracts", { n: item.peer.contractsDeployed })}
                </span>
              )}
              {item.mutuals > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--soft)] px-2 py-0.5">
                  <Icon name="user" className="h-3 w-3" />
                  {t("mutuals", { n: item.mutuals })}
                </span>
              )}
              {item.followsYou && (
                <span className="rounded-full bg-[var(--soft)] px-2 py-0.5">{t("followsYou")}</span>
              )}
            </div>
          )}
        </div>
        {item.unread && item.box === "main" && (
          <span className="mt-5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
        )}
      </Link>
      {item.box === "requests" && (
        <div className="absolute top-1/2 right-4 flex -translate-y-1/2 gap-2">
          <button
            type="button"
            onClick={() => void setState("declined")}
            aria-label={t("decline")}
            title={t("decline")}
            data-testid="dm-decline"
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--muted)]"
          >
            <Icon name="x" className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => void setState("accepted")}
            aria-label={t("accept")}
            title={t("accept")}
            data-testid="dm-accept"
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
          >
            <Icon name="check" className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
    </li>
  );
}
