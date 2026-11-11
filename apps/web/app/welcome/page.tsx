"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  DEFAULT_SESSION_DAYS,
  DEFAULT_SESSION_FUNDING_WEI,
  identityRegistryAbi,
} from "@socialonchain/protocol";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { keccak256, toBytes, zeroAddress } from "viem";
import { useBalance, useReadContract, useWriteContract } from "wagmi";
import { Button } from "@/components/bits";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { clientConfig } from "@/configs";
import { API_URL, api, track } from "@/lib/api";
import { contracts, FAUCET_URL, network, rpcUrl } from "@/lib/chain";
import { formatAvax } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
/** Cần đủ để nạp gas cho session key + phí tx đăng ký. */
const MIN_OWNER_WEI = DEFAULT_SESSION_FUNDING_WEI + 10_000_000_000_000_000n;

function Step({
  icon,
  done,
  active,
  children,
}: {
  icon: IconName;
  done?: boolean;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 ${active ? "" : "opacity-50"}`}>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-[var(--ink)] text-[var(--bg)]"
            : active
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--soft)]"
        }`}
      >
        <Icon name={done ? "check" : icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </div>
  );
}

export default function Welcome() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "vi";
  const router = useRouter();
  const { openConnectModal } = useConnectModal();
  const { status, owner, prepareKey, refresh, token } = useSession();
  const { track: trackTx } = useTx();
  const { writeContractAsync } = useWriteContract();
  const bal = useBalance({ address: owner, query: { enabled: Boolean(owner), refetchInterval: 10_000 } });
  const [handle, setHandle] = useState("");
  const [debounced, setDebounced] = useState("");
  const [name, setName] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(handle), 300);
    return () => clearTimeout(id);
  }, [handle]);

  const valid = HANDLE_RE.test(debounced);
  const taken = useReadContract({
    address: contracts?.IdentityRegistry,
    abi: identityRegistryAbi,
    functionName: "ownerOfHandle",
    args: [keccak256(toBytes(debounced || "_"))],
    query: { enabled: Boolean(contracts && valid) },
  });
  const available = valid && taken.data === zeroAddress;

  // Tên hiển thị lưu offchain sau khi đã đăng nhập bằng session key.
  useEffect(() => {
    if (token && pendingName) {
      void api("/me/profile", { method: "PUT", json: { displayName: pendingName } }).finally(() =>
        setPendingName(null),
      );
    }
  }, [token, pendingName]);

  useEffect(() => {
    if (status === "unregistered") track("onboarding_started");
  }, [status]);

  const enough = (bal.data?.value ?? 0n) >= MIN_OWNER_WEI;

  async function devFund() {
    if (!owner) return;
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "anvil_setBalance",
        params: [owner, "0x8AC7230489E80000"],
      }),
    });
    await bal.refetch();
  }

  async function join() {
    if (!contracts || !owner || !available) return;
    setBusy(true);
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    const ok = await trackTx(t("join"), () =>
      writeContractAsync({
        address: contracts!.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "registerWithDelegate",
        args: [debounced, `${API_URL}/profiles/${owner.toLowerCase()}`, key.address, BigInt(key.expiresAt)],
        value: DEFAULT_SESSION_FUNDING_WEI,
      }),
    );
    setBusy(false);
    if (ok) {
      if (name.trim()) setPendingName(name.trim());
      track("registered");
      refresh();
    }
  }

  async function enableDevice() {
    if (!contracts || !owner) return;
    setBusy(true);
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    const ok = await trackTx(t("enableDevice"), () =>
      writeContractAsync({
        address: contracts!.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "addDelegate",
        args: [key.address, BigInt(key.expiresAt)],
        value: DEFAULT_SESSION_FUNDING_WEI,
      }),
    );
    setBusy(false);
    if (ok) refresh();
  }

  const connected = status !== "disconnected";
  const registered = status === "ready" || status === "needs-key";

  return (
    <div className="px-5 py-8">
      <div className="mb-10 flex items-center justify-between">
        <Link href="/" className="press" aria-label={clientConfig.appName}>
          <Logo size={40} />
        </Link>
        <Link
          href="/"
          className="press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--soft)]"
          aria-label={tc("close")}
        >
          <Icon name="x" className="h-4 w-4" />
        </Link>
      </div>
      <h1 className="mb-2 text-[28px] font-bold leading-tight tracking-tight">
        {clientConfig.tagline[locale]}
      </h1>
      <div className="mb-10 flex gap-4 text-[var(--muted)]">
        <span className="flex items-center gap-1.5 text-xs" title={t("testnet")}>
          <Icon name="bolt" className="h-4 w-4" /> {network.name === "fuji" ? "Fuji" : tc("local")}
        </span>
        <span className="flex items-center gap-1.5 text-xs" title={t("permanent")}>
          <Icon name="infinity" className="h-4 w-4" /> onchain
        </span>
        <span className="flex items-center gap-1.5 text-xs" title={t("fundHint")}>
          <Icon name="key" className="h-4 w-4" /> 1 tx
        </span>
      </div>

      <div className="space-y-7">
        <Step icon="wallet" done={connected} active={!connected}>
          <p className="font-semibold">{t("connect")}</p>
          {!connected && (
            <Button
              variant="solid"
              className="mt-3"
              onClick={() => openConnectModal?.()}
              testId="welcome-connect"
            >
              <Icon name="wallet" className="h-4 w-4" />
              {tc("connect")}
            </Button>
          )}
        </Step>

        <Step
          icon="fuel"
          done={registered || (connected && enough)}
          active={status === "unregistered" && !enough}
        >
          <p className="font-semibold">{t("fund")}</p>
          {connected && !registered && (
            <div className="mt-2 space-y-3">
              <p className="mono text-sm text-[var(--muted)]">
                {t("balance")}: {bal.data ? formatAvax(bal.data.value) : "…"} AVAX
              </p>
              {!enough &&
                (network.name === "fuji" ? (
                  <a
                    href={FAUCET_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold"
                  >
                    <Icon name="external" className="h-4 w-4" />
                    {t("faucet")}
                  </a>
                ) : (
                  <Button variant="outline" onClick={() => void devFund()} testId="dev-fund">
                    <Icon name="bolt" className="h-4 w-4" /> 10 AVAX (local)
                  </Button>
                ))}
              <p className="text-xs text-[var(--muted)]">{t("fundHint")}</p>
            </div>
          )}
        </Step>

        <Step icon="at" done={registered} active={status === "unregistered" && enough}>
          <p className="font-semibold">{t("handle")}</p>
          {status === "unregistered" && (
            <div className="mt-3 space-y-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                  @
                </span>
                <input
                  value={handle}
                  onChange={(e) =>
                    setHandle(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 20),
                    )
                  }
                  placeholder="handle"
                  className="field pl-8"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="handle-input"
                />
                {valid && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    title={available ? t("handleOk") : t("handleTaken")}
                  >
                    <Icon
                      name={available ? "check" : "x"}
                      className={`h-4 w-4 ${available ? "text-emerald-500" : "text-[var(--accent)]"}`}
                    />
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)]">{t("handleHint")}</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="Name"
                className="field"
                data-testid="name-input"
              />
              <Button
                variant="accent"
                className="w-full"
                onClick={() => void join()}
                disabled={!available || !enough || busy}
                testId="join-submit"
              >
                {busy ? <span className="spinner" /> : <Icon name="key" className="h-4 w-4" />}
                {t("join")}
              </Button>
            </div>
          )}
          {status === "needs-key" && (
            <Button
              variant="accent"
              className="mt-3 w-full"
              onClick={() => void enableDevice()}
              disabled={busy}
              testId="enable-device"
            >
              {busy ? <span className="spinner" /> : <Icon name="key" className="h-4 w-4" />}
              {t("enableDevice")}
            </Button>
          )}
        </Step>

        <Step icon="userplus" active={status === "ready"}>
          <p className="font-semibold">{status === "ready" ? t("ready") : t("importTitle")}</p>
          {status === "ready" && (
            <div className="mt-3 flex gap-2">
              {clientConfig.enabledSources.some((s) => s.startsWith("farcaster")) && (
                <Button variant="outline" onClick={() => router.push("/import")} testId="welcome-import">
                  <Icon name="arch" className="h-4 w-4" />
                  {t("import")}
                </Button>
              )}
              <Button variant="solid" onClick={() => router.push("/")} testId="welcome-done">
                <Icon name="home" className="h-4 w-4" />
                {tc("done")}
              </Button>
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}
