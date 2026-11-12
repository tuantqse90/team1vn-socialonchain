"use client";

import { type InfiniteData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/bits";
import { useCompose } from "@/components/Compose";
import { AvatarStack } from "@/components/explore/AvatarStack";
import { CHANNEL_RE, channelIcon, useChannelRate } from "@/components/explore/channel";
import { plain, useNum } from "@/components/explore/text";
import { FeedList, type RowPage } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { Burst, CountUp, Eq } from "@/components/kit";
import { clientConfig } from "@/configs";
import { api, qs } from "@/lib/api";
import { useMyModeration } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { Author, ChannelStats, FeedPage, Me, Post } from "@/lib/types";

const POLL_MS = 30_000;

export default function ChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: raw } = use(params);
  const channel = decodeURIComponent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  const valid = CHANNEL_RE.test(channel);
  const t = useTranslations("channel");
  const router = useRouter();
  const qc = useQueryClient();
  const compose = useCompose();
  const rateOf = useChannelRate();
  const { num } = useNum();
  const { owner, status, token, me, login } = useSession();
  const moderation = useMyModeration().join(",");
  const withFc = clientConfig.enabledSources.some((s) => s.startsWith("farcaster"));

  // ---------- Feed của kênh (onchain + Farcaster) ----------
  const spec = useMemo(
    () =>
      JSON.stringify({
        v: 1,
        name: `#${channel}`,
        sources: [`channel:${channel}`, ...(withFc ? [`farcaster:channel:${channel}`] : [])],
        rules: [],
        recencyHalfLifeHours: 48,
      }),
    [channel, withFc],
  );
  const authed = token ? "a" : "n";
  const feedKey = useMemo(() => ["channel", channel, owner, authed] as const, [channel, owner, authed]);
  const fetchPage = useCallback(
    async (cursor: number | null): Promise<RowPage> => {
      const r = await api<FeedPage>(
        `/feed${qs({
          spec,
          viewer: owner?.toLowerCase(),
          cursor,
          limit: 20,
          moderation: authed === "a" ? undefined : moderation,
        })}`,
      );
      return { rows: r.items.map((i) => ({ post: i.post, reasons: i.reasons })), nextCursor: r.nextCursor };
    },
    [spec, owner, authed, moderation],
  );
  // Cùng key + queryFn với FeedList: chia sẻ cache, không gọi trùng. Dùng để lấy người vừa đăng + so bài mới.
  const list = useInfiniteQuery({
    queryKey: feedKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const loaded = list.isSuccess;

  // ---------- Thống kê + tham gia ----------
  const stats = useQuery({
    queryKey: ["channel-stats", channel, token],
    queryFn: () => api<ChannelStats>(`/channels/${channel}`),
    enabled: valid,
    refetchInterval: 60_000,
  });
  const [joinOpt, setJoinOpt] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);
  const [shake, setShake] = useState(0);
  const serverJoined = Boolean(stats.data?.joined ?? me?.settings?.channels?.includes(channel));
  const joined = joinOpt ?? serverJoined;
  const members =
    (stats.data?.members ?? 0) + (joinOpt === null ? 0 : (joinOpt ? 1 : 0) - (serverJoined ? 1 : 0));
  const rate = stats.data ? rateOf(stats.data) : null;

  async function toggleJoin() {
    if (status !== "ready") {
      router.push("/welcome");
      return;
    }
    if (busy || !valid) return;
    const next = !joined;
    setJoinOpt(next);
    setBusy(true);
    if (next) setBurst((k) => k + 1);
    try {
      if (!token) await login();
      const current = (me ?? (await api<Me>("/me"))).settings?.channels ?? [];
      const channels = next ? [...new Set([...current, channel])] : current.filter((c) => c !== channel);
      await api("/me/settings", { method: "PUT", json: { channels } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["channel-stats", channel] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
    } catch {
      setShake((k) => k + 1);
    } finally {
      setJoinOpt(null);
      setBusy(false);
    }
  }

  // ---------- Chia sẻ ----------
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      await navigator.share({ title: `/${channel}`, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard bị chặn: bỏ qua
    }
  }

  // ---------- Bài mới (poll 30s) ----------
  const [fresh, setFresh] = useState<Post[]>([]);
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const head = await fetchPage(null);
        const cur = qc.getQueryData<InfiniteData<RowPage>>(feedKey)?.pages.flatMap((p) => p.rows) ?? [];
        const seen = new Set(cur.map((r) => r.post.id));
        const newest = cur.reduce((m, r) => Math.max(m, r.post.createdAt), 0);
        const mine = owner?.toLowerCase();
        const news = head.rows
          .map((r) => r.post)
          .filter((p) => !seen.has(p.id) && p.createdAt > newest && p.author.address?.toLowerCase() !== mine);
        if (alive) setFresh(news);
      } catch {
        // mạng lỗi: thử lại lần sau
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [loaded, fetchPage, feedKey, qc, owner]);

  function loadNew() {
    setFresh([]);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    void qc.invalidateQueries({ queryKey: feedKey });
  }

  // ---------- Avatar: tôi (khi đã tham gia) + người vừa đăng trong kênh ----------
  const meAuthor: Author | null = owner
    ? {
        address: owner.toLowerCase(),
        handle: null,
        displayName: me?.profile?.displayName ?? null,
        avatarUrl: me?.profile?.avatarUrl ?? null,
        registered: true,
        fid: null,
        fcUsername: null,
        contractsDeployed: 0,
      }
    : null;
  const recent = useMemo(() => {
    const out: Author[] = [];
    const seen = new Set<string>();
    for (const r of list.data?.pages.flatMap((p) => p.rows) ?? []) {
      const a = r.post.author;
      const k = a.address ?? `fid:${a.fid}`;
      if (seen.has(k) || (owner && a.address?.toLowerCase() === owner.toLowerCase())) continue;
      seen.add(k);
      out.push(a);
      if (out.length === 3) break;
    }
    return out;
  }, [list.data, owner]);
  const freshAuthors = useMemo(() => {
    const m = new Map<string, Author>();
    for (const p of fresh) m.set(p.author.address ?? `fid:${p.author.fid}`, p.author);
    return [...m.values()].slice(0, 2);
  }, [fresh]);
  const stackW = 24 + 16 * recent.length;

  return (
    <div>
      <nav className="flex h-11 items-center justify-between px-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/search"))}
          aria-label={t("back")}
          title={t("back")}
          className="press flex h-11 w-11 items-center justify-center text-[var(--ink)]"
        >
          <Icon name="left" className="h-6 w-6" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => void share()}
          aria-label={copied ? t("copied") : t("share")}
          title={t("share")}
          data-testid="channel-share"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)]"
        >
          {copied ? (
            <span className="anim-pop inline-flex text-[var(--ok-ink)]">
              <Icon name="check" className="h-[22px] w-[22px]" strokeWidth={2.4} />
            </span>
          ) : (
            <Icon name="share" className="h-[22px] w-[22px]" strokeWidth={1.9} />
          )}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? t("copied") : ""}
        </span>
      </nav>

      <div className="flex items-center gap-3.5 px-5 pt-1">
        <span
          aria-hidden
          className="anim-pop flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[var(--accent)] text-[var(--accent-ink)]"
        >
          <Icon name={channelIcon(channel)} className="h-[34px] w-[34px]" strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="break-all text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em] line-clamp-2">
            /{channel}
          </h1>
          <div className="flex h-6 items-center gap-2">
            <span
              role="img"
              aria-label={t("members", { n: members })}
              className="flex items-center gap-1.5"
              data-testid="channel-members"
            >
              <span aria-hidden className="relative h-6 shrink-0" style={{ width: stackW }}>
                {meAuthor && (
                  <span
                    className="absolute left-0 top-0 inline-flex rounded-full"
                    style={{
                      zIndex: 10,
                      boxShadow: "0 0 0 2px var(--bg)",
                      transform: `scale(${joined ? 1 : 0})`,
                      transition: `transform .55s var(--bouncy) ${joined ? 180 : 0}ms`,
                    }}
                  >
                    <Avatar author={meAuthor} size={24} />
                  </span>
                )}
                <span
                  className="absolute left-0 top-0"
                  style={{
                    transform: `translateX(${joined && meAuthor ? 16 : 0}px)`,
                    transition: `transform .55s var(--bouncy) ${joined ? 0 : 120}ms`,
                  }}
                >
                  <AvatarStack authors={recent} size={24} step={16} />
                </span>
              </span>
              <CountUp
                value={members}
                format={(v) => num(Math.round(v))}
                className="mono text-[13px] font-semibold"
              />
            </span>
            {rate && (
              <>
                <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-[var(--muted)]" />
                <span role="img" aria-label={rate.aria} className="flex items-center gap-1.5">
                  <span className="inline-flex text-[var(--accent)]">
                    <Eq className="h-[13px]" />
                  </span>
                  <span aria-hidden className="mono text-[13px] font-semibold text-[var(--muted)]">
                    {rate.text}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-4">
        <button
          key={shake}
          type="button"
          onClick={() => void toggleJoin()}
          aria-pressed={joined}
          disabled={!valid}
          data-testid="channel-join"
          className={`press relative flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold transition-colors disabled:opacity-50 ${
            shake ? "anim-shake" : ""
          } ${
            joined
              ? "bg-transparent text-[var(--ink)] shadow-[inset_0_0_0_1.5px_var(--line)]"
              : "bg-[var(--ink)] text-[var(--bg)]"
          }`}
        >
          {joined ? (
            <span className="anim-pop inline-flex">
              <Icon name="check" className="h-5 w-5" strokeWidth={2.6} />
            </span>
          ) : (
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.4} />
          )}
          <span>{joined ? t("joined") : t("join")}</span>
          <Burst k={burst} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => (status === "ready" ? compose.open({ channel }) : router.push("/welcome"))}
        data-testid="channel-compose"
        className="flex h-[60px] w-full items-center gap-3 border-y border-[var(--line)] px-4 text-left text-[var(--muted)] hover:bg-[var(--soft)]/40"
      >
        {meAuthor ? (
          <Avatar author={plain(meAuthor)} size={36} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--ink)]">
            <Icon name="plus" className="h-5 w-5" />
          </span>
        )}
        <span className="flex-1 text-[15px]">{t("compose")}</span>
        <span className="mono flex h-[26px] max-w-[45%] items-center truncate rounded-full bg-[var(--soft)] px-2.5 text-[12px] font-semibold text-[var(--ink)]">
          /{channel}
        </span>
      </button>

      {/* Viên "bài mới": dính dưới header khi cuộn, chạm → lên đầu + tải lại. */}
      <div className="pointer-events-none sticky top-14 z-20 flex h-0 justify-center">
        {fresh.length > 0 && (
          <button
            type="button"
            onClick={loadNew}
            aria-label={t("newPosts", { n: fresh.length })}
            title={t("newPosts", { n: fresh.length })}
            data-testid="channel-new-posts"
            className="press anim-drop pointer-events-auto mt-3 flex h-11 items-center"
          >
            <span className="flex h-10 items-center gap-2 rounded-full bg-[var(--ink)] pl-3.5 pr-1.5 text-[var(--bg)] shadow-lg">
              <Icon name="up" className="h-4 w-4" strokeWidth={2.6} />
              <AvatarStack authors={freshAuthors} size={28} step={19} ring="var(--ink)" />
            </span>
          </button>
        )}
      </div>

      <FeedList queryKey={feedKey} fetchPage={fetchPage} emptyText={t("empty")} />
    </div>
  );
}
