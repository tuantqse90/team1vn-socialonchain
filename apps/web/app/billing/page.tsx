"use client";

import { planPaymentsAbi, testUSDAbi } from "@socialonchain/protocol";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { formatUnits, type Hash, parseSignature } from "viem";
import { useReadContracts } from "wagmi";
import { CoinDrop } from "@/components/billing/CoinDrop";
import { type PayPhase, PayStepper } from "@/components/billing/PayStepper";
import { QuotaRing } from "@/components/billing/QuotaRing";
import { prefersReducedMotion, shortDuration, untilUtcMidnight, useNow } from "@/components/billing/time";
import { Empty } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Burst, CountUp } from "@/components/kit";
import { clientConfig } from "@/configs";
import { track as trackEvent } from "@/lib/api";
import { chain, contracts, txUrl } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";
import { useMainWallet } from "@/lib/wallet";

const PRO = clientConfig.plans[0];
const PLAN_ID = PRO?.id ?? 1;
const MONTH_SEC = 30 * 86_400;

export default function BillingPage() {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const router = useRouter();
  const { status, owner, me, refresh } = useSession();
  const { trackTx } = useTx();
  const main = useMainWallet();
  const now = useNow(30_000);

  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetHash, setFaucetHash] = useState<Hash | null>(null);
  const [coins, setCoins] = useState(0);
  /** Giữ số dư cũ trên màn hình tới khi xu "rơi" xong, rồi mới đếm lên. */
  const [held, setHeld] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [payHash, setPayHash] = useState<Hash | null>(null);
  const [burst, setBurst] = useState(0);
  const [nudge, setNudge] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const faucetRef = useRef<HTMLSpanElement>(null);
  const coinRef = useRef<HTMLSpanElement>(null);

  const enabled = Boolean(owner && contracts);
  const reads = useReadContracts({
    contracts:
      contracts && owner
        ? [
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "balanceOf", args: [owner] },
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "lastFaucetAt", args: [owner] },
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "faucetCooldown" },
            {
              address: contracts.PlanPayments,
              abi: planPaymentsAbi,
              functionName: "quote",
              args: [PLAN_ID, 1],
            },
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "nonces", args: [owner] },
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "name" },
            { address: contracts.TestUSD, abi: testUSDAbi, functionName: "faucetAmount" },
            { address: contracts.PlanPayments, abi: planPaymentsAbi, functionName: "MONTH" },
          ]
        : [],
    query: { enabled, refetchInterval: 15_000 },
  });
  const [balance, lastFaucet, cooldown, price, nonce, tokenName, faucetAmount, month] = (
    reads.data ?? []
  ).map((r) => r.result) as [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    string | undefined,
    bigint | undefined,
    bigint | undefined,
  ];

  if (status === "disconnected" || !contracts) return <Empty icon="coin" text={t("title")} />;

  const ent = me?.entitlements;
  const pro = ent?.plan === "pro";
  const ready = status === "ready";
  const nextFaucet = lastFaucet && cooldown ? Number(lastFaucet + cooldown) : 0;
  // Chưa đọc xong lastFaucetAt/cooldown thì chưa cho bấm (tránh gửi tx sẽ revert vì đang cooldown).
  const faucetKnown = lastFaucet !== undefined && cooldown !== undefined;
  const faucetCool = faucetKnown && lastFaucet !== 0n && now < nextFaucet;
  const faucetReady = faucetKnown && !faucetCool;
  const faucetN = faucetAmount !== undefined ? formatUnits(faucetAmount, 6) : "10";
  const priceStr = price !== undefined ? formatUnits(price, 6) : String(PRO?.priceUsd ?? 5);
  const busy = phase === "permit" || phase === "tx";
  const short = price !== undefined && balance !== undefined && balance < price;
  const loading = price === undefined || balance === undefined;
  const shownBalance = held ?? balance;

  const freeLimits = !pro && ent ? ent.limits : clientConfig.freeLimits;
  const proLimits =
    pro && ent ? ent.limits : { compilesPerDay: PRO?.compilesPerDay ?? 0, maxFeeds: PRO?.maxFeeds ?? 0 };
  const limits = ent?.limits ?? clientConfig.freeLimits;
  const compiles = ent?.usage.compilesToday ?? 0;
  const feeds = ent?.usage.feeds ?? 0;
  const reset = shortDuration(untilUtcMidnight(now));
  const monthSec = month !== undefined ? Number(month) : MONTH_SEC;
  const monthDays = Math.round(monthSec / 86_400);
  const per = monthSec === MONTH_SEC ? t("perMonth") : t("perDays", { n: monthDays });
  const daysLeft = pro && ent?.proUntil ? Math.max(0, Math.ceil((ent.proUntil - now) / 86_400)) : 0;
  const upgraded = phase === "done";
  const faucetUrl = faucetHash ? txUrl(faucetHash) : null;
  const payUrl = payHash ? txUrl(payHash) : null;

  async function faucet() {
    const c = contracts;
    if (!c || faucetBusy || !faucetReady) return;
    setHeld(balance ?? null);
    setFaucetBusy(true);
    const r = await trackTx(t("faucetTx", { n: faucetN }), () =>
      main.writeContract({ address: c.TestUSD, abi: testUSDAbi, functionName: "faucet" }),
    );
    setFaucetBusy(false);
    await reads.refetch();
    if (r.ok) {
      setFaucetHash(r.hash);
      if (prefersReducedMotion()) setHeld(null);
      else setCoins((k) => k + 1);
    } else setHeld(null);
  }

  /** 1 chữ ký permit (EIP-2612) + 1 tx payWithPermit: không cần approve riêng. */
  async function pay() {
    if (short) {
      setNudge((k) => k + 1);
      return;
    }
    const c = contracts;
    if (!c || !owner || price === undefined || nonce === undefined || !tokenName || busy) return;
    setPhase("permit");
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const sig = await main.signTypedData({
        domain: { name: tokenName, version: "1", chainId: chain.id, verifyingContract: c.TestUSD },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: { owner, spender: c.PlanPayments, value: price, nonce, deadline },
      });
      const { r, s, v, yParity } = parseSignature(sig);
      const vv = Number(v ?? BigInt(yParity + 27));
      setPhase("tx");
      const res = await trackTx(t("buy", { price: priceStr }), () =>
        main.writeContract({
          address: c.PlanPayments,
          abi: planPaymentsAbi,
          functionName: "payWithPermit",
          args: [PLAN_ID, 1, deadline, vv, r, s],
        }),
      );
      if (res.ok) {
        trackEvent("pro_paid", { plan: PLAN_ID });
        setPayHash(res.hash);
        setPhase("done");
        setBurst((k) => k + 1);
        refresh();
      } else setPhase("idle");
    } catch {
      // người dùng huỷ ký permit
      setPhase("idle");
    } finally {
      await reads.refetch();
    }
  }

  const ctaLabel =
    phase === "permit"
      ? t("signPermit")
      : phase === "tx"
        ? t("sendTx")
        : short
          ? t("need", { price: priceStr })
          : pro
            ? t("renew")
            : t("getPro");
  const ctaOff = short && phase === "idle";

  return (
    <div className="px-4 pb-8">
      <header className="relative flex h-14 items-center justify-between">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/settings"))}
          aria-label={tc("back")}
          className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full"
        >
          <Icon name="left" className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-bold">{t("title")}</h1>
        <span
          key={pro ? "pro" : "free"}
          className={`mono flex h-[26px] items-center rounded-full px-2.5 text-[11.5px] font-bold tracking-[.1em] ${
            pro ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--soft)] text-[var(--ink)]"
          } ${upgraded ? "anim-pop" : ""}`}
        >
          {pro ? "PRO" : "FREE"}
        </span>
      </header>

      {/* Hai vòng quota lớn */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-2.5">
          <QuotaRing
            key={`c-${pro}`}
            used={compiles}
            limit={limits.compilesPerDay}
            label={t("compiles")}
            pop={upgraded}
          />
          <span className="flex items-center gap-1.5 text-[14px] font-semibold">
            <Icon name="code" className="h-[17px] w-[17px]" strokeWidth={2.1} />
            {t("compiles")}
          </span>
          <span
            role="img"
            aria-label={`${t("resetsIn")} ${reset}`}
            title={`${t("resetsIn")} ${reset}`}
            className={`mono flex h-[18px] items-center gap-1 text-[12px] font-semibold ${
              compiles >= limits.compilesPerDay ? "text-[var(--red-ink)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon name="refresh" className="h-3.5 w-3.5" strokeWidth={2.4} />
            {reset}
          </span>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <QuotaRing
            key={`f-${pro}`}
            used={feeds}
            limit={limits.maxFeeds}
            label={t("feedsLimit")}
            color="var(--ink)"
            pop={upgraded}
          />
          <span className="flex items-center gap-1.5 text-[14px] font-semibold">
            <Icon name="layers" className="h-[17px] w-[17px]" strokeWidth={2.1} />
            {t("feedsLimit")}
          </span>
          <span className="h-[18px]" />
        </div>
      </div>

      {/* Free vs Pro */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <div
          data-testid={pro ? undefined : "plan-card"}
          className="flex flex-col gap-2 rounded-[26px] bg-[var(--bg)] p-4"
          style={{
            boxShadow: `inset 0 0 0 2px ${pro ? "var(--line)" : "var(--ink)"}`,
            transition: "box-shadow .4s",
          }}
        >
          <div className="flex h-7 items-center justify-between">
            <span className="text-[18px] font-extrabold tracking-[-0.02em]">{t("free")}</span>
            {!pro && (
              <span
                role="img"
                aria-label={t("current")}
                title={t("current")}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
              >
                <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3.2} />
              </span>
            )}
          </div>
          <Price amount="0" unit="tUSD" muted />
          <Perks compiles={freeLimits.compilesPerDay} feeds={freeLimits.maxFeeds} muted />
        </div>

        <div
          key={`pro-${burst}`}
          data-testid={pro ? "plan-card" : undefined}
          className={`relative flex flex-col gap-2 rounded-[26px] bg-[var(--accent)] p-4 text-[var(--accent-ink)] shadow-[0_18px_36px_-16px_var(--accent)] ${
            pro ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--bg)]" : ""
          } ${burst ? "anim-celebrate" : ""}`}
        >
          <Burst k={burst} color="var(--ink)" />
          <div className="flex h-7 items-center justify-between">
            <span className="text-[18px] font-extrabold tracking-[-0.02em]">
              {t("pro")}
              {pro && <span className="sr-only"> · {t("current")}</span>}
            </span>
            {pro && <DaysLeft days={daysLeft} total={monthDays} label={t("proLeft", { n: daysLeft })} />}
          </div>
          <Price amount={priceStr} unit={`tUSD${per}`} />
          <Perks compiles={proLimits.compilesPerDay} feeds={proLimits.maxFeeds} />
        </div>
      </div>

      {/* Số dư tUSD + faucet */}
      <div
        ref={rowRef}
        className="relative mt-4 flex h-[84px] items-center gap-3 rounded-[26px] bg-[var(--soft)] pl-4 pr-3.5"
      >
        <span
          ref={coinRef}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
        >
          <Icon name="coin" className="h-[22px] w-[22px]" strokeWidth={2} />
        </span>
        <span aria-live="polite" className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className="truncate text-[30px] font-extrabold leading-none tracking-[-0.045em]"
            data-testid="tusd-balance"
          >
            {shownBalance !== undefined ? (
              <CountUp value={Number(shownBalance) / 1e6} decimals={2} duration={750} />
            ) : (
              "…"
            )}
          </span>
          <span className="mono text-[12px] font-semibold text-[var(--muted)]">tUSD</span>
        </span>
        {faucetUrl && (
          <a
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("explorer")}
            title={t("explorer")}
            className="anim-pop press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]"
          >
            <Icon name="external" className="h-4 w-4" strokeWidth={2.2} />
          </a>
        )}
        <span ref={faucetRef} key={nudge} className={`shrink-0 ${nudge ? "anim-bump" : ""}`}>
          <button
            type="button"
            onClick={() => void faucet()}
            disabled={faucetBusy || !faucetReady || !owner}
            data-testid="faucet"
            aria-label={
              faucetBusy
                ? t("confirmWallet")
                : faucetCool
                  ? `${t("faucetIn")} ${shortDuration(nextFaucet - now)}`
                  : t("faucetAria", { n: faucetN })
            }
            title={faucetCool ? `${t("faucetIn")} ${shortDuration(nextFaucet - now)}` : undefined}
            className={`press mono flex h-[52px] items-center gap-1.5 rounded-full text-[15px] font-bold ${
              !faucetCool || faucetBusy
                ? `bg-[var(--accent)] text-[var(--accent-ink)] ${faucetBusy ? "anim-halo w-[86px] justify-center" : "pl-3.5 pr-[18px]"} ${faucetKnown ? "" : "opacity-60"}`
                : "bg-[var(--bg)] pl-3 pr-4 text-[14px] font-semibold text-[var(--muted)]"
            }`}
          >
            {faucetBusy ? (
              <Icon name="wallet" className="h-[22px] w-[22px]" strokeWidth={2} />
            ) : !faucetCool ? (
              <>
                <Icon name="download" className="h-[18px] w-[18px]" strokeWidth={2.2} />+{faucetN}
              </>
            ) : (
              <>
                <Icon name="clock" className="h-[17px] w-[17px]" strokeWidth={2.2} />
                {shortDuration(nextFaucet - now)}
              </>
            )}
          </button>
        </span>
        {coins > 0 && (
          <CoinDrop
            key={coins}
            container={rowRef}
            from={faucetRef}
            to={coinRef}
            onDone={() => {
              setHeld(null);
              setCoins(0);
            }}
          />
        )}
      </div>

      <div className="mt-7">
        <PayStepper phase={phase} />
      </div>

      {/* CTA */}
      <div className="mt-4">
        {phase === "done" ? (
          <div className={`grid gap-2.5 ${payUrl ? "grid-cols-[60px_minmax(0,1fr)]" : "grid-cols-1"}`}>
            {payUrl && (
              <a
                href={payUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t("explorer")}
                title={t("explorer")}
                className="anim-pop press flex h-[60px] items-center justify-center rounded-full bg-[var(--soft)] text-[var(--ink)]"
              >
                <Icon name="external" className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </a>
            )}
            <Link
              href="/feeds/new"
              className="anim-pop press flex h-[60px] items-center gap-2.5 rounded-full bg-[var(--accent)] pl-6 pr-2 text-[17px] font-bold text-[var(--accent-ink)]"
            >
              <span className="flex-1">{t("build")}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/15">
                <Icon name="chevronr" className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </span>
            </Link>
          </div>
        ) : (
          PRO && (
            <button
              type="button"
              onClick={() => void pay()}
              disabled={busy || loading || !ready}
              aria-disabled={ctaOff || undefined}
              aria-label={ctaOff ? t("need", { price: priceStr }) : t("buyAria", { price: priceStr })}
              data-testid="buy-pro"
              className={`press flex h-[60px] w-full items-center gap-2.5 rounded-full pl-[22px] pr-2 text-[17px] font-bold transition-colors disabled:opacity-60 ${
                ctaOff
                  ? "bg-[var(--soft)] text-[var(--muted)]"
                  : busy
                    ? "bg-[var(--graphite)] text-[var(--bg)]"
                    : "bg-[var(--ink)] text-[var(--bg)]"
              }`}
            >
              {busy ? (
                <span className="spinner" aria-hidden />
              ) : (
                <Icon name="wallet" className="h-[22px] w-[22px]" strokeWidth={1.9} />
              )}
              <span className="min-w-0 flex-1 text-left">{ctaLabel}</span>
              <span
                className={`mono flex h-11 items-center rounded-full px-4 text-[14px] font-semibold ${
                  ctaOff ? "bg-[var(--line)]" : "bg-[color-mix(in_srgb,var(--bg)_16%,transparent)]"
                }`}
              >
                {priceStr} tUSD
              </span>
            </button>
          )
        )}
      </div>

      {!ready && (
        <div className="mt-4 flex justify-center">
          <Link
            href="/welcome"
            aria-label={t("join")}
            title={t("join")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"
          >
            <Icon name="userplus" className="h-5 w-5" />
          </Link>
        </div>
      )}
      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]">
        <Icon name="alert" className="h-3.5 w-3.5" />
        {t("testToken")}
      </p>
    </div>
  );
}

function Price({ amount, unit, muted = false }: { amount: string; unit: string; muted?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[30px] font-extrabold leading-none tracking-[-0.04em]">{amount}</span>
      <span className={`mono text-[11px] font-semibold ${muted ? "text-[var(--muted)]" : ""}`}>{unit}</span>
    </span>
  );
}

function Perks({ compiles, feeds, muted = false }: { compiles: number; feeds: number; muted?: boolean }) {
  const t = useTranslations("billing");
  return (
    <div className="mono mt-1 flex flex-col gap-[7px]">
      <span className="flex items-center gap-2" title={t("compiles")}>
        <span role="img" aria-label={t("compiles")} className="inline-flex">
          <Icon name="code" className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <b className="text-[15px]">{compiles}</b>
        <span className={`text-[11px] ${muted ? "text-[var(--muted)]" : ""}`}>{t("perDay")}</span>
      </span>
      <span className="flex items-center gap-2" title={t("feedsLimit")}>
        <span role="img" aria-label={t("feedsLimit")} className="inline-flex">
          <Icon name="layers" className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <b className="text-[15px]">{feeds}</b>
      </span>
    </div>
  );
}

/** Vòng nhỏ "Pro còn N ngày" trên thẻ Pro. */
function DaysLeft({ days, total, label }: { days: number; total: number; label: string }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, days / Math.max(1, total)));
  return (
    <span role="img" aria-label={label} title={label} className="anim-pop relative h-[34px] w-[34px]">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--accent-ink) 30%, transparent)"
          strokeWidth="3.5"
        />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="var(--accent-ink)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform="rotate(-90 17 17)"
          style={{ transition: "stroke-dasharray 1s var(--spring)" }}
        />
      </svg>
      <span className="mono absolute inset-0 flex items-center justify-center text-[10px] font-bold">
        {days}
      </span>
    </span>
  );
}
