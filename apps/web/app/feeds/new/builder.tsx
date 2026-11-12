"use client";

import {
  DEFAULT_FEEDS,
  describeCondition,
  type FeedSpec,
  MODERATION_STACKS,
  type Rule,
  rank,
} from "@socialonchain/feed-sdk";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { shortDuration, untilUtcMidnight, useNow } from "@/components/billing/time";
import { Empty, Ring } from "@/components/bits";
import { LimitCard } from "@/components/builder/LimitCard";
import { PreviewRows } from "@/components/builder/PreviewRows";
import { RuleChip } from "@/components/builder/RuleChip";
import { PostSkeleton } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { clientConfig } from "@/configs";
import { ApiError, api, qs, track } from "@/lib/api";
import { useFeedCatalog, useMyModeration, useMyTabs, useUpdateSettings } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { CandidatesResponse, CompileResult, Entitlements, SavedFeed } from "@/lib/types";

const EXAMPLES = {
  en: [
    "less price talk, hide shill, more founders with substance",
    "only builders who deployed contracts",
    "more grants & hackathons, less politics",
  ],
  vi: [
    "ít bàn giá, ẩn shill, ưu tiên founder có nội dung",
    "chỉ builder đã deploy contract",
    "thêm grant và hackathon, bớt chính trị",
  ],
};

const BASE_SOURCES = [...new Set(Object.values(DEFAULT_FEEDS).flatMap((s) => s.sources))];

type Ranks = { key: string; prev: Map<string, number> | null; cur: Map<string, number> };

export function Builder() {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "vi";
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const forkId = params.get("fork");
  const { status, owner, me, token } = useSession();
  const catalog = useFeedCatalog();
  const tabs = useMyTabs();
  const moderationIds = useMyModeration();
  const updateSettings = useUpdateSettings();
  const now = useNow(60_000);

  const [text, setText] = useState("");
  const [base, setBase] = useState<FeedSpec | null>(null);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [disabled, setDisabled] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 429 không kèm entitlements: vẫn coi như hết lượt. */
  const [quotaHit, setQuotaHit] = useState(false);
  const [feedsHit, setFeedsHit] = useState(false);
  const [shake, setShake] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [ranks, setRanks] = useState<Ranks>({ key: "", prev: null, cur: new Map() });

  // Nạp feed đang sửa / fork làm điểm xuất phát.
  const source = useQuery({
    queryKey: ["feed-spec", editId ?? forkId],
    queryFn: () =>
      api<{ id: string; spec: FeedSpec }>(`/feeds/${encodeURIComponent((editId ?? forkId) as string)}`),
    enabled: Boolean(editId ?? forkId),
  });
  const editing: SavedFeed | undefined = editId ? catalog.data?.mine.find((f) => f.id === editId) : undefined;
  useEffect(() => {
    if (source.data && !base) {
      setBase(source.data.spec);
      setName(forkId ? `${source.data.spec.name} (fork)`.slice(0, 60) : source.data.spec.name);
      if (editing?.nlText) setText(editing.nlText);
    }
  }, [source.data, base, forkId, editing]);

  useEffect(() => {
    if (me?.entitlements && !ent) setEnt(me.entitlements);
  }, [me, ent]);

  const compiled: FeedSpec | null = result?.spec ?? base;
  const spec: FeedSpec | null = useMemo(
    () => (compiled ? { ...compiled, rules: compiled.rules.filter((_, i) => !disabled.has(i)) } : null),
    [compiled, disabled],
  );

  // Candidate tải 1 lần (theo tập nguồn), rank() chạy ngay trong trình duyệt mỗi khi bật/tắt rule.
  const sources = useMemo(
    () => [...new Set([...BASE_SOURCES, ...(spec?.sources ?? [])])].sort(),
    [spec?.sources],
  );
  const cands = useQuery({
    queryKey: ["candidates", owner, sources.join(",")],
    queryFn: () =>
      api<CandidatesResponse>(
        `/candidates${qs({ viewer: owner?.toLowerCase(), sources: sources.join(",") })}`,
      ),
    enabled: Boolean(spec),
    staleTime: 60_000,
  });
  const preview = useMemo(() => {
    if (!spec || !cands.data) return null;
    const moderation = moderationIds
      .map((id) => MODERATION_STACKS[id])
      .filter((s): s is FeedSpec => Boolean(s));
    const t0 = performance.now();
    const r = rank(spec, cands.data.candidates, { now: cands.data.now, moderation, limit: 20 });
    const ms = performance.now() - t0;
    const byId = new Map(cands.data.posts.map((p) => [p.id, p]));
    return {
      ms,
      hidden: r.hidden,
      posts: r.items.flatMap((i) => {
        const post = byId.get(i.id);
        return post ? [post] : [];
      }),
    };
  }, [spec, cands.data, moderationIds]);

  // Thứ hạng của lần preview trước, để hiện ↑n/↓n.
  useEffect(() => {
    if (!preview) return;
    const ids = preview.posts.map((p) => p.id);
    const key = ids.join(",");
    setRanks((r) =>
      r.key === key
        ? r
        : { key, prev: r.key ? r.cur : null, cur: new Map(ids.map((id, i) => [id, i] as const)) },
    );
  }, [preview]);

  const used = ent?.usage.compilesToday ?? 0;
  const limit = ent?.limits.compilesPerDay ?? clientConfig.freeLimits.compilesPerDay;
  const out = quotaHit || used >= limit;
  const reset = shortDuration(untilUtcMidnight(now));

  async function compile() {
    if (out) {
      setShake((k) => k + 1);
      return;
    }
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<CompileResult>("/feeds/compile", {
        method: "POST",
        json: { text: text.trim(), current: base ?? undefined },
      });
      setResult(r);
      setDisabled(new Set());
      setEnt(r.entitlements);
      if (!name) setName(r.spec.name);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const en = e.body.entitlements as Entitlements | undefined;
        if (en) setEnt(en);
        else setQuotaHit(true);
        setShake((k) => k + 1);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!spec || !name.trim()) return;
    setBusy(true);
    setError(null);
    setFeedsHit(false);
    try {
      const body = {
        name: name.trim(),
        spec: { ...spec, name: name.trim() },
        nlText: text.trim() || undefined,
        isPublic,
      };
      let id = editId;
      if (editId) {
        await api(`/feeds/${encodeURIComponent(editId)}`, { method: "PUT", json: body });
      } else {
        const r = await api<SavedFeed>("/feeds", {
          method: "POST",
          json: { ...body, forkedFrom: forkId ?? undefined },
        });
        id = r.id;
        track("feed_saved_ui", { forked: Boolean(forkId) });
      }
      if (id && !tabs.includes(id)) await updateSettings({ feeds: [...tabs, id].slice(0, 20) });
      try {
        localStorage.setItem("soc:tab", id ?? "");
      } catch {
        // bỏ qua
      }
      router.push("/");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const en = e.body.entitlements as Entitlements | undefined;
        if (en) setEnt(en);
        if (e.body.quota === "feeds") setFeedsHit(true);
        else setQuotaHit(true);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ruleText = (r: Rule) => r.explain?.[locale] ?? describeCondition(r.when)[locale];
  const toggleRule = (i: number) =>
    setDisabled((d) => {
      const n = new Set(d);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  if (status !== "ready" || !token) {
    return (
      <div className="px-4 py-10">
        <Empty icon="sparkle" text={t("title")} />
        <div className="flex justify-center">
          <Link
            href="/welcome"
            aria-label={t("join")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"
          >
            <Icon name="userplus" className="h-5 w-5" />
          </Link>
        </div>
      </div>
    );
  }

  const ruleCount = compiled ? compiled.rules.length : 0;
  const onCount = ruleCount - disabled.size;

  return (
    <div className="pb-10">
      <header className="flex h-14 items-center justify-between px-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="press flex h-11 w-11 items-center justify-center rounded-full"
          aria-label={tc("close")}
        >
          <Icon name="x" className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
        <h1 className="text-[16px] font-bold">{t("title")}</h1>
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          disabled={!compiled}
          aria-label={t("viewSpec")}
          aria-pressed={showJson}
          title={t("viewSpec")}
          className={`press flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            showJson ? "bg-[var(--ink)] text-[var(--bg)]" : ""
          }`}
        >
          <Icon name="code" className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
      </header>

      <section className="px-4">
        <div className="rounded-3xl bg-[var(--soft)] p-3">
          <label htmlFor="builder-nl" className="sr-only">
            {t("prompt")}
          </label>
          <textarea
            id="builder-nl"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            placeholder={t("placeholder")}
            rows={3}
            className="w-full resize-none bg-transparent px-1 text-[16px] leading-[1.42] placeholder:text-[var(--muted)]"
            data-testid="builder-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void compile();
            }}
          />
          <div className="flex items-center gap-2">
            <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {!text &&
                EXAMPLES[locale].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setText(ex)}
                    className="press shrink-0 rounded-full bg-[var(--bg)] px-3 py-1.5 text-[12px] text-[var(--muted)]"
                  >
                    {ex}
                  </button>
                ))}
            </div>
            <span
              role="img"
              aria-label={t("quotaAria", { used, limit })}
              title={t("quotaAria", { used, limit })}
              className="mono flex shrink-0 items-center gap-1.5 text-[12px] font-semibold tabular-nums text-[var(--muted)]"
              data-testid="quota"
            >
              <Ring value={used / Math.max(1, limit)} danger={!out} size={22} stroke={3} />
              {used}/{limit}
            </span>
            <button
              type="button"
              onClick={() => void compile()}
              disabled={!out && (busy || text.trim().length < 2)}
              aria-disabled={out || undefined}
              aria-label={out ? t("outAria") : t("compileAria")}
              title={out ? t("outAria") : t("compileAria")}
              data-testid="builder-compile"
              className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                out
                  ? "bg-[var(--line)] text-[var(--ink)]"
                  : busy
                    ? "bg-[var(--graphite)] text-[var(--bg)]"
                    : "bg-[var(--accent)] text-[var(--accent-ink)]"
              }`}
            >
              {busy ? (
                <span className="spinner" aria-hidden />
              ) : (
                <Icon name={out ? "lock" : "up"} className="h-5 w-5" strokeWidth={2.4} />
              )}
            </button>
          </div>
        </div>

        {out && (
          <div className="mt-3">
            <LimitCard
              kind="compile"
              used={Math.max(used, limit)}
              limit={limit}
              reset={reset}
              shake={shake}
            />
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 flex items-center gap-2 text-sm text-[var(--err-ink)]">
            <Icon name="alert" className="h-4 w-4" /> {error}
          </div>
        )}
      </section>

      {busy && !compiled && (
        <div className="mt-5 flex gap-3 px-4" aria-live="polite">
          <SpecTile />
          <span className="mt-1 flex h-10 w-16 items-center justify-center gap-[5px] rounded-full bg-[var(--soft)]">
            <span className="eq inline-flex h-3.5 items-end gap-[3px]" aria-hidden>
              <i style={{ height: "60%" }} />
              <i style={{ height: "100%" }} />
              <i style={{ height: "75%" }} />
            </span>
            <span className="sr-only">{tc("loading")}</span>
          </span>
        </div>
      )}

      {compiled && (
        <section className="mt-5 px-4" data-testid="builder-result">
          <div className="flex gap-3">
            <SpecTile />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex h-9 items-center gap-2">
                <span className="text-[15px] font-semibold">FeedSpec</span>
                <span className="mono text-[12px] text-[var(--muted)]">
                  {busy ? "…" : t("rulesOn", { on: onCount, total: ruleCount })}
                </span>
                <span className="flex-1" />
                {result && (
                  <span
                    role="img"
                    aria-label={`${t("engine")}: ${result.engine}${result.cached ? " · cache" : ""}`}
                    title={`${t("engine")}: ${result.engine}${result.cached ? " · cache" : ""}`}
                    className="text-[var(--muted)]"
                  >
                    <Icon name={result.engine === "llm" ? "sparkle" : "bolt"} className="h-4 w-4" />
                  </span>
                )}
              </div>

              {showJson && spec ? (
                <pre className="anim-pop mono max-h-[280px] overflow-auto rounded-2xl bg-[var(--ink)] px-3.5 py-3 text-[10.5px] leading-[1.55] text-[var(--bg)]">
                  {JSON.stringify(spec, null, 2)}
                </pre>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {compiled.rules.map((r, i) => (
                      <RuleChip
                        // biome-ignore lint/suspicious/noArrayIndexKey: rule định danh theo vị trí (bật/tắt theo index)
                        key={`${i}-${JSON.stringify(r.when)}`}
                        rule={r}
                        text={ruleText(r)}
                        on={!disabled.has(i)}
                        onToggle={() => toggleRule(i)}
                        delay={Math.min(i, 8) * 90}
                      />
                    ))}
                    {compiled.rules.length === 0 && <span className="text-sm text-[var(--muted)]">—</span>}
                  </div>
                  {result && result.unsupported.length > 0 && (
                    <div className="flex flex-wrap gap-2" data-testid="unsupported">
                      {result.unsupported.map((u, i) => (
                        <span
                          key={u}
                          title={t("unsupportedWhy")}
                          className="anim-pop flex min-h-10 max-w-full items-center gap-[7px] rounded-[20px] border-[1.5px] border-dashed border-[var(--muted)] py-1 pl-1 pr-3 text-[13px] font-semibold text-[var(--muted)]"
                          style={{ animationDelay: `${(compiled.rules.length + i) * 90 + 100}ms` }}
                        >
                          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--soft)]">
                            <Icon name="eyeoff" className="h-4 w-4" strokeWidth={2} />
                          </span>
                          <span className="min-w-0">{u}</span>
                          <span className="shrink-0 text-[11px] font-medium">{t("unsupported")}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <label htmlFor="builder-name-input" className="sr-only">
              {t("name")}
            </label>
            <input
              id="builder-name-input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder={t("name")}
              className="field flex-1"
              data-testid="builder-name"
            />
            <button
              type="button"
              onClick={() => setIsPublic((v) => !v)}
              className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isPublic ? "bg-[var(--soft)]" : "bg-[var(--ink)] text-[var(--bg)]"}`}
              aria-label={t("public")}
              aria-pressed={isPublic}
              title={isPublic ? t("public") : t("private")}
            >
              <Icon name={isPublic ? "globe" : "lock"} className="h-[18px] w-[18px]" />
            </button>
          </div>
          {feedsHit && ent && (
            <div className="mt-3">
              <LimitCard
                kind="feeds"
                used={Math.max(ent.usage.feeds, ent.limits.maxFeeds)}
                limit={ent.limits.maxFeeds}
              />
            </div>
          )}
          {feedsHit && !ent && (
            <Link
              href="/billing"
              data-testid="feeds-full"
              className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--soft)] text-sm font-semibold"
            >
              <Icon name="lock" className="h-4 w-4" />
              {t("feedsFull", { n: clientConfig.freeLimits.maxFeeds })}
            </Link>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            data-testid="builder-save"
            className="press mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-[var(--accent-ink)] disabled:opacity-40"
          >
            <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={2.2} />
            {t("save")}
          </button>
        </section>
      )}

      {compiled && (
        <section className="mt-6 border-t border-[var(--line)]">
          {preview && (
            <div
              className="flex h-12 items-center gap-3.5 px-4"
              data-testid="preview-meta"
              title={`rank() ${preview.ms.toFixed(1)}ms`}
            >
              <span className="flex items-center gap-[7px] text-[13px] font-bold text-[var(--red-ink)]">
                <span className="anim-halo h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
                Live
              </span>
              <span className="flex-1" />
              <span
                role="img"
                aria-label={t("shownAria", { n: preview.posts.length })}
                className="mono flex items-center gap-[5px] text-[13px] font-semibold"
              >
                <Icon name="eye" className="h-[17px] w-[17px]" strokeWidth={2} />
                {preview.posts.length}
              </span>
              <span
                role="img"
                aria-label={t("hiddenAria", { n: preview.hidden })}
                className="mono flex items-center gap-[5px] text-[13px] font-semibold text-[var(--red-ink)]"
              >
                <Icon name="eyeoff" className="h-[17px] w-[17px]" strokeWidth={2} />
                {preview.hidden}
              </span>
            </div>
          )}
          {cands.isPending && <PostSkeleton />}
          {preview?.posts.length === 0 && <Empty text="—" />}
          {preview && preview.posts.length > 0 && <PreviewRows posts={preview.posts} prev={ranks.prev} />}
        </section>
      )}
    </div>
  );
}

function SpecTile() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]">
      <Icon name="code" className="h-[18px] w-[18px]" strokeWidth={2} />
    </span>
  );
}
