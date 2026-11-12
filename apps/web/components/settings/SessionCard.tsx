"use client";

import { DEFAULT_SESSION_DAYS, identityRegistryAbi } from "@socialonchain/protocol";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { addressUrl, contracts } from "@/lib/chain";
import { formatAvax, shortAddr } from "@/lib/format";
import { OWNER_FEE_RESERVE_WEI, SESSION_FUNDING_WEI } from "@/lib/gas";
import { gasLevel, sweepKey, useSession } from "@/lib/session";
import { publicClient, useTx } from "@/lib/tx";
import { useMainWallet } from "@/lib/wallet";
import { Icon, type IconName } from "../Icon";
import { BigRing, CountUp } from "../kit";
import { useTopUp } from "../TopUpSheet";

type StoredKey = NonNullable<ReturnType<typeof useSession>["session"]>;
type Busy = "renew" | "revoke" | null;

/**
 * Màu riêng của thẻ session key (thẻ tối trên nền sáng; thẻ "soft" ở theme tối), suy ra từ token, không hex cứng.
 * `--k-danger` là đỏ sáng đủ tương phản trên nền tối.
 */
const CARD_VARS = [
  "[--k-bg:var(--ink)] [--k-fg:var(--bg)]",
  "[--k-muted:color-mix(in_srgb,var(--bg)_62%,var(--ink))]",
  "[--k-btn:color-mix(in_srgb,var(--bg)_10%,var(--ink))]",
  "[--k-track:color-mix(in_srgb,var(--bg)_15%,var(--ink))]",
  "[--k-danger:color-mix(in_srgb,var(--accent)_60%,var(--bg))]",
  "dark:[--k-bg:var(--soft)] dark:[--k-fg:var(--ink)] dark:[--k-muted:var(--muted)]",
  "dark:[--k-btn:var(--line)] dark:[--k-track:color-mix(in_srgb,var(--ink)_14%,var(--soft))]",
  "dark:[--k-danger:var(--red-ink)]",
].join(" ");

/** Icon ví lắc nhẹ: đang chờ ký trong ví chính. */
function WalletWait({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span className="inline-flex" style={{ animation: "bump .9s var(--press) infinite" }}>
      <Icon name="wallet" className={className} strokeWidth={2} />
    </span>
  );
}

function Act({
  icon,
  label,
  aria,
  onClick,
  tone = "base",
  halo = false,
  wait = false,
  disabled = false,
  testId,
}: {
  icon: IconName;
  label: string;
  aria: string;
  onClick: () => void;
  tone?: "base" | "hot" | "danger";
  halo?: boolean;
  wait?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  const colors =
    tone === "hot"
      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
      : tone === "danger"
        ? "bg-[var(--k-btn)] text-[var(--k-danger)]"
        : "bg-[var(--k-btn)] text-[var(--k-fg)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      title={aria}
      data-testid={testId}
      className={`press flex h-[58px] flex-col items-center justify-center gap-[5px] rounded-[18px] text-[12.5px] font-semibold transition-colors duration-300 ${colors} ${
        halo ? "anim-halo" : ""
      } ${disabled && !wait ? "opacity-60" : ""}`}
    >
      {wait ? <WalletWait /> : <Icon name={icon} className="h-5 w-5" strokeWidth={2.1} />}
      <span>{label}</span>
    </button>
  );
}

/**
 * Thẻ session key: vòng đếm ngược 30 ngày (chấm quỹ đạo), số dư + thanh gas, Nạp / Tạo lại / Thu hồi (2 chạm).
 * Mọi tx ở đây do ví chính ký, qua `useMainWallet` (ép đúng chain). Nạp gas dùng sheet chung `useTopUp`.
 */
export function SessionCard() {
  const t = useTranslations("session");
  const { status, owner, session, sessionBalance, prepareKey, discardKey, refresh } = useSession();
  const { track, trackTx } = useTx();
  const main = useMainWallet();
  const topUp = useTopUp();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState(false);
  const [shake, setShake] = useState(0);
  const [revokedAddr, setRevokedAddr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 60_000);
    return () => {
      clearInterval(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  if (status === "disconnected") return null;
  if (status === "loading") {
    return <section id="session" className="skeleton h-[196px] scroll-mt-16 rounded-[28px]" aria-busy />;
  }
  if (status === "unregistered") {
    return (
      <section
        id="session"
        aria-label={t("title")}
        className="flex scroll-mt-16 items-center gap-3 rounded-[28px] bg-[var(--soft)] p-4"
        data-testid="session-card"
      >
        <Icon name="key" className="h-5 w-5" strokeWidth={2.2} />
        <span className="flex-1 text-[15px] font-semibold">{t("noKey")}</span>
        <Link
          href="/welcome"
          className="press flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
        >
          <Icon name="userplus" className="h-4 w-4" />
          {t("join")}
        </Link>
      </section>
    );
  }

  /** Delegate còn hiệu lực onchain không (đọc lỗi thì coi như còn, giữ hành vi cũ: thử thu hồi). */
  async function stillDelegate(o: Address, key: Address): Promise<boolean> {
    if (!contracts) return false;
    return publicClient
      .readContract({
        address: contracts.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "isAuthorized",
        args: [o, key],
      })
      .catch(() => true);
  }

  async function renew() {
    if (!contracts || !owner || busy) return;
    const c = contracts;
    setConfirm(false);
    setBusy("renew");
    const old = session;
    // Trả gas dư của key cũ về owner TRƯỚC (ký bằng chính key cũ), để owner đủ tiền nạp cho key mới.
    if (old) {
      await sweepKey(old.pk, owner).catch(() => null);
    }
    const ownerBal = await publicClient.getBalance({ address: owner }).catch(() => 0n);
    const spare = ownerBal - OWNER_FEE_RESERVE_WEI;
    const value = spare > SESSION_FUNDING_WEI ? SESSION_FUNDING_WEI : spare > 0n ? spare : 0n;
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    const r = await trackTx(t("newKey"), () =>
      main.writeContract({
        address: c.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "addDelegate",
        args: [key.address, BigInt(key.expiresAt)],
        value,
      }),
    );
    if (old) {
      if (r.ok && old.expiresAt > Date.now() / 1000 && (await stillDelegate(owner, old.address))) {
        await track(t("revoked"), () =>
          main.writeContract({
            address: c.IdentityRegistry,
            abi: identityRegistryAbi,
            functionName: "removeDelegate",
            args: [old.address],
          }),
        );
      }
    }
    if (r.ok) setRevokedAddr(null);
    setBusy(null);
    refresh();
  }

  async function revoke(s: StoredKey) {
    if (!contracts || !owner) return;
    const c = contracts;
    setBusy("revoke");
    const ok = await track(t("revoked"), () =>
      main.writeContract({
        address: c.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "removeDelegate",
        args: [s.address],
      }),
    );
    if (ok) {
      // Thu hồi xong mới rút gas dư về owner: huỷ ký thì key vẫn còn nguyên gas.
      await sweepKey(s.pk, owner).catch(() => null);
      setRevokedAddr(s.address);
      discardKey();
      setShake((k) => k + 1);
    }
    setBusy(null);
    refresh();
  }

  function onRevoke() {
    if (busy || !session) return;
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (!confirm) {
      setConfirm(true);
      confirmTimer.current = setTimeout(() => setConfirm(false), 3200);
      return;
    }
    setConfirm(false);
    void revoke(session);
  }

  const expired = Boolean(session && session.expiresAt <= now);
  const alive = status === "ready" && session !== null && !expired;
  const dead: "expired" | "revoked" | "none" = expired
    ? "expired"
    : session || revokedAddr
      ? "revoked"
      : "none";
  const addr = session?.address ?? revokedAddr;
  const daysLeft = session ? Math.max(0, (session.expiresAt - now) / 86400) : 0;
  const days = Math.ceil(daysLeft);
  const level = gasLevel(sessionBalance);
  const low = alive && level !== "ok";
  const balance = Number(sessionBalance ?? 0n) / 1e18;
  const balFrac = Math.min(1, Number(sessionBalance ?? 0n) / Number(SESSION_FUNDING_WEI));
  const url = addr ? addressUrl(addr) : null;

  return (
    <section
      id="session"
      aria-label={t("title")}
      data-testid="session-card"
      className={`${CARD_VARS} scroll-mt-16 rounded-[28px] bg-[var(--k-bg)] p-4 text-[var(--k-fg)] transition-colors duration-500 dark:ring-1 dark:ring-[var(--line)]`}
    >
      <div key={shake} className={shake ? "anim-shake" : ""}>
        <div className="flex items-center gap-[18px]">
          <span className="inline-flex [--line:var(--k-track)]">
            <BigRing
              value={alive ? daysLeft / DEFAULT_SESSION_DAYS : 0}
              orbit
              label={alive ? t("ringAria", { days, total: DEFAULT_SESSION_DAYS }) : t("ringDead")}
            >
              {alive ? (
                <>
                  <span className="text-[34px] font-extrabold leading-none tracking-[-0.05em] tabular-nums">
                    {days}
                  </span>
                  <span className="mono mt-1 text-[9.5px] font-semibold uppercase tracking-[.14em] text-[var(--k-muted)]">
                    {t("days")}
                  </span>
                </>
              ) : (
                <span className="relative inline-flex text-[var(--k-muted)]">
                  <Icon name="key" className="h-8 w-8" strokeWidth={2} />
                  <span className="absolute left-1/2 top-1/2 h-[2px] w-10 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                </span>
              )}
            </BigRing>
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              <Icon name="key" className="h-3.5 w-3.5" strokeWidth={2.4} />
              {t("title")}
              {alive && days <= 3 && (
                <span className="anim-pop ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-[var(--warn-tint)] px-2 text-[11px] font-semibold text-[var(--warn-ink)]">
                  <Icon name="clock" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  {t("expiring")}
                </span>
              )}
            </span>
            {addr &&
              (url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`mono self-start text-[12px] text-[var(--k-muted)] hover:underline ${alive ? "" : "line-through"}`}
                >
                  {shortAddr(addr)}
                </a>
              ) : (
                <span className={`mono text-[12px] text-[var(--k-muted)] ${alive ? "" : "line-through"}`}>
                  {shortAddr(addr)}
                </span>
              ))}
            {alive ? (
              <>
                <span
                  className="flex items-baseline gap-1.5"
                  title={t("balanceAria", { amount: formatAvax(sessionBalance ?? 0n, 4) })}
                >
                  <CountUp
                    value={balance}
                    decimals={4}
                    className={`text-[32px] font-extrabold leading-none tracking-[-0.05em] transition-colors ${
                      low ? "text-[var(--k-danger)]" : ""
                    }`}
                  />
                  <span className="mono text-[11px] font-semibold tracking-[.1em] text-[var(--k-muted)]">
                    AVAX
                  </span>
                </span>
                <span aria-hidden className="relative h-1.5 overflow-hidden rounded-full bg-[var(--k-track)]">
                  <span
                    className="absolute inset-0 origin-left rounded-full"
                    style={{
                      transform: `scaleX(${balFrac})`,
                      background: low ? "var(--accent)" : "var(--k-fg)",
                      transition: "transform .9s var(--spring), background-color .4s",
                    }}
                  />
                </span>
              </>
            ) : (
              <span
                className={`anim-pop inline-flex h-8 items-center gap-1.5 self-start rounded-full px-3 text-[15px] font-bold ${
                  dead === "none"
                    ? "bg-[var(--k-btn)] text-[var(--k-fg)]"
                    : "bg-[var(--err-tint)] text-[var(--err-ink)]"
                }`}
                data-testid="session-dead"
              >
                <Icon
                  name={dead === "expired" ? "clock" : dead === "revoked" ? "x" : "key"}
                  className="h-4 w-4"
                  strokeWidth={2.4}
                />
                {dead === "expired" ? t("expired") : dead === "revoked" ? t("revoked") : t("noKey")}
              </span>
            )}
          </div>
        </div>

        {alive ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Act
              icon="fuel"
              label={t("topUpShort")}
              aria={t("topAria")}
              onClick={() => topUp.open("manual")}
              tone={low ? "hot" : "base"}
              halo={low && !busy}
              disabled={busy !== null}
              testId="topup"
            />
            <Act
              icon="refresh"
              label={busy === "renew" ? t("wallet") : t("renewShort")}
              aria={busy === "renew" ? t("walletAria") : t("renewAria")}
              onClick={() => void renew()}
              wait={busy === "renew"}
              disabled={busy !== null}
              testId="renew"
            />
            <Act
              icon="x"
              label={busy === "revoke" ? t("wallet") : confirm ? t("confirm") : t("revoke")}
              aria={busy === "revoke" ? t("walletAria") : confirm ? t("confirmAria") : t("revokeAria")}
              onClick={onRevoke}
              tone={confirm ? "hot" : "danger"}
              wait={busy === "revoke"}
              disabled={busy !== null}
              testId="revoke"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void renew()}
            disabled={busy !== null}
            aria-label={busy === "renew" ? t("walletAria") : undefined}
            title={busy === "renew" ? t("walletAria") : t("renewAria")}
            className="press mt-4 flex h-[58px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)]"
            data-testid="renew"
          >
            {busy === "renew" ? (
              <WalletWait className="h-[22px] w-[22px]" />
            ) : (
              <Icon name="refresh" className="h-5 w-5" strokeWidth={2.2} />
            )}
            {busy === "renew" ? t("wallet") : t("renewCta", { days: DEFAULT_SESSION_DAYS })}
          </button>
        )}
      </div>
    </section>
  );
}
