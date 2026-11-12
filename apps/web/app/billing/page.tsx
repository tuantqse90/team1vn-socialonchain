"use client";

import { planPaymentsAbi, testUSDAbi } from "@socialonchain/protocol";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { formatUnits, parseSignature } from "viem";
import { useReadContracts } from "wagmi";
import { Button, Empty, Ring } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { clientConfig } from "@/configs";
import { track as trackEvent } from "@/lib/api";
import { chain, contracts } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";
import { useMainWallet } from "@/lib/wallet";

const PLAN_ID = 1;

export default function BillingPage() {
  const t = useTranslations("billing");
  const locale = useLocale();
  const { status, owner, me, refresh } = useSession();
  const { track } = useTx();
  const { writeContract: writeContractAsync, signTypedData: signTypedDataAsync } = useMainWallet();
  const [busy, setBusy] = useState(false);

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
          ]
        : [],
    query: { enabled, refetchInterval: 15_000 },
  });
  const [balance, lastFaucet, cooldown, price, nonce, tokenName] = (reads.data ?? []).map(
    (r) => r.result,
  ) as [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    string | undefined,
  ];

  if (status === "disconnected" || !contracts) return <Empty icon="coin" text={t("title")} />;

  const ent = me?.entitlements;
  const pro = ent?.plan === "pro";
  const now = Math.floor(Date.now() / 1000);
  const nextFaucet = lastFaucet && cooldown ? Number(lastFaucet + cooldown) : 0;
  const faucetReady = !lastFaucet || lastFaucet === 0n || now >= nextFaucet;
  const canPay = price !== undefined && balance !== undefined && balance >= price;

  async function faucet() {
    if (!contracts) return;
    setBusy(true);
    await track(t("faucet"), () =>
      writeContractAsync({ address: contracts!.TestUSD, abi: testUSDAbi, functionName: "faucet" }),
    );
    await reads.refetch();
    setBusy(false);
  }

  /** 1 chữ ký permit (EIP-2612) + 1 tx payWithPermit: không cần approve riêng. */
  async function pay() {
    if (!contracts || !owner || price === undefined || nonce === undefined || !tokenName) return;
    setBusy(true);
    try {
      const deadline = BigInt(now + 3600);
      const sig = await signTypedDataAsync({
        domain: { name: tokenName, version: "1", chainId: chain.id, verifyingContract: contracts.TestUSD },
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
        message: { owner, spender: contracts.PlanPayments, value: price, nonce, deadline },
      });
      const { r, s, v, yParity } = parseSignature(sig);
      const vv = Number(v ?? BigInt(yParity + 27));
      const ok = await track(t("buy", { price: formatUnits(price, 6) }), () =>
        writeContractAsync({
          address: contracts!.PlanPayments,
          abi: planPaymentsAbi,
          functionName: "payWithPermit",
          args: [PLAN_ID, 1, deadline, vv, r, s],
        }),
      );
      if (ok) {
        trackEvent("pro_paid", { plan: PLAN_ID });
        refresh();
      }
    } catch {
      // người dùng huỷ ký
    } finally {
      await reads.refetch();
      setBusy(false);
    }
  }

  const plan = clientConfig.plans[0];
  const limits = ent?.limits ?? clientConfig.freeLimits;

  return (
    <div className="px-4 py-4">
      <h1 className="mb-4 text-[22px] font-bold tracking-tight">{t("title")}</h1>

      <div
        className={`rounded-3xl p-5 ${pro ? "bg-[var(--accent)] text-white" : "bg-[var(--soft)]"}`}
        data-testid="plan-card"
      >
        <div className="flex items-center gap-2">
          <Icon name={pro ? "bolt" : "user"} className="h-5 w-5" />
          <span className="text-[20px] font-bold">{pro ? t("pro") : t("free")}</span>
          <span className="flex-1" />
          {pro && ent?.proUntil && (
            <span className="text-sm opacity-90">
              {t("until", { date: new Date(ent.proUntil * 1000).toLocaleDateString(locale) })}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Quota label={t("compiles")} used={ent?.usage.compilesToday ?? 0} limit={limits.compilesPerDay} />
          <Quota label={t("feedsLimit")} used={ent?.usage.feeds ?? 0} limit={limits.maxFeeds} />
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-[var(--line)] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--soft)]">
            <Icon name="coin" className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="mono text-[20px] font-semibold" data-testid="tusd-balance">
              {balance !== undefined ? formatUnits(balance, 6) : "…"}
            </div>
            <div className="text-xs text-[var(--muted)]">{t("balance")}</div>
          </div>
          <Button
            variant="outline"
            onClick={() => void faucet()}
            disabled={busy || !faucetReady}
            testId="faucet"
          >
            <Icon name="download" className="h-4 w-4" />
            <span className="text-[13px]">{faucetReady ? t("faucet") : t("cooldown")}</span>
          </Button>
        </div>

        {plan && (
          <Button
            variant="accent"
            className="mt-4 w-full"
            onClick={() => void pay()}
            disabled={busy || !canPay || status !== "ready"}
            testId="buy-pro"
          >
            {busy ? <span className="spinner" /> : <Icon name="bolt" className="h-4 w-4" />}
            {pro
              ? t("renew")
              : t("buy", { price: price !== undefined ? formatUnits(price, 6) : String(plan.priceUsd) })}
          </Button>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Icon name="alert" className="h-3.5 w-3.5" />
          {t("testToken")}
        </p>
      </div>
      {status !== "ready" && (
        <p className="mt-4 text-center text-sm">
          <Link href="/welcome" className="text-[var(--accent)]">
            →
          </Link>
        </p>
      )}
    </div>
  );
}

function Quota({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/5 p-3 dark:bg-white/5">
      <Ring value={used / Math.max(1, limit)} size={30} stroke={4} danger={used >= limit} />
      <div>
        <div className="mono text-sm font-semibold">
          {used}/{limit}
        </div>
        <div className="text-[11px] opacity-70">{label}</div>
      </div>
    </div>
  );
}
