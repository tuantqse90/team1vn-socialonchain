"use client";

import type { FeedSpec } from "@socialonchain/feed-sdk";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Empty } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { api, qs } from "@/lib/api";
import { useMyTabs, useUpdateSettings } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { SavedFeed } from "@/lib/types";

/** Feed công khai của một địa chỉ (miễn phí, offchain). Dùng chung cho tab Feed và trường FEED trên thẻ. */
export function useAuthorFeeds(address: string | null | undefined) {
  return useQuery({
    queryKey: ["feeds-by", address],
    queryFn: () =>
      api<{ public: SavedFeed[] }>(`/feeds${qs({ author: address ?? undefined })}`).then((r) => r.public),
    enabled: Boolean(address),
  });
}

/** Ô biểu tượng feed: lưới 2×2 (2 ô xám, 2 ô accent). */
function FeedTile() {
  return (
    <span
      aria-hidden
      className="grid h-11 w-11 shrink-0 grid-cols-2 gap-1 rounded-xl bg-[var(--ink)] p-[7px]"
    >
      <span className="rounded bg-[var(--muted)]" />
      <span className="rounded bg-[var(--muted)]" />
      <span className="rounded bg-[var(--accent)]" />
      <span className="rounded bg-[var(--accent)]" />
    </span>
  );
}

function FeedRow({ feed }: { feed: SavedFeed }) {
  const t = useTranslations("profile");
  const { status } = useSession();
  const tabs = useMyTabs();
  const update = useUpdateSettings();
  const [busy, setBusy] = useState(false);
  const inTabs = tabs.includes(feed.id);
  const spec = feed.spec as FeedSpec;

  async function toggleTab() {
    const next = inTabs ? tabs.filter((x) => x !== feed.id) : [...tabs, feed.id].slice(0, 20);
    if (next.length === 0) return;
    setBusy(true);
    try {
      await update({ feeds: next });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3" data-testid="profile-feed">
      <FeedTile />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-bold leading-snug">{feed.name}</p>
        <p className="mono mt-0.5 flex items-center gap-2 text-[12px] text-[var(--muted)]">
          <span>{t("rules", { n: spec.rules.length })}</span>
          <span className="flex items-center gap-1" title={t("subscribers", { n: feed.subscribers ?? 0 })}>
            <Icon name="user" className="h-3.5 w-3.5" />
            {feed.subscribers ?? 0}
          </span>
        </p>
      </div>
      {status === "ready" && (
        <button
          type="button"
          onClick={() => void toggleTab()}
          disabled={busy}
          aria-pressed={inTabs}
          aria-label={inTabs ? t("inTabs") : t("useTab")}
          title={inTabs ? t("inTabs") : t("useTab")}
          className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
            inTabs ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)]"
          }`}
        >
          {busy ? (
            <span className="spinner" aria-hidden />
          ) : (
            <Icon
              key={String(inTabs)}
              name={inTabs ? "check" : "plus"}
              className="anim-pop h-5 w-5"
              strokeWidth={2.4}
            />
          )}
        </button>
      )}
      <Link
        href={`/feeds/new?fork=${encodeURIComponent(feed.id)}`}
        aria-label={t("fork")}
        title={t("fork")}
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <Icon name="copy" className="h-5 w-5" />
      </Link>
    </li>
  );
}

/** Tab "Feed" trên profile: feed công khai của người này. Miễn phí: không giá, không trả tiền để dùng. */
export function ProfileFeeds({ address }: { address: string }) {
  const t = useTranslations("profile");
  const q = useAuthorFeeds(address);
  if (q.isPending)
    return (
      <div className="space-y-3 p-4">
        <div className="skeleton h-11 w-full rounded-xl" />
        <div className="skeleton h-11 w-2/3 rounded-xl" />
      </div>
    );
  const items = q.data ?? [];
  if (items.length === 0) return <Empty icon="layers" text={t("noFeeds")} />;
  return (
    <ul className="stagger divide-y divide-[var(--line)]">
      {items.map((f) => (
        <FeedRow key={f.id} feed={f} />
      ))}
    </ul>
  );
}
