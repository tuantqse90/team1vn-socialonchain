"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { IdCard, type IdField } from "@/components/IdCard";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { User } from "@/lib/types";
import s from "./onboarding.module.css";
import { StepBar, TopBar } from "./parts";
import { GOALS, LESS, type Picks, type Role, rulesFor, TOPICS, toggle } from "./picks";

type T = (key: string, values?: Record<string, string | number>) => string;

const short = (arr: string[]) =>
  arr.length === 0 ? "—" : arr.slice(0, 2).join(" · ") + (arr.length > 2 ? ` +${arr.length - 2}` : "");
const up = (v: string) => v.toLocaleUpperCase();

/** 3 trường trên thẻ theo vai trò (từ lựa chọn + số contract nếu là builder). */
export function roleFields(
  role: Role,
  picks: Picks,
  t: T,
  to: T,
  builder?: { contracts: number; chains: number } | null,
): IdField[] {
  const rules = rulesFor(role, picks).length;
  if (role === "builder") {
    const n = builder?.contracts ?? 0;
    return [
      { k: t("contract"), v: builder ? String(n) : "—" },
      { k: t("chain"), v: builder && n > 0 ? String(Math.max(1, builder.chains)) : "—" },
      { k: t("status"), v: builder && n > 0 ? t("verifiedValue") : "—" },
    ];
  }
  if (role === "student") {
    return [
      { k: t("goals"), v: short(picks.goals.map((g) => up(to(`goal_${g}`)))) },
      { k: t("rule"), v: String(rules) },
      { k: t("feed"), v: String(clientConfig.defaultFeeds.length + (rules > 0 ? 1 : 0)) },
    ];
  }
  return [
    { k: t("see"), v: short(picks.topics.map((x) => up(to(`topic_${x}`)))) },
    { k: t("less"), v: short(picks.less.map((x) => up(to(`less_${x}`)))) },
    { k: t("rule"), v: String(rules) },
  ];
}

/** Thẻ trống cho màn chọn vai trò. */
export function blankFields(role: Role, t: T): IdField[] {
  const keys =
    role === "builder"
      ? ["contract", "chain", "status"]
      : role === "student"
        ? ["goals", "rule", "feed"]
        : ["see", "less", "rule"];
  return keys.map((k) => ({ k: t(k), v: "—" }));
}

function CardStage({ children }: { children: React.ReactNode }) {
  return <div className={`mx-auto mt-3 w-full max-w-[342px] ${s.stage}`}>{children}</div>;
}

/** Đếm từ 0 tới `target` theo từng nhịp (ô lưới bật theo). */
function useCountTo(target: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    setV(0);
    if (target <= 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    const step = Math.max(1, Math.ceil(target / 20));
    let cur = 0;
    let iv: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      iv = setInterval(() => {
        cur = Math.min(target, cur + step);
        setV(cur);
        if (cur >= target && iv) clearInterval(iv);
      }, 85);
    }, 350);
    return () => {
      clearTimeout(start);
      if (iv) clearInterval(iv);
    };
  }, [target]);
  return v;
}

/** Builder: chỉ quét địa chỉ ví đang kết nối (địa chỉ gõ tay thì không chứng minh được là của mình). */
export function BuilderStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  const { owner } = useSession();
  const { openConnectModal } = useConnectModal();
  const addr = owner?.toLowerCase();
  const q = useQuery({
    queryKey: ["onb-user", addr],
    queryFn: () => api<User>(`/users/${addr}`),
    enabled: Boolean(addr),
  });
  const n = q.data?.builder?.contractsDeployed ?? 0;
  const chains = Object.keys(q.data?.builder?.chains ?? {}).length;
  const count = useCountTo(q.isSuccess ? n : 0);
  const done = q.isSuccess && count >= n;
  const scanning = Boolean(addr) && !done && !q.isError;
  const cells = Math.min(n, 27);
  const lit = n > 27 ? Math.round((count * 27) / n) : count;
  const fields: IdField[] = [
    { k: tc("contract"), v: addr && q.isSuccess ? String(count) : "—" },
    { k: tc("chain"), v: done && n > 0 ? String(Math.max(1, chains)) : "—" },
    { k: tc("status"), v: done ? (n > 0 ? tc("verifiedValue") : "—") : scanning ? tc("scanning") : "—" },
  ];

  return (
    <>
      <TopBar onBack={onBack} />
      <CardStage>
        <IdCard
          variant="builder"
          handle={null}
          address={addr}
          fields={fields}
          verified={done && n > 0 ? tc("stampSub", { n }) : null}
          scanning={scanning}
          tilt
        />
      </CardStage>

      {!addr ? (
        <div className={`${s.rise} mt-10 flex flex-col gap-4`}>
          <h1 className={s.title}>{t("builderTitle")}</h1>
          <button
            type="button"
            onClick={() => openConnectModal?.()}
            className={s.bigBtn}
            data-testid="builder-connect"
          >
            <Icon name="wallet" className="h-[22px] w-[22px]" />
            {t("connectTitle")}
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <div role="status" className="flex items-end gap-3.5">
            <span className="text-[120px] font-extrabold leading-[.82] tracking-[-0.07em] tabular-nums">
              {q.isSuccess ? count : 0}
            </span>
            <span className="mono pb-1.5 text-[11px] font-semibold leading-[1.45] tracking-[.12em] text-[var(--muted)]">
              {t("unit1", { n })}
              <br />
              {t("unit2")}
            </span>
          </div>
          {cells > 0 && (
            <div aria-hidden className={`${s.cells} mt-6`}>
              {Array.from({ length: cells }, (_, i) => {
                const color =
                  i < Math.ceil(cells * 0.25)
                    ? "var(--ink)"
                    : cells > 4 && i >= cells - 2
                      ? "var(--muted)"
                      : "var(--accent)";
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: ô trang trí cố định
                  <span key={i} className={s.cell}>
                    {i < lit && <span className={s.cellOn} style={{ background: color }} />}
                  </span>
                );
              })}
            </div>
          )}
          {done && n === 0 && (
            <p className="mt-5 flex items-center gap-2 text-[15px] text-[var(--muted)]">
              <Icon name="clock" className="h-[18px] w-[18px]" />
              {t("noContracts")}
            </p>
          )}
          <p className="mono mt-5 flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <Icon name="wallet" className="h-4 w-4" />
            {shortAddr(addr)}
          </p>
        </div>
      )}

      <StepBar at={1} onNext={onNext} testId="role-next" />
    </>
  );
}

/** Sinh viên: chọn nhiều mục tiêu (2×2). Không hỏi trường học (thông tin cá nhân). */
export function StudentStep({
  picks,
  onPicks,
  onBack,
  onNext,
}: {
  picks: Picks;
  onPicks: (p: Picks) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  return (
    <>
      <TopBar onBack={onBack} />
      <CardStage>
        <IdCard variant="student" handle={null} fields={roleFields("student", picks, tc, t)} tilt />
      </CardStage>
      <h1 className={`${s.title} mt-8`}>{t("studentTitle")}</h1>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {GOALS.map((g) => {
          const on = picks.goals.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPicks({ ...picks, goals: toggle(picks.goals, g.id) })}
              className={`${s.tile} ${on ? s.tileOn : ""}`}
              data-testid={`goal-${g.id}`}
            >
              <span className="flex items-start justify-between">
                <span className={on ? "text-[var(--accent)]" : ""}>
                  <Icon name={g.icon} className="h-7 w-7" strokeWidth={2} />
                </span>
                {on && (
                  <span className="anim-pop flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3.4} />
                  </span>
                )}
              </span>
              <span className="text-[20px] font-extrabold leading-tight tracking-[-0.025em]">
                {t(`goal_${g.id}`)}
              </span>
            </button>
          );
        })}
      </div>
      <StepBar at={1} onNext={onNext} testId="role-next" />
    </>
  );
}

/** Người dùng: chủ đề muốn đọc (gạch chân đỏ) + "BỚT" (gạch ngang). */
export function ReaderStep({
  picks,
  onPicks,
  onBack,
  onNext,
}: {
  picks: Picks;
  onPicks: (p: Picks) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  return (
    <>
      <TopBar onBack={onBack} />
      <CardStage>
        <IdCard variant="reader" handle={null} fields={roleFields("reader", picks, tc, t)} tilt />
      </CardStage>
      <h1 className={`${s.title} mt-8`}>{t("readerTitle")}</h1>
      <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-0.5">
        {TOPICS.map((x) => {
          const on = picks.topics.includes(x.id);
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPicks({ ...picks, topics: toggle(picks.topics, x.id) })}
              className={`${s.word} text-[28px] ${on ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}
              data-testid={`topic-${x.id}`}
            >
              {t(`topic_${x.id}`)}
              <span aria-hidden className={s.underline} style={{ transform: `scaleX(${on ? 1 : 0})` }} />
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5">
        <span className="mono text-[11px] font-bold tracking-[.14em] text-[var(--red-ink)]">{t("less")}</span>
        {LESS.map((x) => {
          const on = picks.less.includes(x.id);
          const name = t(`less_${x.id}`);
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              aria-label={t("lessAria", { x: name })}
              onClick={() => onPicks({ ...picks, less: toggle(picks.less, x.id) })}
              className={`${s.word} px-0.5 text-[24px] font-bold ${on ? "text-[var(--muted)]" : "text-[var(--ink)]"}`}
              data-testid={`less-${x.id}`}
            >
              {name}
              <span
                aria-hidden
                className={s.strike}
                style={{ transform: `scaleX(${on ? 1 : 0}) rotate(-4deg)` }}
              />
            </button>
          );
        })}
      </div>
      <StepBar at={1} onNext={onNext} testId="role-next" />
    </>
  );
}
