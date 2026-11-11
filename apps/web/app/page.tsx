"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/bits";
import { Composer } from "@/components/Compose";
import { FeedList, type RowPage } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { clientConfig } from "@/configs";
import { api, qs, track } from "@/lib/api";
import { useFeedCatalog, useMyModeration, useMyTabs } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { FeedPage } from "@/lib/types";

const TAB_KEY = "soc:tab";

export default function Home() {
  const t = useTranslations("feeds");
  const locale = useLocale() as "en" | "vi";
  const { owner, status, token } = useSession();
  const tabs = useMyTabs();
  const moderation = useMyModeration();
  const catalog = useFeedCatalog();
  const [active, setActive] = useState<string | null>(null);
  const [explain, setExplain] = useState<string[] | null>(null);
  const [showExplain, setShowExplain] = useState(false);

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
  const tabBar = useRef<HTMLDivElement>(null);

  // Tab đang chọn luôn nằm trong khung nhìn (ví dụ feed vừa tạo ở cuối danh sách).
  useEffect(() => {
    tabBar.current
      ?.querySelector<HTMLElement>(`[data-testid="tab-${CSS.escape(feedId)}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [feedId]);
  const viewer = owner?.toLowerCase();

  useEffect(() => {
    track("feed_view", { feedId });
  }, [feedId]);

  const select = (id: string) => {
    setActive(id);
    setShowExplain(false);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // bỏ qua
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      {status === "ready" && (
        <div className="border-b border-[var(--line)] px-4 py-3">
          <Composer compact />
        </div>
      )}
      {status === "disconnected" && (
        <div className="border-b border-[var(--line)] px-4 py-5">
          <p className="text-[22px] font-semibold leading-tight tracking-tight">
            {clientConfig.tagline[locale]}
          </p>
        </div>
      )}
      <div className="glass sticky top-14 z-20 border-b border-[var(--line)]">
        <div
          ref={tabBar}
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2.5"
          role="tablist"
        >
          {tabs.map((id) => (
            <Chip key={id} active={id === feedId} onClick={() => select(id)} testId={`tab-${id}`}>
              {catalog.names.get(id) ?? id.replace(/^default:/, "")}
            </Chip>
          ))}
          <Link
            href="/feeds/new"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--ink)]"
            aria-label={t("new")}
            title={t("new")}
            data-testid="tab-new"
          >
            <Icon name="sparkle" className="h-4 w-4" />
          </Link>
          {explain && explain.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExplain((v) => !v)}
              className={`press ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${showExplain ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--muted)]"}`}
              aria-label="explain"
            >
              <Icon name="filter" className="h-4 w-4" />
            </button>
          )}
        </div>
        {showExplain && explain && (
          <ul className="flex flex-wrap gap-1.5 px-4 pb-3 text-[12px] text-[var(--muted)]">
            {explain.map((e) => (
              <li key={e} className="rounded-full border border-[var(--line)] px-2.5 py-0.5">
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FeedList
        queryKey={["feed", feedId, viewer, token ? "auth" : "anon", moderation.join(",")]}
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
          if (cursor === null) setExplain(r.spec.explain?.[locale] ?? null);
          return {
            rows: r.items.map((i) => ({ post: i.post, reasons: i.reasons })),
            nextCursor: r.nextCursor,
            hidden: r.hidden,
          } satisfies RowPage;
        }}
      />
    </div>
  );
}
