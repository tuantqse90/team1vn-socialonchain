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
import { Button, Empty, Ring } from "@/components/bits";
import { PostSkeleton } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { PostCard } from "@/components/PostCard";
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

  const [text, setText] = useState("");
  const [base, setBase] = useState<FeedSpec | null>(null);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [disabled, setDisabled] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaHit, setQuotaHit] = useState(false);
  const [ent, setEnt] = useState<Entitlements | null>(null);

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
      items: r.items.flatMap((i) => {
        const post = byId.get(i.id);
        return post ? [{ post, reasons: i.reasons }] : [];
      }),
    };
  }, [spec, cands.data, moderationIds]);

  async function compile() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setQuotaHit(false);
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
        setQuotaHit(true);
        const en = e.body.entitlements as Entitlements | undefined;
        if (en) setEnt(en);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!spec || !name.trim()) return;
    setBusy(true);
    setError(null);
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
      if (e instanceof ApiError && e.status === 429) setQuotaHit(true);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ruleText = (r: Rule) => r.explain?.[locale] ?? describeCondition(r.when)[locale];
  const used = ent?.usage.compilesToday ?? 0;
  const limit = ent?.limits.compilesPerDay ?? 10;

  if (status !== "ready" || !token) {
    return (
      <div className="px-4 py-10">
        <Empty icon="sparkle" text={t("title")} />
        <div className="flex justify-center">
          <Link
            href="/welcome"
            className="press flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
          >
            <Icon name="userplus" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--soft)]"
          aria-label={tc("back")}
        >
          <Icon name="left" className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold">{t("title")}</h1>
        <Link
          href="/billing"
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-[var(--muted)]"
          title={t("quota", { used, limit })}
          data-testid="quota"
        >
          <Ring value={used / limit} danger={used >= limit} size={18} />
          <span className="mono">
            {used}/{limit}
          </span>
          {ent?.plan === "pro" && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">
              PRO
            </span>
          )}
        </Link>
      </div>

      <section className="px-4">
        <div className="rounded-3xl bg-[var(--soft)] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            placeholder={t("placeholder")}
            rows={3}
            className="w-full resize-none bg-transparent px-1 text-[16px] leading-6 placeholder:text-[var(--muted)]"
            data-testid="builder-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void compile();
            }}
          />
          <div className="flex items-center gap-2">
            <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
              {!text &&
                EXAMPLES[locale].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setText(ex)}
                    className="press shrink-0 rounded-full bg-[var(--bg)] px-3 py-1 text-[12px] text-[var(--muted)]"
                  >
                    {ex}
                  </button>
                ))}
            </div>
            <Button
              variant="solid"
              onClick={() => void compile()}
              disabled={busy || text.trim().length < 2}
              testId="builder-compile"
              className="h-9"
            >
              {busy ? <span className="spinner" /> : <Icon name="sparkle" className="h-4 w-4" />}
              {t("compile")}
            </Button>
          </div>
        </div>

        {quotaHit && (
          <div
            className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--accent)] px-4 py-3 text-sm"
            data-testid="quota-hit"
          >
            <Icon name="lock" className="h-5 w-5 text-[var(--accent)]" />
            <span className="flex-1">{t("quotaHit")}</span>
            <Link href="/billing" className="font-semibold text-[var(--accent)]">
              {t("upgrade")}
            </Link>
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--accent)]">
            <Icon name="alert" className="h-4 w-4" /> {error}
          </div>
        )}
      </section>

      {compiled && (
        <section className="mt-5 px-4" data-testid="builder-result">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            {result && (
              <span className="flex items-center gap-1" title={`${t("engine")}: ${result.engine}`}>
                <Icon name={result.engine === "llm" ? "sparkle" : "bolt"} className="h-3.5 w-3.5" />
                {result.engine}
                {result.cached ? " · cache" : ""}
              </span>
            )}
            <span className="flex-1" />
            <span className="flex gap-1">
              {compiled.sources.slice(0, 4).map((s) => (
                <span key={s} className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px]">
                  {s}
                </span>
              ))}
              {compiled.sources.length > 4 && (
                <span className="mono text-[10px]">+{compiled.sources.length - 4}</span>
              )}
            </span>
          </div>
          <ul className="space-y-1.5">
            {compiled.rules.map((r, i) => {
              const off = disabled.has(i);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rule định danh theo vị trí (bật/tắt theo index)
                <li key={`${i}-${JSON.stringify(r.when)}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setDisabled((d) => {
                        const n = new Set(d);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={`press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-opacity ${off ? "opacity-40" : ""} bg-[var(--soft)]`}
                    data-testid="rule"
                    aria-pressed={!off}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        r.action === "boost" ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--line)]"
                      }`}
                    >
                      <Icon
                        name={r.action === "boost" ? "up" : r.action === "hide" ? "eyeoff" : "down"}
                        className="h-4 w-4"
                      />
                    </span>
                    <span className="flex-1 text-sm">{ruleText(r)}</span>
                    <span className="mono text-[11px] text-[var(--muted)]">
                      {(r.weight ?? 0.5).toFixed(1)}
                    </span>
                    <Icon name={off ? "x" : "check"} className="h-4 w-4 text-[var(--muted)]" />
                  </button>
                </li>
              );
            })}
            {compiled.rules.length === 0 && <li className="text-sm text-[var(--muted)]">—</li>}
          </ul>
          {result && result.unsupported.length > 0 && (
            <div
              className="mt-3 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2.5"
              data-testid="unsupported"
            >
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <Icon name="alert" className="h-3.5 w-3.5" />
                {t("unsupported")}
              </div>
              <ul className="space-y-0.5 text-sm">
                {result.unsupported.map((u) => (
                  <li key={u} className="line-through decoration-[var(--muted)]/50">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder={t("name")}
              className="field flex-1"
              data-testid="builder-name"
            />
            <button
              type="button"
              onClick={() => setIsPublic((v) => !v)}
              className={`press flex h-10 w-10 items-center justify-center rounded-full ${isPublic ? "bg-[var(--soft)]" : "bg-[var(--ink)] text-[var(--bg)]"}`}
              aria-label={t("public")}
              title={isPublic ? t("public") : "Private"}
            >
              <Icon name={isPublic ? "globe" : "lock"} className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="accent"
            className="mt-3 w-full"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            testId="builder-save"
          >
            <Icon name="check" className="h-4 w-4" />
            {t("save")}
          </Button>
        </section>
      )}

      {compiled && (
        <section className="mt-6 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Icon name="layers" className="h-3.5 w-3.5" />
            {t("preview")}
            <span className="flex-1" />
            {preview && (
              <span className="mono normal-case" data-testid="preview-meta">
                rank() {preview.ms.toFixed(1)}ms · {preview.hidden} hidden
              </span>
            )}
          </div>
          {cands.isPending && <PostSkeleton />}
          {preview?.items.length === 0 && <Empty text="—" />}
          <div data-testid="preview">
            {preview?.items.map((r) => (
              <div key={r.post.id} className="border-b border-[var(--line)]">
                <PostCard post={r.post} reasons={r.reasons} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
