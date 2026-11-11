"use client";

import type { FeedSpec } from "@socialonchain/feed-sdk";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Empty } from "@/components/bits";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { useFeedCatalog, useMyTabs, useUpdateSettings } from "@/lib/feeds";
import { useSession } from "@/lib/session";

type Tab = "defaults" | "mine" | "public";
const TABS: { id: Tab; icon: IconName; key: string }[] = [
  { id: "defaults", icon: "layers", key: "defaults" },
  { id: "mine", icon: "user", key: "mine" },
  { id: "public", icon: "globe", key: "public" },
];

export default function FeedsPage() {
  const t = useTranslations("feeds");
  const { status, owner } = useSession();
  const catalog = useFeedCatalog();
  const [tab, setTab] = useState<Tab>("defaults");
  const list: { id: string; spec: FeedSpec; owner?: string }[] =
    tab === "defaults"
      ? (catalog.data?.defaults ?? [])
      : (catalog.data?.[tab] ?? []).map((f) => ({ id: f.id, spec: f.spec, owner: f.owner }));

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-[22px] font-bold tracking-tight">{t("title")}</h1>
        <Link
          href="/feeds/new"
          className="press flex h-9 items-center gap-1.5 rounded-full bg-[var(--ink)] px-3.5 text-sm font-semibold text-[var(--bg)]"
          data-testid="new-feed"
        >
          <Icon name="sparkle" className="h-4 w-4" />
          {t("new")}
        </Link>
      </div>
      <div className="flex gap-1 px-4 pb-3" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium ${
              tab === x.id ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)]"
            }`}
          >
            <Icon name={x.icon} className="h-4 w-4" />
            {t(x.key)}
          </button>
        ))}
      </div>
      {catalog.isPending && <div className="skeleton mx-4 h-24 rounded-3xl" />}
      {catalog.data && list.length === 0 && (
        <Empty icon="layers" text={tab === "mine" && status !== "ready" ? "—" : t("new")} />
      )}
      <ul className="space-y-2 px-4 pb-6">
        {list.map((f) => (
          <li key={f.id}>
            <FeedCard id={f.id} spec={f.spec} mine={Boolean(owner && f.owner === owner.toLowerCase())} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedCard({ id, spec, mine }: { id: string; spec: FeedSpec; mine: boolean }) {
  const t = useTranslations("feeds");
  const locale = useLocale() as "en" | "vi";
  const { status } = useSession();
  const tabs = useMyTabs();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const inTabs = tabs.includes(id);
  const lines = spec.explain?.[locale] ?? (spec.description ? [spec.description] : []);

  async function toggleTab() {
    const next = inTabs ? tabs.filter((x) => x !== id) : [...tabs, id].slice(0, 20);
    if (next.length === 0) return;
    await update({ feeds: next });
  }
  async function remove() {
    await api(`/feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (inTabs) await update({ feeds: tabs.filter((x) => x !== id) });
    await qc.invalidateQueries({ queryKey: ["feeds"] });
  }

  return (
    <div className="rounded-3xl bg-[var(--soft)] p-4" data-testid="feed-card" data-feed-id={id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{spec.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {lines.slice(0, 4).map((l) => (
              <span
                key={l}
                className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[12px] text-[var(--muted)]"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
        <span className="mono shrink-0 text-[11px] text-[var(--muted)]">
          {t("rules", { n: spec.rules.length })}
        </span>
      </div>
      {status === "ready" && (
        <div className="mt-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleTab()}
            className={`press flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${
              inTabs ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--bg)]"
            }`}
            data-testid="toggle-tab"
          >
            <Icon name={inTabs ? "check" : "plus"} className="h-3.5 w-3.5" />
            {inTabs ? t("inTabs") : t("use")}
          </button>
          <span className="flex-1" />
          <Link
            href={`/feeds/new?fork=${encodeURIComponent(id)}`}
            className="press flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg)]"
            aria-label={t("fork")}
            title={t("fork")}
          >
            <Icon name="copy" className="h-4 w-4" />
          </Link>
          {mine && (
            <>
              <Link
                href={`/feeds/new?edit=${encodeURIComponent(id)}`}
                className="press flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg)]"
                aria-label={t("edit")}
                title={t("edit")}
              >
                <Icon name="sparkle" className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => void remove()}
                className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--bg)]"
                aria-label={t("delete")}
                title={t("delete")}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
