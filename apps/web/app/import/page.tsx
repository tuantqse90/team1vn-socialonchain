"use client";

import { socialGraphAbi } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type CSSProperties, useMemo, useState } from "react";
import type { Hash } from "viem";
import { Empty, Sheet } from "@/components/bits";
import { Icon, type IconName } from "@/components/Icon";
import { BigRing, CountUp } from "@/components/kit";
import { useTopUp } from "@/components/TopUpSheet";
import { ApiError, api, qs, track } from "@/lib/api";
import { contracts, txUrl } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { publicClient, useSessionWriteTx } from "@/lib/tx";

type Preview = {
  farcaster: { fid: number; username: string; verified: boolean };
  toFollow: { fid: number; username: string; address: string }[];
  pending: { fid: number; username: string }[];
  alreadyFollowing: number;
  estimate: { txs: number; gas: number; batchSize: number };
  mode: string;
};

type Person = { key: string; ini: string; idx: number; pending: boolean };

/** Màu avatar chữ cái: chỉ dùng token (đen, xám, đỏ, hồng, graphite). */
const TONES = [
  "bg-[var(--ink)] text-[var(--bg)]",
  "bg-[var(--line)] text-[var(--ink)]",
  "bg-[var(--accent)] text-[var(--accent-ink)]",
  "bg-[var(--blush)] text-[var(--red-ink)]",
  "bg-[var(--graphite)] text-[var(--bg)]",
];
const GRID = 21;

const avax = (wei: bigint) => Number(wei) / 1e18;

/** Lấy mẫu đều tối đa 21 người (cả người có ví lẫn hàng chờ) cho lưới avatar. */
function samplePeople(p: Preview): Person[] {
  const all = p.toFollow.length + p.pending.length;
  if (all === 0) return [];
  const size = Math.min(GRID, all);
  const nP = Math.min(p.pending.length, Math.round((size * p.pending.length) / all));
  const nF = Math.min(p.toFollow.length, size - nP);
  const ini = (u: string) =>
    u
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "?";
  const f = Array.from({ length: nF }, (_, i) => {
    const idx = Math.floor((i * p.toFollow.length) / nF);
    const x = p.toFollow[idx] as Preview["toFollow"][number];
    return { key: `f${x.fid}`, ini: ini(x.username), idx, pending: false };
  });
  const q = Array.from({ length: nP }, (_, j) => {
    const x = p.pending[Math.floor((j * p.pending.length) / nP)] as Preview["pending"][number];
    return { key: `p${x.fid}`, ini: ini(x.username), idx: -1, pending: true };
  });
  const slots = new Set(q.map((_, j) => Math.floor(((j + 0.5) * (nF + nP)) / nP)));
  const out: Person[] = [];
  let fi = 0;
  let qi = 0;
  for (let s = 0; s < nF + nP; s++) {
    const next = (slots.has(s) && qi < q.length) || fi >= f.length ? q[qi++] : f[fi++];
    if (next) out.push(next);
  }
  return out;
}

export default function ImportPage() {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const router = useRouter();
  const { status, owner, sessionBalance } = useSession();
  const write = useSessionWriteTx();
  const topUp = useTopUp();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  /** Số lô followMany đã lên chain. */
  const [confirmed, setConfirmed] = useState(0);
  const [hashes, setHashes] = useState<Hash[]>([]);
  const [spent, setSpent] = useState(0n);
  const [startBal, setStartBal] = useState<bigint | null>(null);
  const [done, setDone] = useState(false);
  const [showTxs, setShowTxs] = useState(false);
  /** Batch bị lỗi (sau khi đã tự thử lại 1 lần): bấm lại sẽ chạy tiếp từ batch này, không follow lại từ đầu. */
  const [resumeAt, setResumeAt] = useState(0);

  const gasPrice = useQuery({
    queryKey: ["gas-price"],
    queryFn: () => publicClient.getGasPrice(),
    enabled: Boolean(preview),
    staleTime: 30_000,
  });
  const people = useMemo(() => (preview ? samplePeople(preview) : []), [preview]);

  if (status !== "ready") {
    return (
      <div className="py-10">
        <Empty icon="arch" text={t("title")} />
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

  async function load() {
    const v = input.trim().replace(/^@/, "");
    if (!v || running) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setResumeAt(0);
    setConfirmed(0);
    setHashes([]);
    setSpent(0n);
    setStartBal(null);
    setDone(false);
    try {
      const p = await api<Preview>(
        `/import/farcaster/preview${qs(/^\d+$/.test(v) ? { fid: v } : { username: v })}`,
      );
      setPreview(p);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "404" : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const size = preview?.estimate.batchSize ?? 50;
  const targets = preview?.toFollow ?? [];
  const n = Math.ceil(targets.length / size);
  const batches = Array.from({ length: n }, (_, j) => Math.min(size, targets.length - j * size));
  const remainingTx = Math.max(0, n - resumeAt);
  const estimateWei =
    preview && gasPrice.data !== undefined && preview.estimate.txs > 0
      ? (BigInt(preview.estimate.gas) * gasPrice.data * BigInt(remainingTx)) / BigInt(preview.estimate.txs)
      : undefined;
  const short = estimateWei !== undefined && sessionBalance !== undefined && estimateWei > sessionBalance;
  const started = running || done || confirmed > 0;
  const followed = Math.min(targets.length, confirmed * size);
  const total = targets.length + (preview?.pending.length ?? 0);
  const centre = started ? followed : targets.length;
  const liveBal = startBal !== null ? startBal - spent : sessionBalance;

  async function start() {
    if (!preview || !contracts || !owner || running) return;
    if (short) {
      topUp.open("low");
      return;
    }
    const graph = contracts.SocialGraph;
    const list = preview.toFollow.map((x) => x.address as `0x${string}`);
    const send = (i: number) =>
      write(t("progress", { i: i + 1, n }), {
        address: graph,
        abi: socialGraphAbi,
        functionName: "followMany",
        args: [owner, list.slice(i * size, (i + 1) * size)],
      });
    setRunning(true);
    if (startBal === null) setStartBal(sessionBalance ?? null);
    let ok = true;
    for (let i = resumeAt; i < n; i++) {
      let r = await send(i);
      if (!r.ok) {
        // Lỗi RPC/nonce thoáng qua: tự thử lại 1 lần, rồi mới dừng cho người dùng bấm lại.
        await new Promise((res) => setTimeout(res, 1500));
        r = await send(i);
      }
      if (!r.ok) {
        ok = false;
        setResumeAt(i);
        break;
      }
      const { hash, fee } = r;
      setHashes((h) => {
        const next = [...h];
        next[i] = hash;
        return next;
      });
      setSpent((s) => s + fee);
      setConfirmed(i + 1);
    }
    if (ok && preview.pending.length > 0) {
      await api("/import/farcaster/pending", { method: "POST", json: { targets: preview.pending } });
    }
    setRunning(false);
    if (ok) {
      setResumeAt(0);
      track("import_done", { followed: list.length, pending: preview.pending.length });
      setDone(true);
    }
  }

  const gasLabel = started
    ? `−${avax(spent).toFixed(4)}`
    : estimateWei !== undefined
      ? `≈${avax(estimateWei).toFixed(4)}`
      : "≈…";
  const gasAria = started
    ? t("gasSpent", { n: avax(spent).toFixed(4) })
    : t("gasEstimate", { n: estimateWei !== undefined ? avax(estimateWei).toFixed(4) : "…" });

  return (
    <div className="px-4 pb-8">
      <header className="relative flex h-14 items-center">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={tc("back")}
          className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full"
        >
          <Icon name="left" className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[16px] font-bold">{t("title")}</h1>
      </header>

      <div className="mt-2 flex h-12 items-center gap-1 rounded-[14px] bg-[var(--soft)] pl-2 pr-1">
        <span
          role="img"
          aria-label="Farcaster"
          title="Farcaster"
          className="mono mr-1.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--ink)] text-[11px] font-semibold text-[var(--bg)]"
        >
          FC
        </span>
        <label htmlFor="import-fc" className="text-[16px] text-[var(--muted)]">
          @<span className="sr-only">{t("input")}</span>
        </label>
        <input
          id="import-fc"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder={t("input")}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--muted)]"
          data-testid="import-input"
        />
        {preview && (
          <span className="mono flex h-9 shrink-0 items-center gap-1 rounded-[10px] bg-[var(--bg)] px-2.5 text-[12px] font-semibold">
            fid {preview.farcaster.fid}
            {preview.farcaster.verified && (
              <span role="img" aria-label={t("verified")} className="text-[var(--accent)]">
                <Icon name="verified" className="h-3.5 w-3.5" filled />
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || running || !input.trim()}
          aria-label={t("preview")}
          title={t("preview")}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          data-testid="import-preview"
        >
          {loading ? <span className="spinner" aria-hidden /> : <Icon name="search" className="h-5 w-5" />}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-[var(--err-ink)]">
          <Icon name="alert" className="h-4 w-4" />
          {error === "404" ? t("notFound") : error}
        </p>
      )}

      {preview && (
        <div className="mt-5" data-testid="import-result">
          {preview.mode === "fixture" && (
            <span className="mono mb-2 inline-flex rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              fixture
            </span>
          )}
          <div className="flex items-center gap-5">
            <BigRing
              value={total ? centre / total : 0}
              size={132}
              stroke={14}
              label={t("ringAria", { done: centre, total })}
            >
              <span className="text-[32px] font-extrabold tracking-[-0.04em]">
                <CountUp value={centre} duration={500} />
              </span>
              <span className="mono text-[11px] text-[var(--muted)]">/ {total}</span>
            </BigRing>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <Stat
                icon="userplus"
                tone="bg-[var(--blush)] text-[var(--red-ink)]"
                n={targets.length}
                label={t("withWallet")}
              />
              <Stat
                icon="clock"
                tone="bg-[var(--soft)] text-[var(--muted)]"
                n={preview.pending.length}
                label={t("queued")}
              />
              {preview.alreadyFollowing > 0 && (
                <Stat
                  icon="check"
                  tone="bg-[var(--soft)] text-[var(--ink)]"
                  n={preview.alreadyFollowing}
                  label={t("already")}
                />
              )}
            </div>
          </div>

          {people.length > 0 && (
            <div aria-hidden className="mt-6 grid grid-cols-7 justify-items-center gap-y-3">
              {people.map((p, i) => {
                const ok = !p.pending && p.idx < followed;
                return (
                  <span
                    key={p.key}
                    className="anim-pop relative h-10 w-10"
                    style={{ animationDelay: `${200 + i * 25}ms` }}
                  >
                    <span
                      className={`flex h-full w-full items-center justify-center rounded-full text-[12px] font-bold ${
                        TONES[i % TONES.length]
                      } ${p.pending ? "opacity-40" : ""}`}
                    >
                      {p.ini}
                    </span>
                    {ok && (
                      <span className="anim-pop absolute -bottom-[3px] -right-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] text-[var(--accent-ink)]">
                        <Icon name="check" className="h-[9px] w-[9px]" strokeWidth={4} />
                      </span>
                    )}
                    {p.pending && (
                      <span className="absolute -bottom-[3px] -right-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--line)] text-[var(--ink)]">
                        <Icon name="clock" className="h-[10px] w-[10px]" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {batches.length > 0 && (
            <div
              role="img"
              aria-label={t("batchAria", { n, size, k: confirmed })}
              className="mt-6 flex items-center gap-1.5"
            >
              {batches.map((b, j) => {
                const filled = confirmed > j;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: lô theo thứ tự cố định
                    key={j}
                    className="relative flex h-9 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--soft)]"
                    style={{ flex: b } as CSSProperties}
                  >
                    <span
                      className="absolute inset-0 origin-left bg-[var(--ink)]"
                      style={{
                        transform: `scaleX(${filled ? 1 : 0})`,
                        transition: "transform .32s var(--ease-io)",
                      }}
                    />
                    <span
                      className={`mono relative text-[12px] font-semibold ${filled ? "text-[var(--bg)]" : "text-[var(--muted)]"}`}
                      style={{ transition: "color .2s .15s" }}
                    >
                      {b}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          <div className="mono mt-4 flex h-11 items-center gap-2.5 text-[13px] font-semibold">
            <span
              role="img"
              aria-label={t("gasFromKey")}
              title={t("gasFromKey")}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
            >
              <Icon name="key" className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span aria-live="polite" className="text-[15px] tabular-nums">
              {liveBal !== undefined ? <CountUp value={avax(liveBal)} decimals={4} duration={600} /> : "…"}
            </span>
            <span className="text-[var(--muted)]">AVAX</span>
            <span
              role="img"
              aria-label={gasAria}
              title={gasAria}
              className={`ml-auto flex h-[34px] items-center gap-1.5 rounded-full pl-2.5 pr-3 tabular-nums transition-colors ${
                started
                  ? "bg-[var(--blush)] text-[var(--red-ink)]"
                  : short
                    ? "bg-[var(--warn-tint)] text-[var(--warn-ink)]"
                    : "bg-[var(--soft)] text-[var(--ink)]"
              }`}
            >
              <Icon
                name={short && !started ? "alert" : "fuel"}
                className="h-[15px] w-[15px]"
                strokeWidth={2.2}
              />
              {gasLabel}
            </span>
          </div>

          <div className={`mt-5 grid gap-2.5 ${done ? "grid-cols-[56px_minmax(0,1fr)]" : "grid-cols-1"}`}>
            {done && (
              <button
                type="button"
                onClick={() => setShowTxs(true)}
                aria-label={t("viewTxs", { n: hashes.filter(Boolean).length })}
                title={t("viewTxs", { n: hashes.filter(Boolean).length })}
                className="anim-pop press flex h-14 items-center justify-center rounded-[18px] bg-[var(--soft)] text-[var(--ink)]"
              >
                <Icon name="external" className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            )}
            {done ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="press flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[var(--ink)] text-[17px] font-semibold text-[var(--bg)]"
                data-testid="import-done"
              >
                <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={2.4} />
                {t("followedN", { n: targets.length })}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                disabled={running || (targets.length === 0 && preview.pending.length === 0)}
                className={`press flex h-14 items-center justify-center gap-2.5 rounded-[18px] text-[17px] font-semibold transition-colors ${
                  running
                    ? "bg-[var(--graphite)] text-[var(--bg)]"
                    : "bg-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40"
                }`}
                data-testid="import-start"
              >
                {running ? (
                  <>
                    <span className="spinner" aria-hidden />
                    <span className="mono">
                      followMany {Math.min(confirmed + 1, n)}/{n}
                    </span>
                  </>
                ) : resumeAt > 0 ? (
                  <>
                    <Icon name="refresh" className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    {t("retry", { i: resumeAt + 1, n })}
                  </>
                ) : targets.length === 0 ? (
                  <>
                    <Icon name="clock" className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    {t("queueOnly", { n: preview.pending.length })}
                  </>
                ) : (
                  t("startTx", { n: targets.length, txs: n })
                )}
              </button>
            )}
          </div>
        </div>
      )}

      <Sheet
        open={showTxs}
        onClose={() => setShowTxs(false)}
        title={t("viewTxs", { n: hashes.filter(Boolean).length })}
      >
        <ul className="space-y-1">
          {hashes.map((h, i) => {
            if (!h) return null;
            const url = txUrl(h);
            const inner = (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--soft)]">
                  <Icon name="check" className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.4} />
                </span>
                <span className="mono flex-1 text-[13px] font-semibold">
                  followMany {i + 1}/{n}
                </span>
                <span className="mono text-[12px] text-[var(--muted)]">{shortAddr(h)}</span>
                {url && <Icon name="external" className="h-4 w-4 text-[var(--muted)]" />}
              </>
            );
            return (
              <li key={h}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="press flex min-h-11 items-center gap-3 rounded-2xl px-2 hover:bg-[var(--soft)]"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 px-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

function Stat({ icon, tone, n, label }: { icon: IconName; tone: string; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-col">
        <b className="text-[20px] leading-tight tracking-[-0.02em] tabular-nums">{n}</b>
        <span className="text-[12px] text-[var(--muted)]">{label}</span>
      </span>
    </div>
  );
}
