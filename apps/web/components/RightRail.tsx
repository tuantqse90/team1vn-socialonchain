"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useBlock } from "wagmi";
import { api, qs } from "@/lib/api";
import { addressUrl, contracts, network } from "@/lib/chain";
import { displayName, profileHref, shortAddr } from "@/lib/format";
import { orbBackground } from "@/lib/orb";
import { useSession } from "@/lib/session";
import type { Author, ChannelStats } from "@/lib/types";
import { Avatar } from "./bits";
import { channelIcon, useChannelRate } from "./explore/channel";
import { Arrow } from "./feed/actions";
import { Icon } from "./Icon";
import { Verified } from "./kit";

/** Block mới nhất của chain đang dùng + số giây/block (trung bình trượt giữa các lần đọc). */
function useLiveBlock() {
  const block = useBlock({ watch: true });
  const num = block.data?.number ?? null;
  const ts = block.data?.timestamp ?? null;
  const prev = useRef<{ n: bigint; ts: bigint } | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (num === null || ts === null) return;
    const p = prev.current;
    if (p && num > p.n && ts >= p.ts) {
      const s = Number(ts - p.ts) / Number(num - p.n);
      setSecs((old) => (old === null ? s : old * 0.6 + s * 0.4));
    }
    prev.current = { n: num, ts };
  }, [num, ts]);
  return { number: num, secs };
}

/** Thẻ "chain đang chạy": số block nhảy theo thời gian thực + contract lõi (link explorer). */
function LiveCard() {
  const t = useTranslations("rail");
  const { number, secs } = useLiveBlock();
  const fuji = network.name === "fuji";
  const core: [string, string][] = contracts
    ? [
        ["IdentityRegistry", contracts.IdentityRegistry],
        ["SocialGraph", contracts.SocialGraph],
        ["Posts", contracts.Posts],
      ]
    : [];
  return (
    <section className="glow-border rounded-[22px]" data-testid="live-chain">
      <div className="rounded-[21px] bg-[var(--bg)] p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="live-dot" aria-hidden />
          <span>{fuji ? "Avalanche Fuji" : t("localChain")}</span>
          <span className="mono ml-auto rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] text-[var(--muted)] uppercase">
            {t("live")}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mono text-[10.5px] font-semibold text-[var(--muted)] uppercase">{t("block")}</div>
            <div className="mono h-[34px] overflow-hidden text-[26px] leading-[34px] font-bold tracking-tight tabular-nums">
              <span key={String(number)} className="tick">
                {number === null ? "…" : `#${number.toLocaleString("en-US")}`}
              </span>
            </div>
          </div>
          {/* Anvil chỉ đào block khi có tx: số giây/block vô nghĩa, chỉ hiện khi chain đào đều. */}
          {secs !== null && secs > 0 && secs <= 10 && (
            <div className="shrink-0 text-right">
              <div className="mono text-[10.5px] font-semibold text-[var(--muted)] uppercase">
                {t("perBlock")}
              </div>
              <div className="mono text-[17px] leading-[34px] font-bold tabular-nums">{secs.toFixed(1)}s</div>
            </div>
          )}
        </div>
        {core.length > 0 && (
          <ul className="mt-3 flex flex-col border-t border-[var(--line)] pt-2">
            {core.map(([name, addr]) => {
              const href = addressUrl(addr);
              const row = (
                <>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ok-tint)] text-[var(--ok-ink)]">
                    <Icon name="check" className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
                  <span className="mono text-[11.5px] text-[var(--muted)]">{shortAddr(addr)}</span>
                  {href && <Arrow className="h-3.5 w-3.5 text-[var(--muted)]" />}
                </>
              );
              return (
                <li key={name}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={t("verified")}
                      className="press -mx-2 flex h-9 items-center gap-2 rounded-xl px-2 hover:bg-[var(--soft)]"
                    >
                      {row}
                    </a>
                  ) : (
                    <span className="flex h-9 items-center gap-2">{row}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {fuji && <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">{t("verified")}</p>}
      </div>
    </section>
  );
}

function Trending() {
  const t = useTranslations("rail");
  const rate = useChannelRate();
  const q = useQuery({
    queryKey: ["channels"],
    queryFn: () => api<{ items: ChannelStats[] }>("/channels"),
    staleTime: 60_000,
  });
  const items = q.data?.items.slice(0, 5) ?? [];
  if (items.length === 0) return null;
  return (
    <section className="card-glass p-2">
      <h2 className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[15px] font-bold">
        <span className="inline-flex text-[var(--accent)]">
          <Icon name="flame" filled className="h-4 w-4" strokeWidth={1.4} />
        </span>
        {t("trending")}
      </h2>
      <ul className="stagger">
        {items.map((c, i) => (
          <li key={c.name}>
            <Link
              href={`/c/${c.name}`}
              className="press flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-[var(--soft)]"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]"
                style={{ background: orbBackground(`channel:${c.name}`) }}
              >
                <Icon name={channelIcon(c.name)} className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">/{c.name}</span>
                <span className="mono text-[11.5px] text-[var(--muted)]">{rate(c).text}</span>
              </span>
              <span className="mono text-[12px] font-bold text-[var(--muted)]">{i + 1}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Builders() {
  const t = useTranslations("rail");
  const { owner } = useSession();
  const viewer = owner?.toLowerCase();
  const q = useQuery({
    queryKey: ["builders", 5, viewer],
    queryFn: () => api<{ items: Author[] }>(`/builders${qs({ limit: 5, viewer })}`),
    staleTime: 60_000,
  });
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="card-glass p-2">
      <h2 className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[15px] font-bold">
        <span className="inline-flex text-[var(--accent)]">
          <Icon name="cube" className="h-4 w-4" strokeWidth={2.2} />
        </span>
        {t("builders")}
      </h2>
      <ul className="stagger">
        {items.map((a) => {
          const href = profileHref(a);
          const inner = (
            <>
              <Avatar author={a} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate text-[14px] font-semibold">{displayName(a)}</span>
                  <Verified count={a.contractsDeployed} size={14} />
                </span>
                <span className="mono block truncate text-[11.5px] text-[var(--muted)]">
                  {t("contracts", { n: a.contractsDeployed })}
                </span>
              </span>
            </>
          );
          return (
            <li key={a.address ?? `fid:${a.fid}`}>
              {href ? (
                <Link
                  href={href}
                  className="press flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-[var(--soft)]"
                >
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-3 px-2.5 py-2">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Cột phải trên màn rộng (≥1280px): chain live, kênh nổi, builder. Ẩn trên mobile/tablet. */
export function RightRail() {
  const t = useTranslations("rail");
  return (
    <aside
      aria-label={t("aside")}
      className="no-scrollbar sticky top-0 hidden h-dvh w-[320px] shrink-0 flex-col gap-3 overflow-y-auto py-4 pr-4 pl-5 xl:flex"
    >
      <LiveCard />
      <Trending />
      <Builders />
      <p className="mono px-2 pt-1 text-[10.5px] leading-relaxed text-[var(--muted)]">{t("footer")}</p>
    </aside>
  );
}
