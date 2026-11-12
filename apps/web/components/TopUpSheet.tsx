"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { parseEther } from "viem";
import { txUrl } from "@/lib/chain";
import { formatAvax, shortAddr } from "@/lib/format";
import { gasLevel, TOP_UP_OPTIONS, useSession } from "@/lib/session";
import { type TxResult, useTx } from "@/lib/tx";
import { useMainWallet } from "@/lib/wallet";
import { Ring, Sheet } from "./bits";
import { Icon } from "./Icon";
import { CountUp } from "./kit";

type Reason = "low" | "empty" | "manual";
type Ctx = { open: (reason?: Reason) => void };
const TopUpCtx = createContext<Ctx | null>(null);

export function useTopUp(): Ctx {
  const c = useContext(TopUpCtx);
  if (!c) throw new Error("useTopUp outside TopUpProvider");
  return c;
}

/** Sheet nạp gas cho session key: 1 tx từ ví chính (có popup ví), luôn đúng chain của app. */
export function TopUpProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const open = useCallback((r?: Reason) => setReason(r ?? "manual"), []);
  return (
    <TopUpCtx.Provider value={{ open }}>
      {children}
      {reason && <TopUpBody reason={reason} onClose={() => setReason(null)} />}
    </TopUpCtx.Provider>
  );
}

function TopUpBody({ reason, onClose }: { reason: Reason; onClose: () => void }) {
  const t = useTranslations("topUp");
  const { owner, session, sessionBalance, refresh } = useSession();
  const { trackTx } = useTx();
  const main = useMainWallet();
  const [amount, setAmount] = useState<(typeof TOP_UP_OPTIONS)[number]>("0.05");
  const [step, setStep] = useState<"pick" | "wallet" | "funding" | "done" | "fail">("pick");
  const [result, setResult] = useState<Extract<TxResult, { ok: true }> | null>(null);
  const level = reason === "manual" ? gasLevel(sessionBalance) : reason;
  const balance = Number(sessionBalance ?? 0n) / 1e18;

  async function fund() {
    if (!session) return;
    setStep("wallet");
    const r = await trackTx(t("title"), async () => {
      const h = await main.sendTransaction({ to: session.address, value: parseEther(amount) });
      setStep("funding");
      return h;
    });
    if (r.ok) {
      setResult(r);
      setStep("done");
      refresh();
    } else setStep(r.rejected ? "pick" : "fail");
  }

  const title = level === "empty" ? t("empty") : level === "low" ? t("low") : t("title");
  const done = step === "done";
  const url = result ? txUrl(result.hash) : null;

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-5" data-testid="topup-sheet">
        {/* Ví chính → coin → session key */}
        <div className="flex items-center justify-between gap-2 rounded-3xl bg-[var(--soft)] px-4 py-4">
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]">
              <Icon name="wallet" className="h-5 w-5" />
            </span>
            <span className="mono text-[11px] text-[var(--muted)]">{shortAddr(owner)}</span>
          </div>
          <div className="relative h-8 flex-1 overflow-hidden">
            <span className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 rounded bg-[var(--line)]" />
            <span
              className="absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white"
              style={{
                left: step === "funding" || done ? "calc(100% - 28px)" : "0px",
                transition: "left .9s var(--ease-io)",
              }}
            >
              <Icon name="coin" className="h-4 w-4" />
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                level === "ok" || done
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "bg-[var(--blush)] text-[var(--red-ink)]"
              } ${level === "empty" && !done ? "anim-halo" : ""}`}
            >
              <Icon name="key" className="h-5 w-5" />
            </span>
            <span className="mono text-[11px] text-[var(--muted)]">{shortAddr(session?.address)}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-center gap-1.5">
          <CountUp
            value={balance}
            decimals={4}
            className={`mono text-[34px] font-bold ${level !== "ok" && !done ? "text-[var(--red-ink)]" : ""}`}
          />
          <span className="mono text-sm text-[var(--muted)]">AVAX</span>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3">
            <span className="anim-pop flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ok-tint)] text-[var(--ok-ink)]">
              <Icon name="check" className="h-6 w-6" />
            </span>
            {result && (
              <a
                href={url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1.5 text-xs"
              >
                #{result.blockNumber.toString()}
                {url && <Icon name="external" className="h-3.5 w-3.5" />}
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="press h-12 w-full rounded-full bg-[var(--ink)] font-semibold text-[var(--bg)]"
              data-testid="topup-done"
            >
              {t("done")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("amount")}>
              {TOP_UP_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={amount === a}
                  onClick={() => setAmount(a)}
                  disabled={step !== "pick" && step !== "fail"}
                  className={`press mono h-12 rounded-2xl text-[15px] font-semibold transition-colors ${
                    amount === a ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)]"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            {(step === "wallet" || step === "funding") && (
              <ol className="flex items-center justify-center gap-3 text-[13px]">
                <li className="flex items-center gap-1.5">
                  {step === "wallet" ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="check" className="h-4 w-4" />
                  )}
                  {t("confirmInWallet")}
                </li>
                <li
                  className={`flex items-center gap-1.5 ${step === "funding" ? "" : "text-[var(--muted)]"}`}
                >
                  {step === "funding" ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="clock" className="h-4 w-4" />
                  )}
                  {t("funding")}
                </li>
              </ol>
            )}
            {main.wrongNetwork && (
              <p className="flex items-center justify-center gap-1.5 text-[13px] text-[var(--warn-ink)]">
                <Icon name="alert" className="h-4 w-4" /> {t("willSwitch")}
              </p>
            )}
            <button
              type="button"
              onClick={() => void fund()}
              disabled={!session || step === "wallet" || step === "funding"}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] font-semibold text-white disabled:opacity-60"
              data-testid="topup-submit"
            >
              <Icon name="fuel" className="h-5 w-5" />
              {t("cta", { amount })}
            </button>
            <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
              <Link
                href="/settings#session"
                onClick={onClose}
                className="press flex items-center gap-1.5"
                aria-label={t("settings")}
              >
                <Icon name="gear" className="h-4 w-4" />
                <Ring value={balance / 0.05} size={16} stroke={2.5} danger={level !== "ok"} />
                <span className="mono">{formatAvax(sessionBalance ?? 0n, 4)}</span>
              </Link>
              {level !== "empty" && (
                <button type="button" onClick={onClose} className="press px-2 py-1">
                  {t("later")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
