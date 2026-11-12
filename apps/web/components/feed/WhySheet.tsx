"use client";

import {
  type Condition,
  DEFAULT_FEEDS,
  type FeedSpec,
  LABELS,
  MODERATION_STACKS,
  type Reason,
} from "@socialonchain/feed-sdk";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useFeedCatalog } from "@/lib/feeds";
import { displayName } from "@/lib/format";
import type { Post } from "@/lib/types";
import { Avatar, Sheet } from "../bits";
import { Icon, type IconName } from "../Icon";
import { useAgo } from "./util";

/** Icon theo nhãn/tín hiệu đầu tiên trong điều kiện của rule. */
const KEY_ICON: Record<string, IconName> = {
  onchain_builder: "verified",
  conversation: "chat",
  recency: "clock",
  reactions: "heart",
  reply_count: "reply",
  distinct_repliers: "reply",
  mutual_follow: "userplus",
  graph_distance: "nodes",
  author_post_rate: "pulse",
  "topic:avalanche": "peak",
  "topic:infra": "layers",
  "topic:defi": "coin",
  "topic:gaming": "gamepad",
  "topic:ai": "sparkle",
  "topic:grants_hackathons": "trophy",
  "topic:jobs": "briefcase",
  "topic:crypto_market": "bars",
  "topic:politics": "megaphone",
  "topic:personal_life": "user",
  "quality:substantive": "book",
  "quality:engagement_bait": "flame",
  "quality:shill": "megaphone",
  "quality:low_effort": "minus",
  "tone:toxic": "toxic",
  "spam:manipulation": "alert",
  "author:founder": "briefcase",
  "author:builder": "cube",
  "author:new_account": "userplus",
  "safety:illegal": "shield",
  "safety:nsfw": "eyeoff",
  "safety:doxxing": "idcard",
  "lang:vi": "globe",
  "lang:en": "globe",
};

function firstKey(c: Condition): string | null {
  if ("label" in c) return c.label;
  if ("signal" in c) return c.signal;
  if ("not" in c) return firstKey(c.not);
  const list = "all" in c ? c.all : c.any;
  for (const x of list) {
    const k = firstKey(x);
    if (k) return k;
  }
  return null;
}

/** Nguồn chính đưa bài vào feed (theo thứ tự ưu tiên). */
const ORIGIN_ORDER = ["following", "self", "replies_in_my_threads", "farcaster:following", "two_hop"];

function pickOrigin(origins: string[]): string | null {
  for (const o of ORIGIN_ORDER) if (origins.includes(o)) return o;
  return (
    origins.find((o) => o.startsWith("channel:")) ??
    origins.find((o) => o.startsWith("farcaster:channel:")) ??
    origins[0] ??
    null
  );
}

type Row = {
  key: string;
  icon: IconName;
  label: string;
  v: number;
  kind: "rec" | "up" | "down";
  mod: boolean;
};

/**
 * "Vì sao bạn thấy bài này": điểm lớn + hạng, mỗi rule một hàng (icon, thanh trượt, trọng số có dấu),
 * hàng đầu là độ mới (= điểm − tổng trọng số rule), chân là nguồn + nhãn có chữ ký.
 */
export function WhySheet({
  post,
  reasons,
  score,
  rank,
  total,
  origins,
  onClose,
}: {
  post: Post;
  reasons: Reason[];
  score?: number;
  rank?: number;
  total?: number;
  origins?: string[];
  onClose: () => void;
}) {
  const t = useTranslations("whySheet");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "vi";
  const ago = useAgo();
  const catalog = useFeedCatalog();

  const specs = useMemo(() => {
    const m = new Map<string, FeedSpec>();
    for (const s of [...Object.values(DEFAULT_FEEDS), ...Object.values(MODERATION_STACKS)]) m.set(s.name, s);
    for (const f of [...(catalog.data?.defaults ?? []), ...(catalog.data?.moderation ?? [])])
      m.set(f.spec.name, f.spec);
    for (const f of [...(catalog.data?.public ?? []), ...(catalog.data?.mine ?? [])])
      m.set(f.spec.name, f.spec);
    return m;
  }, [catalog.data]);

  const rows: Row[] = [];
  const signed = reasons.reduce((s, r) => s + (r.action === "boost" ? r.weight : -r.weight), 0);
  if (score !== undefined) {
    rows.push({
      key: "rec",
      icon: "clock",
      label: t("fresh", { age: ago(post.createdAt) }),
      v: Math.max(0, score - signed),
      kind: "rec",
      mod: false,
    });
  }
  for (const r of reasons) {
    const rule = specs.get(r.specName)?.rules[r.ruleIndex];
    const key = rule ? firstKey(rule.when) : null;
    const builder = key === "onchain_builder" && post.author.contractsDeployed > 0;
    rows.push({
      key: `${r.origin}-${r.specName}-${r.ruleIndex}`,
      icon: (key && KEY_ICON[key]) || (r.action === "boost" ? "up" : "down"),
      label: builder ? tc("verifiedBuilder", { n: post.author.contractsDeployed }) : r.text[locale],
      v: r.action === "boost" ? r.weight : -r.weight,
      kind: r.action === "boost" ? "up" : "down",
      mod: r.origin === "moderation",
    });
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));

  const origin = pickOrigin(origins ?? []);
  const src: { icon: IconName; text: string } | null = !origin
    ? null
    : origin === "following"
      ? { icon: "user", text: t("srcFollowing") }
      : origin === "self"
        ? { icon: "user", text: t("srcSelf") }
        : origin === "replies_in_my_threads"
          ? { icon: "reply", text: t("srcMyThreads") }
          : origin === "two_hop"
            ? { icon: "nodes", text: t("srcTwoHop") }
            : origin === "farcaster:following"
              ? { icon: "arch", text: t("srcFcFollowing") }
              : origin.startsWith("farcaster:channel:")
                ? { icon: "arch", text: t("srcFcChannel", { name: origin.slice(18) }) }
                : origin.startsWith("channel:")
                  ? { icon: "hash", text: t("srcChannel", { name: origin.slice(8) }) }
                  : { icon: "globe", text: t("srcAll") };

  const labels = Object.entries(post.labels)
    .filter(([, s]) => s >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <Sheet open onClose={onClose} label={t("title")}>
      <div data-testid="why-sheet" className="flex flex-col gap-[18px]">
        <div className="flex items-center gap-2.5">
          <Avatar author={post.author} size={36} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {displayName(post.author)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--soft)]"
          >
            <Icon name="x" className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>

        {score !== undefined && (
          <div className="anim-rise flex items-end gap-2.5">
            <span
              className="text-[56px] font-extrabold leading-[.9] tracking-[-0.05em] tabular-nums"
              title={t("score")}
            >
              {score.toFixed(2)}
            </span>
            {rank !== undefined && total !== undefined && (
              <span
                className="mono flex h-7 items-center rounded-full bg-[var(--ink)] px-2.5 text-[13px] font-semibold text-[var(--bg)]"
                title={t("rank", { rank, total })}
              >
                #{rank}/{total}
              </span>
            )}
          </div>
        )}

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-3.5">
            {rows.map((r, i) => (
              <li key={r.key} className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    r.kind === "up"
                      ? "bg-[var(--blush)] text-[var(--red-ink)]"
                      : r.kind === "down"
                        ? "bg-[var(--soft)] text-[var(--muted)]"
                        : "bg-[var(--soft)] text-[var(--ink)]"
                  }`}
                >
                  <Icon name={r.icon} className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex min-w-0 items-center gap-1 text-[13px] font-semibold">
                    {r.mod && (
                      <span className="shrink-0 text-[var(--muted)]" title={t("mod")}>
                        <Icon name="shield" className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                    )}
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded bg-[var(--soft)]">
                    <span
                      className={`anim-grow-x block h-2 rounded ${
                        r.kind === "up"
                          ? "bg-[var(--accent)]"
                          : r.kind === "down"
                            ? "bg-[var(--muted)]"
                            : "bg-[var(--ink)]"
                      }`}
                      style={{
                        transform: `scaleX(${Math.abs(r.v) / max})`,
                        animationDuration: ".8s",
                        animationDelay: `${120 + i * 110}ms`,
                      }}
                    />
                  </span>
                </div>
                <span
                  className={`mono w-[52px] shrink-0 text-right text-[14px] font-semibold ${
                    r.kind === "up"
                      ? "text-[var(--red-ink)]"
                      : r.kind === "down"
                        ? "text-[var(--muted)]"
                        : "text-[var(--ink)]"
                  }`}
                >
                  {r.v >= 0 ? "+" : "−"}
                  {Math.abs(r.v).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-[14px] text-[var(--muted)]">
            <Icon name="clock" className="h-4 w-4" />
            {t("noReasons")}
          </p>
        )}

        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {labels.map(([l, s]) => (
              <span
                key={l}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--soft)] px-2.5 text-[11px] font-medium"
              >
                {LABELS[l as keyof typeof LABELS]?.[locale] ?? l}
                <span className="mono text-[var(--muted)]">{s.toFixed(2)}</span>
              </span>
            ))}
          </div>
        )}

        {(src || labels.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-[var(--muted)]">
            {src && (
              <span className="flex items-center gap-1.5">
                <Icon name={src.icon} className="h-[15px] w-[15px]" strokeWidth={2.2} />
                {src.text}
              </span>
            )}
            {labels.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Icon name="shield" className="h-[15px] w-[15px]" strokeWidth={2.2} />
                {t("signed")}
              </span>
            )}
          </div>
        )}

        <Link
          href="/feeds/new"
          className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] text-[15px] font-semibold text-[var(--bg)]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" />
            <circle cx="16" cy="6" r="2.4" />
            <circle cx="10" cy="12" r="2.4" />
            <circle cx="18" cy="18" r="2.4" />
          </svg>
          {t("tune")}
        </Link>
      </div>
    </Sheet>
  );
}
