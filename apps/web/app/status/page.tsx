"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { addressUrl } from "@/lib/chain";
import { shortAddr } from "@/lib/format";

type Status = {
  network: string;
  chainId: number;
  contracts: Record<string, unknown> | null;
  indexer: {
    lastBlock: number;
    headBlock: number;
    lagBlocks: number;
    updatedAt: string;
    lastError: string | null;
  } | null;
  counts: Record<string, number>;
  queues: { name: string; state: string; n: number }[];
  worker: { key: string; value: Record<string, unknown>; updated_at: string }[];
};

export default function StatusPage() {
  const t = useTranslations("status");
  const q = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status"), refetchInterval: 5_000 });
  const s = q.data;
  const healthy = s?.indexer && s.indexer.lagBlocks < 20 && !s.indexer.lastError;
  return (
    <div className="px-4 py-4" data-testid="status">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`h-3 w-3 rounded-full ${q.isError ? "bg-[var(--accent)]" : healthy ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        <h1 className="text-[22px] font-bold tracking-tight">{t("title")}</h1>
        <span className="mono ml-auto text-xs text-[var(--muted)]">
          {s?.network} · {s?.chainId}
        </span>
      </div>
      {q.isError && (
        <p className="flex items-center gap-2 text-sm text-[var(--accent)]">
          <Icon name="alert" className="h-4 w-4" /> API
        </p>
      )}
      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Tile label={t("lag")} value={s.indexer ? t("blocks", { n: s.indexer.lagBlocks }) : "—"} />
            <Tile label="block" value={s.indexer ? String(s.indexer.lastBlock) : "—"} />
            {Object.entries(s.counts).map(([k, v]) => (
              <Tile key={k} label={k} value={String(v)} />
            ))}
          </div>
          {s.indexer?.lastError && (
            <p className="mono break-all text-xs text-[var(--accent)]">{s.indexer.lastError}</p>
          )}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("queues")}
            </h2>
            {s.queues.length === 0 && <p className="text-sm text-[var(--muted)]">—</p>}
            <ul className="mono space-y-1 text-xs">
              {s.queues.map((x) => (
                <li
                  key={`${x.name}-${x.state}`}
                  className="flex justify-between rounded-xl bg-[var(--soft)] px-3 py-2"
                >
                  <span>{x.name}</span>
                  <span>
                    {x.state}: {x.n}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("jobs")}
            </h2>
            <ul className="mono space-y-1 text-xs">
              {s.worker.map((w) => (
                <li key={w.key} className="rounded-xl bg-[var(--soft)] px-3 py-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">{w.key}</span>
                    <span className="text-[var(--muted)]">{new Date(w.updated_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 break-all text-[var(--muted)]">
                    {JSON.stringify(w.value).slice(0, 200)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {s.contracts && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                contracts
              </h2>
              <ul className="mono space-y-1 text-xs">
                {Object.entries(s.contracts)
                  .filter(([, v]) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v as string))
                  .map(([k, v]) => (
                    <li key={k} className="flex justify-between rounded-xl bg-[var(--soft)] px-3 py-2">
                      <span>{k}</span>
                      {addressUrl(v as string) ? (
                        <a
                          href={addressUrl(v as string) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {shortAddr(v as string)}
                        </a>
                      ) : (
                        <span>{shortAddr(v as string)}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--soft)] p-3">
      <div className="mono text-[18px] font-semibold">{value}</div>
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
