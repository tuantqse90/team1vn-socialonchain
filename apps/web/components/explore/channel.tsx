"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/Icon";
import { Eq } from "@/components/kit";
import type { ChannelStats } from "@/lib/types";

const ICONS: Record<string, IconName> = {
  avalanche: "peak",
  gaming: "gamepad",
  defi: "swap",
  infra: "nodes",
  ai: "sparkle",
  hackathons: "trophy",
  jobs: "briefcase",
  grants: "coin",
};

export function channelIcon(name: string): IconName {
  return ICONS[name] ?? "hash";
}

/** Tên kênh hợp lệ với API (`GET /channels/{name}`, `PUT /me/settings`). */
export const CHANNEL_RE = /^[a-z0-9-]{1,32}$/;

/** Nhịp kênh: bài/giờ (24h gần nhất); quá thưa thì số bài trong 24h, rồi tổng số bài. */
export function useChannelRate() {
  const t = useTranslations("explore");
  return (s: Pick<ChannelStats, "perHour" | "posts24h" | "posts">) => {
    if (s.perHour >= 1) {
      const n = s.perHour >= 10 ? Math.round(s.perHour) : s.perHour;
      return { text: t("rateHour", { n }), aria: t("rateHourAria", { n }) };
    }
    if (s.posts24h > 0)
      return { text: t("rateDay", { n: s.posts24h }), aria: t("rateDayAria", { n: s.posts24h }) };
    return { text: t("rateTotal", { n: s.posts }), aria: t("rateTotal", { n: s.posts }) };
  };
}

/** Thẻ kênh 132×112 trong dải "Sôi động". Thẻ đầu tô đỏ. */
export function ChannelCard({ stats, lead = false }: { stats: ChannelStats; lead?: boolean }) {
  const rate = useChannelRate()(stats);
  return (
    <Link
      href={`/c/${stats.name}`}
      aria-label={`/${stats.name}, ${rate.aria}`}
      data-testid="trending-channel"
      className={`press flex h-28 w-[132px] shrink-0 flex-col justify-between rounded-[22px] p-3.5 ${
        lead ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--soft)] text-[var(--ink)]"
      }`}
    >
      <span className="flex items-start justify-between">
        <Icon name={channelIcon(stats.name)} className="h-[26px] w-[26px]" strokeWidth={1.9} />
        <span className={lead ? "text-[var(--accent-ink)]" : "text-[var(--accent)]"}>
          <Eq className="h-[18px]" />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 break-all text-[16px] font-bold leading-tight tracking-[-0.02em]">
          /{stats.name}
        </span>
        <span
          className={`mono text-[12px] font-semibold ${lead ? "text-[var(--accent-ink)]" : "text-[var(--muted)]"}`}
        >
          {rate.text}
        </span>
      </span>
    </Link>
  );
}
