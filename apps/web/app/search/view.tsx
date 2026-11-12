"use client";

import type { FeedSpec } from "@socialonchain/feed-sdk";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { CompactPost } from "@/components/explore/CompactPost";
import { ChannelCard } from "@/components/explore/channel";
import { fold, foldQuery, Highlight, useNum } from "@/components/explore/text";
import { Icon, type IconName } from "@/components/Icon";
import { Segmented } from "@/components/kit";
import { PersonRow } from "@/components/PersonRow";
import { api, qs } from "@/lib/api";
import { orbBackground } from "@/lib/orb";
import { useSession } from "@/lib/session";
import type { Author, ChannelStats, FeedPage, Post, SavedFeed } from "@/lib/types";

type Seg = "people" | "posts" | "feeds";
type FeedsResponse = {
  defaults: { id: string; spec: FeedSpec; subscribers: number }[];
  public: SavedFeed[];
};
type FeedRow = { id: string; name: string; subscribers: number; icon: IconName };

const FEED_ICON: Record<string, IconName> = {
  "default:chronological": "clock",
  "default:builders-shipping": "verified",
  "default:avalanche-no-shill": "peak",
  "default:grants-hackathons": "trophy",
  "default:founders": "briefcase",
  "default:real-conversations": "chat",
};

/** Tab Khám phá: ô tìm (người, bài, feed), kênh sôi động, builder đã xác minh, bài nổi. */
export function SearchView() {
  const t = useTranslations("explore");
  const params = useSearchParams();
  const router = useRouter();
  const { owner } = useSession();
  const viewer = owner?.toLowerCase();
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text.trim());
  const [seg, setSeg] = useState<Seg>("people");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQ = q.length > 0;

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(text.trim());
      router.replace(`/search${qs({ q: text.trim() })}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [text, router]);

  const clear = () => {
    setText("");
    setQ("");
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  };

  const search = useQuery({
    queryKey: ["search", q, viewer],
    queryFn: () => api<{ users: Author[]; posts: Post[] }>(`/search${qs({ q, viewer })}`),
    enabled: hasQ,
  });
  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => api<{ items: ChannelStats[] }>("/channels"),
    enabled: !hasQ,
    staleTime: 60_000,
  });
  const builders = useQuery({
    queryKey: ["builders", 8, viewer],
    queryFn: () => api<{ items: Author[] }>(`/builders${qs({ limit: 8, viewer })}`),
    enabled: !hasQ && seg === "people",
  });
  const hot = useQuery({
    queryKey: ["hot-posts", viewer],
    queryFn: async () => {
      const get = (feedId: string) => api<FeedPage>(`/feed${qs({ feedId, viewer, limit: 5 })}`);
      const r = await get("default:builders-shipping").catch(() => null);
      const items = r?.items.length ? r.items : (await get("default:chronological")).items;
      return items.map((i) => i.post).slice(0, 5);
    },
    enabled: !hasQ && seg === "posts",
  });
  const feeds = useQuery({
    queryKey: ["explore-feeds", q, viewer],
    queryFn: () => api<FeedsResponse>(`/feeds${qs({ q, viewer })}`),
    enabled: seg === "feeds",
  });

  const feedRows = useMemo<FeedRow[]>(() => {
    if (!feeds.data) return [];
    const defs = feeds.data.defaults.map((d) => ({
      id: d.id,
      name: d.spec.name,
      subscribers: d.subscribers ?? 0,
      icon: FEED_ICON[d.id] ?? ("layers" as IconName),
    }));
    const pubs = feeds.data.public.map((f) => ({
      id: f.id,
      name: f.name,
      subscribers: f.subscribers ?? 0,
      icon: "layers" as IconName,
    }));
    if (hasQ) {
      const needle = foldQuery(q);
      return [...defs.filter((d) => fold(d.name).includes(needle)), ...pubs];
    }
    return [...defs.filter((d) => d.id !== "default:chronological"), ...pubs]
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, 6);
  }, [feeds.data, hasQ, q]);

  const people = hasQ ? search.data?.users : builders.data?.items;
  const posts = hasQ ? search.data?.posts : hot.data;
  const active =
    seg === "people"
      ? { pending: hasQ ? search.isPending : builders.isPending, n: people?.length ?? 0 }
      : seg === "posts"
        ? { pending: hasQ ? search.isPending : hot.isPending, n: posts?.length ?? 0 }
        : { pending: feeds.isPending, n: feedRows.length };

  return (
    <div className="pb-6">
      <header className="flex h-[52px] items-center px-5">
        <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-[-0.045em]">{t("title")}</h1>
      </header>

      <div className="mx-4 mt-1 flex h-12 items-center gap-2 rounded-2xl bg-[var(--soft)] pl-3.5 pr-0.5 transition-shadow focus-within:shadow-[0_0_0_2px_var(--accent)]">
        <Icon name="search" className="h-5 w-5 shrink-0 text-[var(--muted)]" strokeWidth={2.2} />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 100))}
          placeholder={t("placeholder")}
          aria-label={t("searchLabel")}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          data-testid="search-input"
          className="h-11 min-w-0 flex-1 bg-transparent text-[17px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
        />
        {text && (
          <button
            type="button"
            onClick={clear}
            aria-label={t("clear")}
            title={t("clear")}
            data-testid="search-clear"
            className="anim-pop flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--soft)]">
              <Icon name="x" className="h-3 w-3" strokeWidth={3} />
            </span>
          </button>
        )}
      </div>

      {!hasQ && (channels.data?.items.length ?? 0) > 0 && (
        <section aria-labelledby="trending-h" className="anim-drop mt-3">
          <h2 id="trending-h" className="flex h-7 items-center gap-1.5 px-5 text-[15px] font-bold">
            <span className="inline-flex text-[var(--accent)]">
              <Icon name="flame" filled className="h-[17px] w-[17px]" strokeWidth={1.4} />
            </span>
            {t("trending")}
          </h2>
          <div className="no-scrollbar stagger mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {channels.data?.items.slice(0, 10).map((c, i) => (
              <ChannelCard key={c.name} stats={c} lead={i === 0} />
            ))}
          </div>
        </section>
      )}

      <div className="mx-4 mt-4">
        <Segmented<Seg>
          items={[
            { key: "people", icon: "user", label: t("people") },
            { key: "posts", icon: "chat", label: t("posts") },
            { key: "feeds", icon: "layers", label: t("feeds") },
          ]}
          value={seg}
          onChange={setSeg}
          testId="explore-seg"
        />
      </div>

      <div role="tabpanel" aria-label={t(seg)} className="mt-3 border-t border-[var(--line)]">
        {active.pending && <RowsSkeleton />}

        {seg === "people" && (
          <div key={`p:${q}`}>
            {people?.map((u, i) => (
              <div
                key={u.address ?? `fid:${u.fid}`}
                className="anim-drop"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <PersonRow author={u} follow q={q} className="border-b border-[var(--line)] pl-4 pr-3" />
              </div>
            ))}
          </div>
        )}

        {seg === "posts" && (
          <div key={`s:${q}`}>
            {posts?.map((p, i) => (
              <CompactPost key={p.id} post={p} q={q} index={i} />
            ))}
          </div>
        )}

        {seg === "feeds" && (
          <div key={`f:${q}`}>
            {feedRows.map((f, i) => (
              <FeedLine key={f.id} f={f} q={q} index={i} />
            ))}
            {feedRows.length > 0 && <MarketLink />}
          </div>
        )}

        {!active.pending && active.n === 0 && seg === "people" && !hasQ && <NoBuildersYet />}

        {!active.pending && active.n === 0 && !(seg === "people" && !hasQ) && (
          <div className="flex flex-col items-center gap-3.5 pt-16" data-testid="explore-empty">
            <span className="anim-pop flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[var(--soft)] text-[var(--muted)]">
              <Icon name="search" className="h-8 w-8" strokeWidth={2} />
            </span>
            <span className="text-[15px] font-semibold text-[var(--muted)]">{t("empty")}</span>
            {seg === "feeds" && <MarketLink />}
          </div>
        )}
      </div>
    </div>
  );
}

/** Chưa ai đăng ký onchain (chain mới): 3 orb chồng nhau + lời mời, thay cho "Không có kết quả". */
function NoBuildersYet() {
  const t = useTranslations("rail");
  const { status } = useSession();
  return (
    <div className="flex flex-col items-center px-8 pt-12 text-center" data-testid="explore-empty">
      <div className="stagger flex -space-x-4">
        {["0xa11ce", "0xb0b", "0xc4r01"].map((seed) => (
          <span
            key={seed}
            className="h-16 w-16 rounded-full border-[3px] border-[var(--bg)]"
            style={{ background: orbBackground(seed) }}
          />
        ))}
      </div>
      <p className="mt-5 text-[19px] font-bold tracking-tight">{t("noBuilders")}</p>
      <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-[var(--muted)]">{t("beFirst")}</p>
      {status !== "ready" && (
        <Link
          href="/welcome"
          className="press compose-glow mt-5 flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-bold"
        >
          <Icon name="userplus" className="h-[18px] w-[18px]" strokeWidth={2.2} />
          {t("join")}
        </Link>
      )}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedLine({ f, q, index }: { f: FeedRow; q: string; index: number }) {
  const t = useTranslations("explore");
  const { compact } = useNum();
  return (
    <Link
      href="/feeds"
      className="anim-drop flex h-[68px] items-center gap-3 border-b border-[var(--line)] pl-4 pr-3 hover:bg-[var(--soft)]/40"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      data-testid="explore-feed"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--soft)]">
        {f.icon === "verified" ? (
          <span className="inline-flex text-[var(--accent)] [&_svg]:stroke-[var(--soft)]">
            <Icon name="verified" filled className="h-[22px] w-[22px]" strokeWidth={1.6} />
          </span>
        ) : (
          <Icon name={f.icon} className="h-[22px] w-[22px]" strokeWidth={1.9} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">
          <Highlight text={f.name} q={q} />
        </span>
        <span
          className="mono flex items-center gap-1 text-[12px] text-[var(--muted)]"
          role="img"
          aria-label={t("subscribers", { n: f.subscribers })}
        >
          <Icon name="user" className="h-[13px] w-[13px]" strokeWidth={2.4} />
          {compact(f.subscribers)}
        </span>
      </span>
      <Icon name="chevronr" className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" strokeWidth={2.2} />
    </Link>
  );
}

function MarketLink() {
  const t = useTranslations("explore");
  return (
    <Link
      href="/feeds"
      data-testid="explore-market"
      className="press mx-4 mt-3 flex h-[52px] items-center gap-2.5 self-stretch rounded-2xl bg-[var(--ink)] pl-4 pr-3.5 text-[15px] font-bold text-[var(--bg)]"
    >
      <Icon name="layers" className="h-5 w-5" strokeWidth={2} />
      <span className="flex-1">{t("market")}</span>
      <Icon name="chevronr" className="h-5 w-5" strokeWidth={2.4} />
    </Link>
  );
}
