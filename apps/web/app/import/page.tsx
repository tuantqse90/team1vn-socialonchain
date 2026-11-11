"use client";

import { socialGraphAbi } from "@socialonchain/protocol";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Empty, Ring } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { ApiError, api, qs, track } from "@/lib/api";
import { contracts } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";

type Preview = {
  farcaster: { fid: number; username: string; verified: boolean };
  toFollow: { fid: number; username: string; address: string }[];
  pending: { fid: number; username: string }[];
  alreadyFollowing: number;
  estimate: { txs: number; gas: number; batchSize: number };
  mode: string;
};

export default function ImportPage() {
  const t = useTranslations("import");
  const router = useRouter();
  const { status, owner } = useSession();
  const write = useSessionWrite();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [done, setDone] = useState(false);
  /** Batch bị lỗi (sau khi đã tự thử lại 1 lần): bấm lại sẽ chạy tiếp từ batch này, không follow lại từ đầu. */
  const [resumeAt, setResumeAt] = useState(0);

  if (status !== "ready") {
    return (
      <div className="py-10">
        <Empty icon="arch" text={t("title")} />
        <div className="flex justify-center">
          <Link
            href="/welcome"
            className="press rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            <Icon name="userplus" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  async function load() {
    const v = input.trim().replace(/^@/, "");
    if (!v) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setResumeAt(0);
    setDone(false);
    try {
      const p = await api<Preview>(
        `/import/farcaster/preview${qs(/^\d+$/.test(v) ? { fid: v } : { username: v })}`,
      );
      setPreview(p);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "404" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!preview || !contracts || !owner) return;
    const graph = contracts.SocialGraph;
    setBusy(true);
    const size = preview.estimate.batchSize;
    const targets = preview.toFollow.map((x) => x.address as `0x${string}`);
    const n = Math.ceil(targets.length / size);
    const send = (i: number) =>
      write(t("progress", { i: i + 1, n }), {
        address: graph,
        abi: socialGraphAbi,
        functionName: "followMany",
        args: [owner, targets.slice(i * size, (i + 1) * size)],
      });
    let ok = true;
    for (let i = resumeAt; i < n; i++) {
      setProgress({ i: i + 1, n });
      ok = await send(i);
      if (!ok) {
        // Lỗi RPC/nonce thoáng qua: tự thử lại 1 lần, rồi mới dừng cho người dùng bấm lại.
        await new Promise((r) => setTimeout(r, 1500));
        ok = await send(i);
      }
      if (!ok) {
        setResumeAt(i);
        break;
      }
    }
    if (ok && preview.pending.length > 0) {
      await api("/import/farcaster/pending", { method: "POST", json: { targets: preview.pending } });
    }
    setBusy(false);
    if (ok) {
      setResumeAt(0);
      track("import_done", { followed: targets.length, pending: preview.pending.length });
      setDone(true);
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8a63d2] text-white">
          <Icon name="arch" className="h-5 w-5" />
        </span>
        <h1 className="text-[20px] font-bold tracking-tight">{t("title")}</h1>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder={t("input")}
          className="field flex-1"
          data-testid="import-input"
        />
        <Button
          variant="solid"
          onClick={() => void load()}
          disabled={busy || !input.trim()}
          testId="import-preview"
        >
          {busy && !preview ? <span className="spinner" /> : <Icon name="search" className="h-4 w-4" />}
        </Button>
      </div>
      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--accent)]">
          <Icon name="alert" className="h-4 w-4" />
          {error}
        </p>
      )}
      {preview && (
        <div className="mt-5 space-y-3" data-testid="import-result">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">@{preview.farcaster.username}</span>
            <span className="mono text-[var(--muted)]">fid {preview.farcaster.fid}</span>
            {preview.farcaster.verified && <Icon name="verified" className="h-4 w-4 text-[var(--accent)]" />}
            {preview.mode === "fixture" && (
              <span className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                fixture
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon="userplus" n={preview.toFollow.length} label={t("toFollow")} />
            <Stat icon="lock" n={preview.pending.length} label={t("pending")} />
            <Stat icon="check" n={preview.alreadyFollowing} label={t("already")} />
          </div>
          <p className="mono text-xs text-[var(--muted)]">
            {t("estimate", { txs: preview.estimate.txs, gas: preview.estimate.gas.toLocaleString() })}
          </p>
          {done ? (
            <Button variant="solid" className="w-full" onClick={() => router.push("/")} testId="import-done">
              <Icon name="check" className="h-4 w-4" /> {t("done")}
            </Button>
          ) : (
            <Button
              variant="accent"
              className="w-full"
              onClick={() => void start()}
              disabled={busy || (preview.toFollow.length === 0 && preview.pending.length === 0)}
              testId="import-start"
            >
              {progress && busy ? (
                <>
                  <Ring value={progress.i / progress.n} size={18} />
                  {t("progress", progress)}
                </>
              ) : resumeAt > 0 ? (
                <>
                  <Icon name="bolt" className="h-4 w-4" />
                  {t("retry", {
                    i: resumeAt + 1,
                    n: Math.ceil(preview.toFollow.length / preview.estimate.batchSize),
                  })}
                </>
              ) : (
                <>
                  <Icon name="userplus" className="h-4 w-4" />
                  {t("start", { n: preview.toFollow.length })}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, n, label }: { icon: Parameters<typeof Icon>[0]["name"]; n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-[var(--soft)] p-3" title={label}>
      <Icon name={icon} className="h-4 w-4 text-[var(--muted)]" />
      <div className="mt-1 text-[22px] font-bold tabular-nums">{n}</div>
      <div className="truncate text-[11px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
