"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Empty } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { PostCard } from "@/components/PostCard";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Post } from "@/lib/types";

type Report = {
  id: number;
  postId: string;
  reason: string;
  note: string | null;
  reporter: string;
  createdAt: string;
  post: Post | null;
};
type Block = { subject: string; kind: string; reason: string; createdAt: string };
type Metrics = {
  active: { dau: number; wau: number; mau: number } | undefined;
  retention: { cohort: string; users: number; d1: number; d7: number }[];
  feedCreatorsPct: number;
  compiles: { day: string; n: number }[];
  distribution: { feed: string; n: number }[];
  quotaHits: { kind: string; users: number }[];
  proUsers: number;
};

export default function AdminPage() {
  const t = useTranslations("admin");
  const { me } = useSession();
  const [tab, setTab] = useState<"reports" | "blocklist" | "metrics">("reports");
  if (!me?.admin) return <Empty icon="lock" text="403" />;
  return (
    <div className="py-4">
      <h1 className="px-4 pb-3 text-[22px] font-bold tracking-tight">{t("title")}</h1>
      <div className="flex gap-1 px-4 pb-3">
        {(["reports", "blocklist", "metrics"] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={`press h-9 flex-1 rounded-full text-[13px] font-medium ${tab === x ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)]"}`}
          >
            {t(x)}
          </button>
        ))}
      </div>
      {tab === "reports" && <Reports />}
      {tab === "blocklist" && <Blocklist />}
      {tab === "metrics" && <MetricsView />}
    </div>
  );
}

function Reports() {
  const t = useTranslations("admin");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => api<{ items: Report[] }>("/admin/reports"),
  });
  async function act(id: number, action: "hide_post" | "block_author" | "dismiss") {
    await api(`/admin/reports/${id}`, { method: "POST", json: { action } });
    await qc.invalidateQueries();
  }
  if (q.data?.items.length === 0) return <Empty icon="check" text="—" />;
  return (
    <ul>
      {q.data?.items.map((r) => (
        <li key={r.id} className="border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2 px-4 pt-3 text-xs">
            <Icon name="flag" className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="font-semibold">{r.reason}</span>
            {r.note && <span className="text-[var(--muted)]">{r.note}</span>}
          </div>
          {r.post && <PostCard post={r.post} />}
          <div className="flex gap-2 px-4">
            <Button variant="outline" onClick={() => void act(r.id, "hide_post")} className="h-8 text-xs">
              <Icon name="eyeoff" className="h-3.5 w-3.5" /> {t("hide")}
            </Button>
            <Button variant="outline" onClick={() => void act(r.id, "block_author")} className="h-8 text-xs">
              <Icon name="lock" className="h-3.5 w-3.5" /> {t("block")}
            </Button>
            <Button variant="ghost" onClick={() => void act(r.id, "dismiss")} className="h-8 text-xs">
              {t("dismiss")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Blocklist() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-blocklist"],
    queryFn: () => api<{ items: Block[] }>("/admin/blocklist"),
  });
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState<"author" | "post">("author");
  async function add() {
    if (!subject.trim()) return;
    await api("/admin/blocklist", {
      method: "POST",
      json: { subject: subject.trim(), kind, reason: "manual" },
    });
    setSubject("");
    await qc.invalidateQueries({ queryKey: ["admin-blocklist"] });
  }
  async function remove(s: string) {
    await api(`/admin/blocklist/${encodeURIComponent(s)}`, { method: "DELETE" });
    await qc.invalidateQueries({ queryKey: ["admin-blocklist"] });
  }
  return (
    <div className="px-4">
      <div className="flex gap-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="0x… / oc:… / fid:…"
          className="field flex-1"
        />
        <button
          type="button"
          onClick={() => setKind(kind === "author" ? "post" : "author")}
          className="press h-10 rounded-full bg-[var(--soft)] px-3 text-xs"
        >
          {kind}
        </button>
        <Button variant="solid" onClick={() => void add()}>
          <Icon name="plus" className="h-4 w-4" />
        </Button>
      </div>
      <ul className="mono mt-3 space-y-1 text-xs">
        {q.data?.items.map((b) => (
          <li key={b.subject} className="flex items-center gap-2 rounded-xl bg-[var(--soft)] px-3 py-2">
            <span className="flex-1 truncate">{b.subject}</span>
            <span className="text-[var(--muted)]">{b.kind}</span>
            <button type="button" onClick={() => void remove(b.subject)} aria-label="remove">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricsView() {
  const t = useTranslations("admin");
  const q = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api<Metrics>("/admin/metrics") });
  const m = q.data;
  if (!m) return <div className="skeleton mx-4 h-24 rounded-2xl" />;
  const max = Math.max(1, ...m.compiles.map((c) => c.n));
  return (
    <div className="space-y-4 px-4" data-testid="metrics">
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t("dau")} value={m.active?.dau ?? 0} />
        <Tile label={t("wau")} value={m.active?.wau ?? 0} />
        <Tile label="MAU" value={m.active?.mau ?? 0} />
        <Tile label={t("feedCreators")} value={`${m.feedCreatorsPct}%`} />
        <Tile label={t("proUsers")} value={m.proUsers} />
        <Tile label="quota hits" value={m.quotaHits.reduce((a, b) => a + b.users, 0)} />
      </div>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          compiles / day
        </h2>
        <div className="flex h-24 items-end gap-1">
          {[...m.compiles].reverse().map((c) => (
            <div
              key={c.day}
              className="flex-1 rounded-t bg-[var(--ink)]"
              style={{ height: `${(c.n / max) * 100}%` }}
              title={`${c.day}: ${c.n}`}
            />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">retention</h2>
        <table className="mono w-full text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="text-left font-normal">cohort</th>
              <th className="text-right font-normal">n</th>
              <th className="text-right font-normal">D1</th>
              <th className="text-right font-normal">D7</th>
            </tr>
          </thead>
          <tbody>
            {m.retention.map((r) => (
              <tr key={r.cohort}>
                <td>{r.cohort}</td>
                <td className="text-right">{r.users}</td>
                <td className="text-right">{r.users ? Math.round((r.d1 / r.users) * 100) : 0}%</td>
                <td className="text-right">{r.users ? Math.round((r.d7 / r.users) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          feed views (7d)
        </h2>
        <ul className="mono space-y-1 text-xs">
          {m.distribution.map((d) => (
            <li key={d.feed} className="flex justify-between">
              <span>{d.feed}</span>
              <span>{d.n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--soft)] p-3">
      <div className="mono text-[18px] font-semibold">{value}</div>
      <div className="truncate text-[11px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
