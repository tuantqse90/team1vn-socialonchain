"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  DEFAULT_SESSION_DAYS,
  DEFAULT_SESSION_FUNDING_WEI,
  identityRegistryAbi,
} from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Hash, keccak256, toBytes, zeroAddress } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { Icon } from "@/components/Icon";
import { IdCard, type IdCardVariant, type IdField } from "@/components/IdCard";
import { Burst, CountUp } from "@/components/kit";
import { clientConfig } from "@/configs";
import { API_URL, api, track } from "@/lib/api";
import { chain, contracts, FAUCET_URL, network, rpcUrl } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { publicClient, useTx } from "@/lib/tx";
import type { User } from "@/lib/types";
import { useMainWallet } from "@/lib/wallet";
import s from "./onboarding.module.css";
import { Arrow, Dots, TopBar } from "./parts";
import { type Picks, patchPending, type Role } from "./picks";
import { roleFields } from "./RoleSteps";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
/** Cần đủ để nạp gas cho session key + phí tx đăng ký. */
const MIN_OWNER_WEI = DEFAULT_SESSION_FUNDING_WEI + 10_000_000_000_000_000n;
const APP_NET = network.name === "fuji" ? "Fuji" : "Local";
const FC_ENABLED = clientConfig.enabledSources.some((x) => x.startsWith("farcaster"));

type Phase =
  | "connect"
  | "loading"
  | "network"
  | "fund"
  | "register"
  | "taken"
  | "signing"
  | "rejected"
  | "failed"
  | "device"
  | "done";

function chainName(id: number | undefined): string {
  if (id === 43114) return "C-CHAIN";
  if (id === 43113) return "FUJI";
  if (id === 31337) return "LOCAL";
  if (id === 1) return "ETHEREUM";
  return id ? `#${id}` : "—";
}

/** Tên custom error của contract (vd. HandleTaken) nếu lỗi là revert. */
function revertName(err: unknown): string | null {
  let e = err as { data?: { errorName?: string }; message?: string; cause?: unknown } | undefined;
  for (let i = 0; e && i < 8; i++) {
    if (e.data?.errorName) return e.data.errorName;
    const m = /\b(HandleTaken|AlreadyRegistered|InvalidHandle)\b/.exec(e.message ?? "");
    if (m?.[1]) return m[1];
    e = e.cause as typeof e;
  }
  return null;
}

/** 3 gợi ý: @{h}_vn, @{h}_dev, dạng ngắn. */
function suggestHandles(h: string): string[] {
  const compact = h.length > 4 ? `${h.charAt(0)}${h.slice(-3)}` : `${h}_x`;
  return [...new Set([`${h}_vn`, `${h}_dev`, compact].map((x) => x.slice(0, 20)))].filter(
    (x) => x !== h && HANDLE_RE.test(x),
  );
}

/** Chain id cuộn từng chữ số từ mạng của ví sang mạng của app. */
function Odometer({ from, to, settled }: { from: number; to: number; settled: boolean }) {
  const a = String(from);
  const b = String(to);
  const len = Math.max(a.length, b.length);
  const pa = a.padStart(len, " ");
  const pb = b.padStart(len, " ");
  return (
    <span aria-hidden className={s.odo}>
      {Array.from({ length: len }, (_, i) =>
        pa[i] === pb[i] ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: vị trí chữ số cố định
          <span key={i}>{pb[i]}</span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: vị trí chữ số cố định
            key={i}
            className={s.odoCol}
            style={{
              transform: `translateY(${settled ? -72 : 0}px)`,
              color: settled ? "var(--ink)" : "var(--err-ink)",
            }}
          >
            <span style={{ minWidth: "0.3em" }}>{pa[i]}</span>
            <span>{pb[i]}</span>
          </span>
        ),
      )}
    </span>
  );
}

export function WalletStep({
  role,
  picks,
  onBack,
}: {
  role: Role | null;
  picks: Picks;
  onBack?: () => void;
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  const { openConnectModal } = useConnectModal();
  const { status, owner, prepareKey, refresh } = useSession();
  const { trackTx } = useTx();
  const mw = useMainWallet();
  const addr = owner?.toLowerCase();
  const bal = useBalance({
    address: owner,
    query: { enabled: Boolean(owner) && status !== "ready", refetchInterval: 5_000 },
  });
  const user = useQuery({
    queryKey: ["onb-user", addr, status],
    queryFn: () => api<User>(`/users/${addr}`),
    enabled: Boolean(addr),
    retry: false,
  });

  const [handle, setHandle] = useState("");
  const [debounced, setDebounced] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<null | "rejected" | "failed" | "taken">(null);
  const [lastAction, setLastAction] = useState<"join" | "device">("join");
  const [doneBlock, setDoneBlock] = useState<bigint | null>(null);
  /** Tx đăng ký đã lên chain, đang đợi trạng thái session cập nhật: giữ spinner, không nháy "tên đã có chủ". */
  const [joined, setJoined] = useState(false);
  const [burst, setBurst] = useState(0);
  const [funding, setFunding] = useState(false);
  const [netFlash, setNetFlash] = useState(false);
  const [fundFlash, setFundFlash] = useState(false);
  const [shake, setShake] = useState(0);
  const wrongId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(handle), 300);
    return () => clearTimeout(id);
  }, [handle]);

  const valid = HANDLE_RE.test(debounced) && debounced === handle;
  const ownerOf = useReadContract({
    address: contracts?.IdentityRegistry,
    abi: identityRegistryAbi,
    functionName: "ownerOfHandle",
    args: [keccak256(toBytes(debounced || "_"))],
    query: { enabled: Boolean(contracts && HANDLE_RE.test(debounced)) },
  });
  const available = valid && ownerOf.data === zeroAddress;
  const takenNow =
    valid &&
    ownerOf.data !== undefined &&
    ownerOf.data !== zeroAddress &&
    ownerOf.data.toLowerCase() !== owner?.toLowerCase();

  const enough = (bal.data?.value ?? 0n) >= MIN_OWNER_WEI;

  // Sai mạng → đã chuyển: giữ trạng thái "đã ở Fuji" (check xanh) một nhịp rồi đi tiếp.
  useEffect(() => {
    if (mw.wrongNetwork) {
      wrongId.current = mw.walletChainId;
      return;
    }
    if (wrongId.current === undefined) return;
    setNetFlash(true);
    const id = setTimeout(() => {
      setNetFlash(false);
      wrongId.current = undefined;
    }, 1200);
    return () => clearTimeout(id);
  }, [mw.wrongNetwork, mw.walletChainId]);

  // Vừa đủ AVAX: để số chạy xong rồi mới sang bước đặt tên.
  const wasShort = useRef(false);
  useEffect(() => {
    if (!bal.data) return;
    if (!enough) {
      wasShort.current = true;
      return;
    }
    if (!wasShort.current) return;
    wasShort.current = false;
    setFunding(false);
    setFundFlash(true);
    const id = setTimeout(() => setFundFlash(false), 900);
    return () => clearTimeout(id);
  }, [enough, bal.data]);

  useEffect(() => {
    if (status === "unregistered") track("onboarding_started");
  }, [status]);

  let phase: Phase;
  if (status === "disconnected") phase = "connect";
  else if (mw.wrongNetwork || netFlash) phase = "network";
  else if (status === "loading") phase = "loading";
  else if (status === "ready") phase = "done";
  else if (busy || (joined && status === "unregistered")) phase = "signing";
  else if (outcome === "rejected") phase = "rejected";
  else if (outcome === "failed") phase = "failed";
  else if (status === "needs-key") phase = "device";
  else if (!bal.data) phase = "loading";
  else if (!enough || fundFlash) phase = "fund";
  else if (takenNow || outcome === "taken") phase = "taken";
  else phase = "register";

  // Lắc thẻ khi vào trạng thái lỗi.
  const prevPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (prevPhase.current !== phase && ["network", "taken", "rejected", "failed"].includes(phase)) {
      setShake((k) => k + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  const suggestions = useMemo(() => (phase === "taken" ? suggestHandles(handle) : []), [phase, handle]);
  const suggestQ = useReadContracts({
    contracts: suggestions.map((h) => ({
      address: contracts?.IdentityRegistry ?? zeroAddress,
      abi: identityRegistryAbi,
      functionName: "ownerOfHandle" as const,
      args: [keccak256(toBytes(h))] as const,
    })),
    query: { enabled: Boolean(contracts) && suggestions.length > 0 },
  });
  const freeSuggestions = suggestions.filter(
    (_, i) => suggestQ.data?.[i]?.status === "success" && suggestQ.data[i]?.result === zeroAddress,
  );

  async function devFund() {
    if (!owner) return;
    setFunding(true);
    try {
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
    } finally {
      await bal.refetch();
      setFunding(false);
    }
  }

  async function join() {
    if (!contracts || !owner || !available || busy) return;
    setLastAction("join");
    setOutcome(null);
    setBusy(true);
    // Kiểm tra lại ngay trước khi ký: tránh tốn gas khi handle vừa bị lấy.
    try {
      const o = await publicClient.readContract({
        address: contracts.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "ownerOfHandle",
        args: [keccak256(toBytes(handle))],
      });
      if (o !== zeroAddress) {
        setBusy(false);
        setOutcome("taken");
        return;
      }
    } catch {
      // RPC lỗi: để contract tự kiểm
    }
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    let revert: string | null = null;
    const r = await trackTx(t("join"), async (): Promise<Hash> => {
      try {
        return await mw.writeContract({
          address: contracts!.IdentityRegistry,
          abi: identityRegistryAbi,
          functionName: "registerWithDelegate",
          args: [handle, `${API_URL}/profiles/${owner.toLowerCase()}`, key.address, BigInt(key.expiresAt)],
          value: DEFAULT_SESSION_FUNDING_WEI,
        });
      } catch (e) {
        revert = revertName(e);
        throw e;
      }
    });
    setBusy(false);
    if (r.ok) {
      setDoneBlock(r.blockNumber);
      setJoined(true);
      setBurst((k) => k + 1);
      if (name.trim()) patchPending({ name: name.trim(), owner: owner.toLowerCase() });
      track("registered");
      refresh();
    } else if (r.rejected) setOutcome("rejected");
    else if (revert === "HandleTaken" || /HandleTaken/.test(r.error)) setOutcome("taken");
    else setOutcome("failed");
  }

  async function enableDevice() {
    if (!contracts || !owner || busy) return;
    setLastAction("device");
    setOutcome(null);
    setBusy(true);
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    const r = await trackTx(t("enableDevice"), () =>
      mw.writeContract({
        address: contracts!.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "addDelegate",
        args: [key.address, BigInt(key.expiresAt)],
        value: DEFAULT_SESSION_FUNDING_WEI,
      }),
    );
    setBusy(false);
    if (r.ok) {
      setBurst((k) => k + 1);
      refresh();
    } else setOutcome(r.rejected ? "rejected" : "failed");
  }

  function onHandle(v: string) {
    setHandle(
      v
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20),
    );
    // Sửa handle sau lỗi/huỷ ký: quay về trạng thái nhập bình thường.
    if (outcome) setOutcome(null);
  }

  // ---------- Thẻ ----------
  const contractsN = user.data?.builder?.contractsDeployed ?? 0;
  const variant: IdCardVariant = role ?? (contractsN > 0 ? "builder" : "reader");
  const registeredHandle = user.data?.handle ?? null;
  /** Đã có danh tính onchain (chỉ còn bật thiết bị hoặc đã xong). */
  const registered = status === "ready" || status === "needs-key";
  const editing =
    !registered &&
    (phase === "register" ||
      phase === "taken" ||
      (lastAction === "join" && (phase === "signing" || phase === "rejected" || phase === "failed")));
  const cardHandle = registered ? (registeredHandle ?? (handle || null)) : editing && handle ? handle : null;
  const balanceText = bal.data ? `${(Number(bal.data.value) / 1e18).toFixed(2)} AVAX` : "—";
  let fields: IdField[];
  if (registered && phase !== "network") {
    fields = role
      ? roleFields(role, picks, tc, t, {
          contracts: contractsN,
          chains: Object.keys(user.data?.builder?.chains ?? {}).length,
        })
      : [
          { k: tc("wallet"), v: shortAddr(addr) },
          { k: tc("chain"), v: APP_NET.toUpperCase() },
          { k: tc("session"), v: tc("days", { n: DEFAULT_SESSION_DAYS }) },
        ];
  } else if (phase === "network") {
    fields = [
      { k: tc("wallet"), v: shortAddr(addr) },
      { k: tc("network"), v: mw.wrongNetwork ? chainName(mw.walletChainId) : APP_NET.toUpperCase() },
      { k: tc("session"), v: "—" },
    ];
  } else {
    fields = [
      { k: tc("wallet"), v: addr ? shortAddr(addr) : "—" },
      { k: tc("balance"), v: addr ? balanceText : "—" },
      { k: tc("session"), v: addr && enough ? tc("days", { n: DEFAULT_SESSION_DAYS }) : "—" },
    ];
  }
  const block = doneBlock ?? user.data?.registeredBlock ?? null;
  const minted = registered;

  // Huy hiệu góc thẻ
  const badge: { kind: "warn" | "ok" | "err"; label: string } | null =
    phase === "network"
      ? mw.wrongNetwork
        ? { kind: "warn", label: t("wrongNetwork") }
        : { kind: "ok", label: t("onNetwork", { name: APP_NET }) }
      : phase === "rejected" || phase === "failed"
        ? { kind: "err", label: phase === "rejected" ? t("rejectedTitle") : t("failedTitle") }
        : null;
  const badgeStyle =
    badge?.kind === "warn"
      ? { background: "var(--warn-tint)", color: "var(--warn-ink)", "--halo": "var(--warn)" }
      : badge?.kind === "ok"
        ? { background: "var(--ok)", color: "var(--bg)", "--halo": "transparent" }
        : { background: "var(--accent)", color: "var(--accent-ink)", "--halo": "var(--accent)" };

  const titles: Record<Phase, ReactNode> = {
    connect: t("connectTitle"),
    loading: t("loadingTitle"),
    network: t("wrongNetwork"),
    fund: t("fundTitle"),
    register: t("handleTitle"),
    taken: t("handleTaken"),
    signing: t("signingTitle"),
    rejected: t("rejectedTitle"),
    failed: t("failedTitle"),
    device: t("deviceTitle"),
    done: registeredHandle || handle ? `@${registeredHandle ?? handle}` : t("ready"),
  };

  const blockUrl = network.explorerUrl && block !== null ? `${network.explorerUrl}/block/${block}` : null;
  const cardAnim = phase === "done" && burst > 0 ? "anim-celebrate" : shake > 0 ? s.shake : "";

  return (
    <>
      <TopBar onBack={phase === "done" ? undefined : onBack} skip={phase !== "done"}>
        {phase !== "done" && (
          <span className="ml-auto pr-1">
            <Dots at={2} />
          </span>
        )}
      </TopBar>

      <div className="relative mx-auto mt-3 w-full max-w-[342px]">
        <div key={`${cardAnim}-${shake}-${burst}`} className={cardAnim}>
          <IdCard
            variant={variant}
            handle={cardHandle}
            address={addr}
            fields={fields}
            minted={minted}
            block={block}
            verified={variant === "builder" && contractsN > 0 ? tc("stampSub", { n: contractsN }) : null}
            printing={phase === "signing"}
            shine={phase === "done" ? "once" : "none"}
            tilt
          />
        </div>
        {phase === "done" && <Burst k={burst} />}
        {badge && (
          <span
            role="img"
            aria-label={badge.label}
            className={`${s.badge} ${badge.kind !== "ok" ? s.halo : ""}`}
            style={badgeStyle as React.CSSProperties}
          >
            <span key={badge.kind} className="anim-pop flex">
              <Icon
                name={badge.kind === "ok" ? "check" : badge.kind === "warn" ? "alert" : "x"}
                className="h-[22px] w-[22px]"
                strokeWidth={2.8}
              />
            </span>
          </span>
        )}
      </div>

      <div aria-live="polite" className="mt-8 min-h-[44px]">
        <h1 key={phase} className={`${s.title} ${s.rise}`}>
          {titles[phase]}
        </h1>
      </div>

      <div className="mt-5">
        {phase === "network" && (
          <div className={`${s.rise} flex items-center gap-4`}>
            <span className="sr-only">Chain ID {mw.wrongNetwork ? mw.walletChainId : chain.id}</span>
            <Odometer
              from={wrongId.current ?? mw.walletChainId ?? chain.id}
              to={chain.id}
              settled={!mw.wrongNetwork}
            />
            <span aria-hidden className="flex flex-col gap-1.5">
              <span className="mono text-[11px] font-semibold tracking-[.12em] text-[var(--muted)]">
                CHAIN ID
              </span>
              {mw.wrongNetwork ? (
                <span className="mono flex h-[26px] items-center self-start rounded-full bg-[var(--warn-tint)] px-2.5 text-[12px] font-bold tracking-[.06em] text-[var(--warn-ink)]">
                  {chainName(mw.walletChainId)}
                </span>
              ) : (
                <span className="anim-pop mono flex h-[26px] items-center gap-1 self-start rounded-full bg-[var(--ink)] px-2.5 pl-2 text-[12px] font-bold tracking-[.06em] text-[var(--bg)]">
                  <Icon name="check" className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={3.2} />
                  {APP_NET.toUpperCase()}
                </span>
              )}
            </span>
          </div>
        )}

        {phase === "fund" && (
          <div className={`${s.rise} flex items-baseline gap-2.5`}>
            <CountUp
              value={bal.data ? Number(bal.data.value) / 1e18 : 0}
              decimals={2}
              duration={900}
              className="text-[72px] font-extrabold leading-none tracking-[-0.06em]"
            />
            <span className="mono text-[14px] font-bold tracking-[.1em] text-[var(--muted)]">AVAX</span>
          </div>
        )}

        {editing && (
          <div className={s.rise}>
            <div
              className={`${s.handleRow} ${phase === "taken" || (handle && !HANDLE_RE.test(handle)) ? s.handleBad : ""}`}
            >
              <label htmlFor="onb-handle" className="sr-only">
                {t("handleLabel")}
              </label>
              <span aria-hidden className="text-[32px] font-extrabold text-[var(--muted)]">
                @
              </span>
              <input
                id="onb-handle"
                value={handle}
                onChange={(e) => onHandle(e.target.value)}
                disabled={phase === "signing"}
                aria-invalid={phase === "taken"}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder={tc("placeholder")}
                className={`${s.handleInput} placeholder:text-[var(--muted)]`}
                data-testid="handle-input"
              />
              {phase === "taken" && (
                <span
                  role="img"
                  aria-label={t("takenAria")}
                  className="anim-pop flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"
                >
                  <Icon name="x" className="h-3.5 w-3.5" strokeWidth={3.4} />
                </span>
              )}
              {phase === "register" && available && (
                <span
                  role="img"
                  aria-label={t("handleOk")}
                  className="anim-pop flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--ok)] text-[var(--bg)]"
                >
                  <Icon name="check" className="h-[15px] w-[15px]" strokeWidth={3.4} />
                </span>
              )}
            </div>

            {phase === "taken" && freeSuggestions.length > 0 && (
              <fieldset className="mt-4 flex flex-wrap gap-2 border-0 p-0">
                <legend className="sr-only">{t("suggestions")}</legend>
                {freeSuggestions.map((h, i) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onHandle(h)}
                    className={s.chip}
                    style={{ animationDelay: `${140 + i * 80}ms` }}
                  >
                    @{h}
                  </button>
                ))}
              </fieldset>
            )}

            <div className="mt-4 flex items-center gap-2 border-b border-[var(--line)]">
              <Icon name="user" className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" />
              <label htmlFor="onb-name" className="sr-only">
                {t("namePlaceholder")}
              </label>
              <input
                id="onb-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                disabled={phase === "signing"}
                placeholder={t("namePlaceholder")}
                autoComplete="name"
                className="h-11 min-w-0 flex-1 text-[16px] font-semibold placeholder:text-[var(--muted)]"
                data-testid="name-input"
              />
            </div>
          </div>
        )}

        {phase === "rejected" && (
          <p
            className={`${s.rise} mt-4 flex items-center gap-2 text-[14px] font-semibold text-[var(--ok-ink)]`}
          >
            <Icon name="checks" className="h-[18px] w-[18px]" strokeWidth={2.2} />
            {t("noGas")}
          </p>
        )}

        {phase === "done" && (
          <div
            className={`${s.rise} mono flex items-center gap-2.5 text-[12px] font-semibold tracking-[.08em]`}
          >
            <span className="flex h-6 items-center rounded-md bg-[var(--ink)] px-2 text-[var(--bg)]">
              ONCHAIN
            </span>
            {blockUrl && block !== null && (
              <a
                href={blockUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t("blockAria")}
                className="flex h-11 items-center gap-1 text-[var(--ink)] hover:underline"
                data-testid="welcome-block"
              >
                #{Number(block).toLocaleString("en-US")}
                <Icon name="external" className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto pt-8">
        {phase !== "done" && (
          <p className="mono mb-4 text-[10.5px] font-semibold tracking-[.1em] text-[var(--muted)]">
            {t("footnote", { net: network.name === "fuji" ? "FUJI TESTNET" : "LOCAL CHAIN" })}
          </p>
        )}
        <BottomAction
          phase={phase}
          t={t}
          busy={busy}
          funding={funding}
          available={available}
          switching={mw.switching}
          wrong={mw.wrongNetwork}
          lastAction={lastAction}
          onConnect={() => openConnectModal?.()}
          onSwitch={() => void mw.switchToApp().catch(() => undefined)}
          onDevFund={() => void devFund()}
          onJoin={() => void join()}
          onDevice={() => void enableDevice()}
        />
      </div>
    </>
  );
}

function BottomAction({
  phase,
  t,
  busy,
  funding,
  available,
  switching,
  wrong,
  lastAction,
  onConnect,
  onSwitch,
  onDevFund,
  onJoin,
  onDevice,
}: {
  phase: Phase;
  t: (key: string, values?: Record<string, string | number>) => string;
  busy: boolean;
  funding: boolean;
  available: boolean;
  switching: boolean;
  wrong: boolean;
  lastAction: "join" | "device";
  onConnect: () => void;
  onSwitch: () => void;
  onDevFund: () => void;
  onJoin: () => void;
  onDevice: () => void;
}) {
  const spin = <span className="spinner h-6! w-6!" aria-hidden />;

  if (phase === "connect")
    return (
      <button type="button" onClick={onConnect} className={s.bigBtn} data-testid="welcome-connect">
        <Icon name="wallet" className="h-[22px] w-[22px]" />
        {t("connectTitle")}
      </button>
    );
  if (phase === "loading")
    return (
      <button type="button" disabled className={s.bigBtn} aria-label={t("loadingTitle")}>
        {spin}
      </button>
    );
  if (phase === "network") {
    if (!wrong)
      return (
        <button
          type="button"
          disabled
          className={`${s.bigBtn} ${s.bigOk}`}
          aria-label={t("onNetwork", { name: APP_NET })}
        >
          <span className="anim-pop flex">
            <Icon name="check" className="h-7 w-7" strokeWidth={2.8} />
          </span>
        </button>
      );
    return switching ? (
      <button type="button" disabled className={s.bigBtn} aria-label={t("switching")}>
        {spin}
      </button>
    ) : (
      <button type="button" onClick={onSwitch} className={s.bigBtn} data-testid="welcome-switch">
        <Icon name="swap" className="h-[22px] w-[22px]" strokeWidth={2.2} />
        {t("switchTo", { name: APP_NET })}
      </button>
    );
  }
  if (phase === "fund") {
    if (funding)
      return (
        <button type="button" disabled className={s.bigBtn} aria-label={t("funding")}>
          {spin}
        </button>
      );
    return network.name === "fuji" ? (
      <a href={FAUCET_URL} target="_blank" rel="noreferrer" className={s.bigBtn} data-testid="faucet-link">
        <Icon name="external" className="h-5 w-5" />
        {t("faucet")}
      </a>
    ) : (
      <button type="button" onClick={onDevFund} className={s.bigBtn} data-testid="dev-fund">
        <Icon name="bolt" className="h-5 w-5" />
        10 AVAX
      </button>
    );
  }
  if (
    phase === "device" ||
    (lastAction === "device" && (phase === "signing" || phase === "rejected" || phase === "failed"))
  )
    return (
      <button
        type="button"
        onClick={onDevice}
        disabled={busy}
        className={s.bigBtn}
        data-testid="enable-device"
        aria-label={busy ? t("signingAria") : undefined}
      >
        {busy ? (
          spin
        ) : (
          <>
            <Icon name={phase === "device" ? "key" : "refresh"} className="h-5 w-5" strokeWidth={2.2} />
            {phase === "device" ? t("enableDevice") : t("tryAgain")}
          </>
        )}
      </button>
    );
  if (
    phase === "register" ||
    phase === "taken" ||
    phase === "signing" ||
    phase === "rejected" ||
    phase === "failed"
  ) {
    const retry = phase === "rejected" || phase === "failed";
    const off = !busy && !retry && !available;
    return (
      <button
        type="button"
        onClick={onJoin}
        disabled={busy || off}
        className={`${s.bigBtn} ${off ? s.bigOff : ""}`}
        data-testid="join-submit"
        aria-label={busy ? t("signingAria") : undefined}
      >
        {busy ? (
          spin
        ) : retry ? (
          <>
            <Icon name="refresh" className="h-5 w-5" strokeWidth={2.3} />
            {t("tryAgain")}
          </>
        ) : (
          t("create")
        )}
      </button>
    );
  }
  // done
  return (
    <div className={`${s.rise} flex flex-col gap-1.5`}>
      <Link href="/" className={`${s.bigBtn} ${s.goBtn}`} data-testid="welcome-done">
        {t("goFeed")}
        <span className={s.startDot}>
          <Arrow />
        </span>
      </Link>
      {FC_ENABLED && (
        <Link
          href="/import"
          className="flex h-11 items-center justify-center text-[15px] font-semibold underline decoration-[1.5px] underline-offset-4"
          data-testid="welcome-import"
        >
          {t("importFc")}
        </Link>
      )}
    </div>
  );
}
