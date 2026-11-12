"use client";

import { DEFAULT_SESSION_DAYS, HANDLE_RE, identityRegistryAbi, PASSWORD_MIN } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Hash, keccak256, toBytes, zeroAddress } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { Icon } from "@/components/Icon";
import { IdCard, type IdCardVariant, type IdField } from "@/components/IdCard";
import { Burst, CountUp } from "@/components/kit";
import { clientConfig } from "@/configs";
import { API_URL, ApiError, api, track } from "@/lib/api";
import { contracts, FAUCET_URL, network, rpcUrl } from "@/lib/chain";
import { login, signup, useEmbeddedWallet } from "@/lib/embedded";
import { shortAddr } from "@/lib/format";
import { MIN_OWNER_WEI, OWNER_FEE_RESERVE_WEI, SESSION_FUNDING_WEI } from "@/lib/gas";
import { useSession } from "@/lib/session";
import { publicClient, useTx } from "@/lib/tx";
import type { User } from "@/lib/types";
import { useMainWallet } from "@/lib/wallet";
import s from "./onboarding.module.css";
import { Arrow, Dots, TopBar } from "./parts";
import { type Picks, patchPending, type Role } from "./picks";
import { roleFields } from "./RoleSteps";

const APP_NET = network.name === "fuji" ? "Fuji" : "Local";
const FUJI = network.name === "fuji";
const FC_ENABLED = clientConfig.enabledSources.some((x) => x.startsWith("farcaster"));

type Phase =
  | "account"
  | "creating"
  | "loading"
  | "fund"
  | "register"
  | "taken"
  | "signing"
  | "failed"
  | "device"
  | "done";
type Mode = "signup" | "login";
type AuthError = "bad_credentials" | "handle_taken" | "rate_limited" | "failed";

/** Số AVAX gọn: số nhỏ (Fuji tặng 0.002) thì giữ 4 chữ số. */
function avax(wei: bigint | undefined): string {
  if (wei === undefined) return "—";
  const v = Number(wei) / 1e18;
  return `${v.toFixed(v > 0 && v < 0.1 ? 4 : 2)} AVAX`;
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

function authErrorOf(e: unknown, mode: Mode): AuthError {
  if (e instanceof ApiError) {
    if (mode === "login" && (e.status === 401 || e.status === 404)) return "bad_credentials";
    if (e.status === 409) return "handle_taken";
    if (e.status === 429) return "rate_limited";
  }
  // Giải mã keystore lỗi (keystore hỏng/bị sửa) → coi như sai mật khẩu.
  if (mode === "login" && e instanceof Error && /aes|tag|invalid/i.test(e.message)) return "bad_credentials";
  return "failed";
}

/** 3 gợi ý: @{h}_vn, @{h}_dev, dạng ngắn. */
function suggestHandles(h: string): string[] {
  const compact = h.length > 4 ? `${h.charAt(0)}${h.slice(-3)}` : `${h}_x`;
  return [...new Set([`${h}_vn`, `${h}_dev`, compact].map((x) => x.slice(0, 20)))].filter(
    (x) => x !== h && HANDLE_RE.test(x),
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
  const ta = useTranslations("account");
  const tc = useTranslations("idcard");
  const wallet = useEmbeddedWallet();
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

  const [mode, setMode] = useState<Mode>("signup");
  const [handle, setHandle] = useState("");
  const [debounced, setDebounced] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [dripSkipped, setDripSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<null | "failed" | "taken">(null);
  const [lastAction, setLastAction] = useState<"join" | "device">("join");
  const [doneBlock, setDoneBlock] = useState<bigint | null>(null);
  /** Tx đăng ký đã lên chain, đang đợi trạng thái session cập nhật: giữ spinner, không nháy "tên đã có chủ". */
  const [joined, setJoined] = useState(false);
  const [burst, setBurst] = useState(0);
  const [funding, setFunding] = useState(false);
  const [fundFlash, setFundFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shake, setShake] = useState(0);
  /** Mỗi owner chỉ tự chạy join/bật thiết bị 1 lần; lỗi thì người dùng bấm "Thử lại". */
  const autoRan = useRef<string | null>(null);

  // Đã có ví (đăng nhập ở máy này) mà chưa có danh tính onchain: điền sẵn tên tài khoản.
  useEffect(() => {
    if (wallet.handle && !handle) setHandle(wallet.handle);
  }, [wallet.handle, handle]);

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
  /** Tên đã có tài khoản trong app (chưa chắc đã lên chain). */
  const accountExists = useQuery({
    queryKey: ["account-exists", debounced],
    queryFn: async () => {
      try {
        await api(`/accounts/kdf/${encodeURIComponent(debounced)}`);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return false;
        throw e;
      }
    },
    enabled: status === "disconnected" && mode === "signup" && HANDLE_RE.test(debounced),
    retry: false,
    staleTime: 30_000,
  });
  const ownsHandle = (o: string | undefined) =>
    Boolean(o && owner && o.toLowerCase() === owner.toLowerCase());
  const chainFree = ownerOf.data === zeroAddress || ownsHandle(ownerOf.data);
  const available =
    valid &&
    ownerOf.data !== undefined &&
    chainFree &&
    (status !== "disconnected" || accountExists.data === false);
  const takenNow =
    valid &&
    ((ownerOf.data !== undefined && !chainFree) ||
      (status === "disconnected" && accountExists.data === true));

  const balance = bal.data?.value;
  const enough = (balance ?? 0n) >= MIN_OWNER_WEI;
  /** Bật thiết bị mới: owner nạp cho key mới phần còn lại sau khi chừa phí (tối đa mức chuẩn). */
  const deviceValue = (() => {
    if (balance === undefined) return 0n;
    const spare = balance - OWNER_FEE_RESERVE_WEI;
    // bigint: không dùng Math.min
    if (spare > SESSION_FUNDING_WEI) return SESSION_FUNDING_WEI;
    return spare;
  })();
  const deviceShort = balance !== undefined && deviceValue <= 0n;

  // Vừa đủ AVAX: để số chạy xong rồi mới đi tiếp.
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
    if (status === "unregistered") track("onboarding_step", { step: "started" });
  }, [status]);

  let phase: Phase;
  if (status === "disconnected") phase = authBusy ? "creating" : "account";
  else if (status === "loading") phase = "loading";
  else if (status === "ready") phase = "done";
  else if (busy || (joined && status === "unregistered")) phase = "signing";
  else if (outcome === "failed") phase = "failed";
  else if (status === "needs-key")
    phase = deviceShort ? "fund" : balance === undefined ? "loading" : "device";
  else if (!bal.data) phase = "loading";
  else if (!enough || fundFlash) phase = "fund";
  else if (takenNow || outcome === "taken") phase = "taken";
  else phase = "register";
  const showTaken = phase === "account" && mode === "signup" && takenNow;

  // Lắc thẻ khi vào trạng thái lỗi.
  const prevPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (prevPhase.current !== phase && ["taken", "failed"].includes(phase)) setShake((k) => k + 1);
    prevPhase.current = phase;
  }, [phase]);
  useEffect(() => {
    if (authError) setShake((k) => k + 1);
  }, [authError]);

  const suggestions = useMemo(
    () => (phase === "taken" || showTaken ? suggestHandles(handle) : []),
    [phase, showTaken, handle],
  );
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

  async function submitAccount(e?: FormEvent) {
    e?.preventDefault();
    if (authBusy) return;
    const h = handle;
    if (!HANDLE_RE.test(h) || password.length < PASSWORD_MIN) return;
    if (mode === "signup" && !available) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (mode === "signup") {
        const r = await signup(h, password);
        setDripSkipped(!r.drip && r.dripSkipped !== "funded");
        track("onboarding_step", { step: "account_created", drip: Boolean(r.drip) });
      } else {
        await login(h, password);
        track("onboarding_step", { step: "account_login" });
      }
      setPassword("");
    } catch (err) {
      setAuthError(authErrorOf(err, mode));
    } finally {
      setAuthBusy(false);
    }
  }

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

  async function copyAddress() {
    if (!owner) return;
    try {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bị chặn (http LAN): người dùng chép từ thẻ
    }
  }

  async function join() {
    if (!contracts || !owner || !available || busy) return;
    setLastAction("join");
    setOutcome(null);
    setBusy(true);
    // Kiểm tra lại ngay trước khi gửi: tránh tốn gas khi handle vừa bị lấy.
    try {
      const o = await publicClient.readContract({
        address: contracts.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "ownerOfHandle",
        args: [keccak256(toBytes(handle))],
      });
      if (o !== zeroAddress && !ownsHandle(o)) {
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
          value: SESSION_FUNDING_WEI,
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
      track("onboarding_step", { step: "registered" });
      refresh();
    } else if (revert === "HandleTaken" || /HandleTaken/.test(r.error)) setOutcome("taken");
    else setOutcome("failed");
  }

  async function enableDevice() {
    if (!contracts || !owner || busy || deviceValue <= 0n) return;
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
        value: deviceValue,
      }),
    );
    setBusy(false);
    if (r.ok) {
      setBurst((k) => k + 1);
      refresh();
    } else setOutcome("failed");
  }

  // Ví nhúng ký ngầm: vừa tạo tài khoản (có tên) thì tự lên chain; máy mới thì tự bật thiết bị.
  // biome-ignore lint/correctness/useExhaustiveDependencies: join/enableDevice đọc state mới nhất trong lần render này
  useEffect(() => {
    if (!owner || busy) return;
    if (phase === "register" && wallet.handle && handle === wallet.handle && available) {
      const k = `join:${owner}`;
      if (autoRan.current === k) return;
      autoRan.current = k;
      void join();
    } else if (phase === "device") {
      const k = `device:${owner}`;
      if (autoRan.current === k) return;
      autoRan.current = k;
      void enableDevice();
    }
  }, [phase, owner, busy, wallet.handle, handle, available]);

  function onHandle(v: string) {
    setHandle(
      v
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20),
    );
    if (outcome) setOutcome(null);
    if (authError) setAuthError(null);
  }

  // ---------- Thẻ ----------
  const contractsN = user.data?.builder?.contractsDeployed ?? 0;
  const variant: IdCardVariant = role ?? (contractsN > 0 ? "builder" : "reader");
  const registeredHandle = user.data?.handle ?? null;
  /** Đã có danh tính onchain (chỉ còn bật thiết bị hoặc đã xong). */
  const registered = status === "ready" || status === "needs-key";
  const accountForm = phase === "account" || phase === "creating";
  const editing =
    !registered &&
    !accountForm &&
    (phase === "register" ||
      phase === "taken" ||
      (lastAction === "join" && (phase === "signing" || phase === "failed")));
  const cardHandle = registered
    ? (registeredHandle ?? (handle || null))
    : (editing || accountForm) && handle
      ? handle
      : null;
  let fields: IdField[];
  if (registered) {
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
  } else {
    fields = [
      { k: tc("wallet"), v: addr ? shortAddr(addr) : "—" },
      { k: tc("balance"), v: addr ? avax(balance) : "—" },
      { k: tc("session"), v: addr && enough ? tc("days", { n: DEFAULT_SESSION_DAYS }) : "—" },
    ];
  }
  const block = doneBlock ?? user.data?.registeredBlock ?? null;
  const badge: { kind: "err"; label: string } | null =
    phase === "failed" ? { kind: "err", label: t("failedTitle") } : null;

  const titles: Record<Phase, ReactNode> = {
    account: mode === "signup" ? (showTaken ? t("handleTaken") : ta("signupTitle")) : ta("loginTitle"),
    creating: mode === "signup" ? ta("creating") : ta("unlocking"),
    loading: t("loadingTitle"),
    fund: t("fundTitle"),
    register: t("handleTitle"),
    taken: t("handleTaken"),
    signing: lastAction === "device" ? ta("enablingDevice") : t("signingTitle"),
    failed: t("failedTitle"),
    device: ta("enablingDevice"),
    done: registeredHandle || handle ? `@${registeredHandle ?? handle}` : t("ready"),
  };

  const blockUrl = network.explorerUrl && block !== null ? `${network.explorerUrl}/block/${block}` : null;
  const cardAnim = phase === "done" && burst > 0 ? "anim-celebrate" : shake > 0 ? s.shake : "";
  const pwShort = password.length > 0 && password.length < PASSWORD_MIN;
  const canSubmit =
    HANDLE_RE.test(handle) && password.length >= PASSWORD_MIN && (mode === "login" || available);

  const handleInput = (
    <div
      className={`${s.handleRow} ${phase === "taken" || showTaken || (handle && !HANDLE_RE.test(handle)) ? s.handleBad : ""}`}
    >
      <label htmlFor="onb-handle" className="sr-only">
        {t("handleLabel")}
      </label>
      <span aria-hidden className="text-[32px] font-extrabold text-[var(--muted)]">
        @
      </span>
      <input
        id="onb-handle"
        name="username"
        value={handle}
        onChange={(e) => onHandle(e.target.value)}
        disabled={phase === "signing" || phase === "creating"}
        aria-invalid={phase === "taken" || showTaken}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
        placeholder={tc("placeholder")}
        className={`${s.handleInput} placeholder:text-[var(--muted)]`}
        data-testid="handle-input"
      />
      {(phase === "taken" || showTaken) && (
        <span
          role="img"
          aria-label={t("takenAria")}
          className="anim-pop flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"
        >
          <Icon name="x" className="h-3.5 w-3.5" strokeWidth={3.4} />
        </span>
      )}
      {(phase === "register" || (phase === "account" && mode === "signup")) && available && (
        <span
          role="img"
          aria-label={t("handleOk")}
          className="anim-pop flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--ok)] text-[var(--bg)]"
        >
          <Icon name="check" className="h-[15px] w-[15px]" strokeWidth={3.4} />
        </span>
      )}
    </div>
  );

  const suggestionChips = freeSuggestions.length > 0 && (
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
  );

  const nameInput = (
    <div className="mt-4 flex items-center gap-2 border-b border-[var(--line)]">
      <Icon name="user" className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" />
      <label htmlFor="onb-name" className="sr-only">
        {t("namePlaceholder")}
      </label>
      <input
        id="onb-name"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 50))}
        disabled={phase === "signing" || phase === "creating"}
        placeholder={t("namePlaceholder")}
        autoComplete="name"
        className="h-11 min-w-0 flex-1 text-[16px] font-semibold placeholder:text-[var(--muted)]"
        data-testid="name-input"
      />
    </div>
  );

  return (
    <>
      <TopBar onBack={phase === "done" ? undefined : onBack} skip={phase !== "done"}>
        {phase !== "done" && (
          <span className="ml-auto pr-1">
            <Dots at={2} />
          </span>
        )}
      </TopBar>

      <div className={`relative mx-auto mt-3 w-full max-w-[342px] ${accountForm ? s.cardCompact : ""}`}>
        <div key={`${cardAnim}-${shake}-${burst}`} className={cardAnim}>
          <IdCard
            variant={variant}
            handle={cardHandle}
            address={addr}
            fields={fields}
            minted={registered}
            block={block}
            verified={variant === "builder" && contractsN > 0 ? tc("stampSub", { n: contractsN }) : null}
            printing={phase === "signing" || phase === "creating"}
            shine={phase === "done" ? "once" : "none"}
            tilt
          />
        </div>
        {phase === "done" && <Burst k={burst} />}
        {badge && (
          <span
            role="img"
            aria-label={badge.label}
            className={`${s.badge} ${s.halo}`}
            style={
              {
                background: "var(--accent)",
                color: "var(--accent-ink)",
                "--halo": "var(--accent)",
              } as React.CSSProperties
            }
          >
            <span className="anim-pop flex">
              <Icon name="x" className="h-[22px] w-[22px]" strokeWidth={2.8} />
            </span>
          </span>
        )}
      </div>

      <div aria-live="polite" className={`${accountForm ? "mt-5" : "mt-8"} min-h-[44px]`}>
        <h1 key={`${phase}-${mode}`} className={`${s.title} ${s.rise}`}>
          {titles[phase]}
        </h1>
      </div>

      <div className="mt-5">
        {accountForm && (
          <form id="onb-account" onSubmit={(e) => void submitAccount(e)} className={s.rise} noValidate>
            {handleInput}
            {showTaken && suggestionChips}
            {mode === "signup" && nameInput}
            <div
              className={`mt-4 flex items-center gap-2 border-b ${pwShort || authError === "bad_credentials" ? "border-[var(--err)]" : "border-[var(--line)]"}`}
            >
              <Icon name="lock" className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" />
              <label htmlFor="onb-password" className="sr-only">
                {ta("password")}
              </label>
              <input
                id="onb-password"
                name="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError(null);
                }}
                disabled={phase === "creating"}
                placeholder={ta("password")}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-11 min-w-0 flex-1 text-[16px] font-semibold placeholder:text-[var(--muted)]"
                data-testid="password-input"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? ta("hidePassword") : ta("showPassword")}
                aria-pressed={showPw}
                className="press flex h-11 w-11 items-center justify-center text-[var(--muted)]"
              >
                <Icon name={showPw ? "eyeoff" : "eye"} className="h-5 w-5" />
              </button>
            </div>
            <p
              className={`mt-3 flex items-center gap-2 text-[13px] font-semibold ${authError ? "text-[var(--err-ink)]" : "text-[var(--muted)]"}`}
              data-testid="account-hint"
            >
              <Icon
                name={authError ? "alert" : mode === "signup" ? "key" : "lock"}
                className="h-4 w-4 shrink-0"
              />
              {authError
                ? ta(`errors.${authError}`)
                : pwShort || mode === "login"
                  ? ta("passwordMin", { n: PASSWORD_MIN })
                  : ta("noRecovery")}
            </p>
          </form>
        )}

        {phase === "fund" && (
          <div className={s.rise}>
            <div className="flex items-baseline gap-2.5">
              <CountUp
                value={balance !== undefined ? Number(balance) / 1e18 : 0}
                decimals={FUJI ? 4 : 2}
                duration={900}
                className="text-[64px] font-extrabold leading-none tracking-[-0.06em]"
              />
              <span className="mono text-[14px] font-bold tracking-[.1em] text-[var(--muted)]">AVAX</span>
            </div>
            {dripSkipped && (
              <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--muted)]">
                <Icon name="fuel" className="h-4 w-4 shrink-0" />
                {ta("dripSkipped")}
              </p>
            )}
            {owner && (
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="press mono mt-3 flex h-11 items-center gap-2 text-[13px] font-semibold"
                data-testid="copy-address"
              >
                <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
                {copied ? ta("copied") : shortAddr(owner.toLowerCase())}
              </button>
            )}
          </div>
        )}

        {editing && (
          <div className={s.rise}>
            {handleInput}
            {phase === "taken" && suggestionChips}
            {nameInput}
          </div>
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
        {phase !== "done" && !accountForm && (
          <p className="mono mb-4 text-[10.5px] font-semibold tracking-[.1em] text-[var(--muted)]">
            {t("footnote", { net: FUJI ? "FUJI TESTNET" : "LOCAL CHAIN" })}
          </p>
        )}
        <BottomAction
          phase={phase}
          mode={mode}
          t={t}
          ta={ta}
          busy={busy}
          funding={funding}
          available={available}
          canSubmit={canSubmit}
          lastAction={lastAction}
          onDevFund={() => void devFund()}
          onJoin={() => void join()}
          onDevice={() => void enableDevice()}
        />
        {phase === "account" && (
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signup" ? "login" : "signup"));
              setAuthError(null);
            }}
            className="press mt-1.5 flex h-11 w-full items-center justify-center text-[15px] font-semibold underline decoration-[1.5px] underline-offset-4"
            data-testid="auth-switch"
          >
            {mode === "signup" ? ta("haveAccount") : ta("newAccount")}
          </button>
        )}
      </div>
    </>
  );
}

function BottomAction({
  phase,
  mode,
  t,
  ta,
  busy,
  funding,
  available,
  canSubmit,
  lastAction,
  onDevFund,
  onJoin,
  onDevice,
}: {
  phase: Phase;
  mode: Mode;
  t: (key: string, values?: Record<string, string | number>) => string;
  ta: (key: string, values?: Record<string, string | number>) => string;
  busy: boolean;
  funding: boolean;
  available: boolean;
  canSubmit: boolean;
  lastAction: "join" | "device";
  onDevFund: () => void;
  onJoin: () => void;
  onDevice: () => void;
}) {
  const spin = <span className="spinner h-6! w-6!" aria-hidden />;

  if (phase === "account")
    return (
      <button
        type="submit"
        form="onb-account"
        disabled={!canSubmit}
        className={`${s.bigBtn} ${canSubmit ? "" : s.bigOff}`}
        data-testid="account-submit"
      >
        {mode === "signup" ? ta("submitSignup") : ta("submitLogin")}
      </button>
    );
  if (phase === "creating" || phase === "loading")
    return (
      <button type="button" disabled className={s.bigBtn} aria-label={t("loadingTitle")}>
        {spin}
      </button>
    );
  if (phase === "fund") {
    if (funding)
      return (
        <button type="button" disabled className={s.bigBtn} aria-label={t("funding")}>
          {spin}
        </button>
      );
    return FUJI ? (
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
  if (phase === "device" || (lastAction === "device" && (phase === "signing" || phase === "failed")))
    return (
      <button
        type="button"
        onClick={onDevice}
        disabled={busy || phase === "device"}
        className={s.bigBtn}
        data-testid="enable-device"
        aria-label={busy || phase === "device" ? t("signingAria") : undefined}
      >
        {busy || phase === "device" ? (
          spin
        ) : (
          <>
            <Icon name="refresh" className="h-5 w-5" strokeWidth={2.2} />
            {t("tryAgain")}
          </>
        )}
      </button>
    );
  if (phase === "register" || phase === "taken" || phase === "signing" || phase === "failed") {
    const retry = phase === "failed";
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
