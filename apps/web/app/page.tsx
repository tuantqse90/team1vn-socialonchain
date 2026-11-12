"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/bits";
import { useCompose } from "@/components/Compose";
import { FeedList, type FeedMeta, type RowPage } from "@/components/FeedList";
import { FeedStrip } from "@/components/feed/FeedStrip";
import { meAuthor } from "@/components/feed/util";
import { clientConfig } from "@/configs";
import { api, qs, track } from "@/lib/api";
import { useFeedCatalog, useMyModeration, useMyTabs } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { FeedPage } from "@/lib/types";

const TAB_KEY = "soc:tab";

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale() as "en" | "vi";
  const { owner, status, token, me } = useSession();
  const compose = useCompose();
  const tabs = useMyTabs();
  const moderation = useMyModeration();
  const catalog = useFeedCatalog();
  const [active, setActive] = useState<string | null>(null);
  const [meta, setMeta] = useState<FeedMeta>({ hidden: null, total: null });

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TAB_KEY);
    } catch {
      saved = null;
    }
    setActive((cur) => cur ?? (saved && tabs.includes(saved) ? saved : (tabs[0] ?? "default:chronological")));
  }, [tabs]);

  const feedId = active && tabs.includes(active) ? active : (tabs[0] ?? "default:chronological");
  const viewer = owner?.toLowerCase();

  useEffect(() => {
    track("feed_view", { feedId });
  }, [feedId]);

  const select = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // bỏ qua
    }
    window.scrollTo({ top: 0 });
  };
  const onMeta = useCallback((m: FeedMeta) => setMeta(m), []);

  return (
    <div>
      {status === "disconnected" && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-[22px] font-semibold leading-tight tracking-tight">
            {clientConfig.tagline[locale]}
          </p>
        </div>
      )}
      <FeedStrip tabs={tabs} active={feedId} names={catalog.names} hidden={meta.hidden} onSelect={select} />
      {status !== "disconnected" && status !== "loading" && (
        <button
          type="button"
          onClick={() => compose.open()}
          data-testid="whats-new"
          className="flex h-16 w-full items-center gap-3 border-y border-[var(--line)] px-4 text-left text-[15px] text-[var(--muted)]"
        >
          <Avatar author={meAuthor(owner, me)} size={36} />
          <span className="flex-1">{t("whatsNew")}</span>
        </button>
      )}
      <div
        className={status !== "disconnected" && status !== "loading" ? "" : "border-t border-[var(--line)]"}
      >
        <FeedList
          queryKey={["feed", feedId, viewer, token ? "auth" : "anon", moderation.join(",")]}
          onMeta={onMeta}
          fetchPage={async (cursor) => {
            const r = await api<FeedPage>(
              `/feed${qs({
                feedId,
                viewer,
                cursor,
                limit: 20,
                moderation: token ? undefined : moderation.join(","),
              })}`,
            );
            return {
              rows: r.items.map((i) => ({
                post: i.post,
                reasons: i.reasons,
                score: i.score,
                origins: i.origins,
              })),
              nextCursor: r.nextCursor,
              hidden: r.hidden,
              total: r.total,
            } satisfies RowPage;
          }}
        />
      </div>
    </div>
  );
}
