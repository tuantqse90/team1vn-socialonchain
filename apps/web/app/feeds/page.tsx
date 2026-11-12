"use client";

import type { FeedSpec } from "@socialonchain/feed-sdk";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Empty, Ring, Sheet } from "@/components/bits";
import { feedIcon } from "@/components/builder/ruleIcon";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/kit";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { useFeedCatalog, useMyTabs, useUpdateSettings } from "@/lib/feeds";
import { compact } from "@/lib/format";
import { orbBackground } from "@/lib/orb";
import { useSession } from "@/lib/session";

type Tab = "defaults" | "mine" | "public";
type Row = { id: string; spec: FeedSpec; owner?: string; subscribers?: number };

export default function FeedsPage() {
  const t = useTranslations("feeds");
  const { status, owner, me } = useSession();
  const catalog = useFeedCatalog();
  const [tab, setTab] = useState<Tab>("defaults");
  const list: Row[] =
    tab === "defaults"
      ? ((catalog.data?.defaults ?? []) as Row[])
      : (catalog.data?.[tab] ?? []).map((f) => ({
          id: f.id,
          spec: f.spec,
          owner: f.owner,
          subscribers: f.subscribers,
        }));
  const ready = status === "ready";
  const mineCount = catalog.data?.mine.length ?? me?.entitlements.usage.feeds ?? 0;
  const maxFeeds = me?.entitlements.limits.maxFeeds ?? clientConfig.freeLimits.maxFeeds;
  const full = ready && mineCount >= maxFeeds;
  const counter = t("myFeedsAria", { used: mineCount, limit: maxFeeds });

  return (
    <div>
      <div className="flex items-center gap-1 pl-4 pr-2 pt-3 pb-2">
        <h1 className="flex-1 text-[28px] font-extrabold tracking-[-0.035em]">{t("title")}</h1>
        {ready && (
          <Link
            href="/billing"
            aria-label={counter}
            title={counter}
            className="press mono flex h-11 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold tabular-nums text-[var(--muted)]"
            data-testid="feeds-quota"
          >
            <Ring value={mineCount / Math.max(1, maxFeeds)} danger={full} size={22} stroke={3} />
            {mineCount}/{maxFeeds}
          </Link>
        )}
        {full ? (
          <Link
            href="/billing"
            aria-label={t("fullAria", { n: maxFeeds })}
            title={t("fullAria", { n: maxFeeds })}
            className="press flex h-11 items-center gap-1.5 rounded-full bg-[var(--soft)] pl-3 pr-1.5 text-[14px] font-bold"
            data-testid="new-feed"
          >
            <Icon name="lock" className="h-4 w-4" strokeWidth={2.2} />
            Pro
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <Icon name="chevronr" className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </Link>
        ) : (
          <Link
            href="/feeds/new"
            aria-label={t("new")}
            title={t("new")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
            data-testid="new-feed"
          >
            <Icon name="plus" className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </Link>
        )}
      </div>
      <div className="px-4 pb-2">
        <Segmented<Tab>
          items={[
            { key: "defaults", icon: "layers", label: t("defaults") },
            { key: "mine", icon: "user", label: t("mine") },
            { key: "public", icon: "globe", label: t("public") },
          ]}
          value={tab}
          onChange={setTab}
          testId="feeds-tabs"
        />
      </div>
      {catalog.isPending && (
        <div className="space-y-3 px-4 pt-2">
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-2xl" />
        </div>
      )}
      {catalog.data && list.length === 0 && (
        <Empty icon="layers" text={tab === "mine" && !ready ? "—" : t("new")} />
      )}
      <ul className="stagger px-4 pb-6">
        {list.map((f) => (
          <li key={f.id}>
            <FeedRow
              id={f.id}
              spec={f.spec}
              subscribers={f.subscribers}
              kind={tab}
              mine={Boolean(owner && f.owner === owner.toLowerCase())}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedRow({
  id,
  spec,
  subscribers,
  kind,
  mine,
}: {
  id: string;
  spec: FeedSpec;
  subscribers?: number;
  kind: Tab;
  mine: boolean;
}) {
  const t = useTranslations("feeds");
  const locale = useLocale() as "en" | "vi";
  const { status } = useSession();
  const tabs = useMyTabs();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState(false);
  const inTabs = tabs.includes(id);
  const line = spec.explain?.[locale]?.[0] ?? spec.description ?? null;

  async function toggleTab() {
    const next = inTabs ? tabs.filter((x) => x !== id) : [...tabs, id].slice(0, 20);
    if (next.length === 0) return;
    setPending(true);
    try {
      await update({ feeds: next });
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setMenu(false);
    await api(`/feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (inTabs) await update({ feeds: tabs.filter((x) => x !== id) });
    await qc.invalidateQueries({ queryKey: ["feeds"] });
    await qc.invalidateQueries({ queryKey: ["me"] });
  }

  // Feed của mình: đỏ thương hiệu; còn lại orb gradient theo id (cùng feed, cùng màu ở mọi màn).
  const tileStyle = kind === "mine" ? undefined : { background: orbBackground(`feed:${id}`) };

  return (
    <div
      className="flex items-center gap-3 border-b border-[var(--line)] py-3"
      data-testid="feed-card"
      data-feed-id={id}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] ${
          kind === "mine" ? "compose-glow" : ""
        }`}
        style={tileStyle}
      >
        <Icon name={feedIcon(id, spec)} className="h-6 w-6" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{spec.name}</h3>
        {line && <p className="truncate text-[13px] text-[var(--muted)]">{line}</p>}
        <div className="mono mt-0.5 flex items-center gap-2.5 text-[11.5px] font-semibold text-[var(--muted)]">
          {subscribers !== undefined && (
            <span
              role="img"
              aria-label={t("subscribers", { n: subscribers })}
              title={t("subscribers", { n: subscribers })}
              className="flex items-center gap-1 text-[var(--ink)]"
            >
              <Icon name="user" className="h-3.5 w-3.5" strokeWidth={2.2} />
              {compact(subscribers)}
            </span>
          )}
          {spec.rules.length > 0 && <span>{t("rules", { n: spec.rules.length })}</span>}
        </div>
      </div>
      {status === "ready" && (
        <>
          <button
            type="button"
            onClick={() => void toggleTab()}
            disabled={pending}
            aria-label={inTabs ? t("inTabs") : t("use")}
            aria-pressed={inTabs}
            title={inTabs ? t("inTabs") : t("use")}
            className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              inTabs ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--ink)]"
            }`}
            data-testid="toggle-tab"
          >
            <Icon
              key={String(inTabs)}
              name={inTabs ? "check" : "plus"}
              className="anim-pop h-[18px] w-[18px]"
              strokeWidth={2.4}
            />
          </button>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={t("more")}
            title={t("more")}
            className="press -mr-2 flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)]"
          >
            <Icon name="more" className="h-5 w-5" strokeWidth={2.6} />
          </button>
          <Sheet open={menu} onClose={() => setMenu(false)} title={spec.name}>
            <div className="grid grid-cols-3 gap-2">
              <Link
                href={`/feeds/new?fork=${encodeURIComponent(id)}`}
                className="press flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--soft)] text-[13px] font-semibold"
              >
                <Icon name="copy" className="h-5 w-5" />
                {t("fork")}
              </Link>
              {mine && (
                <Link
                  href={`/feeds/new?edit=${encodeURIComponent(id)}`}
                  className="press flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--soft)] text-[13px] font-semibold"
                >
                  <Icon name="sparkle" className="h-5 w-5" />
                  {t("edit")}
                </Link>
              )}
              {mine && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="press flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--err-tint)] text-[13px] font-semibold text-[var(--err-ink)]"
                >
                  <Icon name="trash" className="h-5 w-5" />
                  {t("delete")}
                </button>
              )}
            </div>
          </Sheet>
        </>
      )}
    </div>
  );
}
