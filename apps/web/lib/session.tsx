"use client";

import { DEFAULT_SESSION_DAYS, identityRegistryAbi, sessionAuthMessage } from "@socialonchain/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Address, createWalletClient, type Hex, http, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useBalance, useReadContract } from "wagmi";
import { api, setApiToken } from "./api";
import { chain, contracts, rpcUrl } from "./chain";
import { useEmbeddedWallet } from "./embedded";
import { EMPTY_GAS_WEI, LOW_GAS_WEI } from "./gas";
import type { Me } from "./types";

/**
 * Session key: một EOA sinh trong trình duyệt, được owner uỷ quyền 1 lần qua `registerWithDelegate`/`addDelegate`
 * và được nạp sẵn gas. Mọi thao tác xã hội (post, like, follow…) ký bằng key này: không popup ví.
 * Private key chỉ nằm trong localStorage của thiết bị này. KHÔNG BAO GIỜ log/gửi nó đi đâu.
 */
type StoredSession = { pk: Hex; address: Address; expiresAt: number; createdAt: number };
type StoredToken = { token: string; expiresAt: number; key: string };

const sKey = (owner: string) => `soc:session:${chain.id}:${owner.toLowerCase()}`;
const tKey = (owner: string) => `soc:jwt:${chain.id}:${owner.toLowerCase()}`;

function readJson<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(k: string, v: unknown | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // storage bị chặn: session chỉ sống trong bộ nhớ
  }
}

export type SessionStatus = "disconnected" | "loading" | "unregistered" | "needs-key" | "ready";

type Ctx = {
  owner: Address | undefined;
  status: SessionStatus;
  registered: boolean | undefined;
  session: StoredSession | null;
  sessionBalance: bigint | undefined;
  sessionWallet: WalletClient | null;
  token: string | null;
  me: Me | undefined;
  /** Sinh key mới và lưu NGAY (trước khi gửi tx nạp gas, để không mất tiền nếu tải lại trang). */
  prepareKey: (days?: number) => StoredSession;
  discardKey: () => void;
  login: () => Promise<void>;
  refresh: () => void;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address: owner, hydrated } = useEmbeddedWallet();
  const qc = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) {
      setSession(null);
      setToken(null);
      setApiToken(null);
      return;
    }
    setSession(readJson<StoredSession>(sKey(owner)));
    const t = readJson<StoredToken>(tKey(owner));
    const valid = t && t.expiresAt > Date.now() / 1000 + 60 ? t.token : null;
    setToken(valid);
    setApiToken(valid);
  }, [owner]);

  const registered = useReadContract({
    address: contracts?.IdentityRegistry,
    abi: identityRegistryAbi,
    functionName: "registered",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(owner && contracts) },
  });
  const authorized = useReadContract({
    address: contracts?.IdentityRegistry,
    abi: identityRegistryAbi,
    functionName: "isAuthorized",
    args: owner && session ? [owner, session.address] : undefined,
    query: { enabled: Boolean(owner && session && contracts), refetchInterval: 60_000 },
  });
  const balance = useBalance({
    address: session?.address,
    query: { enabled: Boolean(session), refetchInterval: 15_000 },
  });

  const sessionWallet = useMemo(
    () =>
      session
        ? createWalletClient({ account: privateKeyToAccount(session.pk), chain, transport: http(rpcUrl) })
        : null,
    [session],
  );

  const login = useCallback(async () => {
    if (!owner || !session) return;
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = { owner, key: session.address, chainId: chain.id, issuedAt };
    const signature = await privateKeyToAccount(session.pk).signMessage({
      message: sessionAuthMessage(payload),
    });
    const r = await api<{ token: string; expiresAt: number }>("/auth/session", {
      method: "POST",
      json: { ...payload, signature },
    });
    writeJson(tKey(owner), { token: r.token, expiresAt: r.expiresAt, key: session.address });
    setToken(r.token);
    setApiToken(r.token);
    await qc.invalidateQueries();
  }, [owner, session, qc]);

  // Tự đăng nhập bằng session key (không popup) khi key còn hiệu lực onchain.
  useEffect(() => {
    if (!token && authorized.data === true) void login().catch(() => undefined);
  }, [token, authorized.data, login]);

  const me = useQuery({
    queryKey: ["me", owner, token],
    queryFn: () => api<Me>("/me"),
    enabled: Boolean(token),
    retry: false,
  });

  const prepareKey = useCallback(
    (days = DEFAULT_SESSION_DAYS) => {
      if (!owner) throw new Error("not connected");
      const pk = generatePrivateKey();
      const s: StoredSession = {
        pk,
        address: privateKeyToAccount(pk).address,
        expiresAt: Math.floor(Date.now() / 1000) + days * 86400,
        createdAt: Math.floor(Date.now() / 1000),
      };
      writeJson(sKey(owner), s);
      writeJson(tKey(owner), null);
      setSession(s);
      setToken(null);
      setApiToken(null);
      return s;
    },
    [owner],
  );

  const discardKey = useCallback(() => {
    if (!owner) return;
    writeJson(sKey(owner), null);
    writeJson(tKey(owner), null);
    setSession(null);
    setToken(null);
    setApiToken(null);
  }, [owner]);

  const refresh = useCallback(() => {
    void registered.refetch();
    void authorized.refetch();
    void balance.refetch();
    void me.refetch();
  }, [registered, authorized, balance, me]);

  let status: SessionStatus = "loading";
  if (hydrated && !owner) status = "disconnected";
  else if (!owner) status = "loading";
  else if (registered.data === false) status = "unregistered";
  else if (registered.data === true) status = session && authorized.data !== false ? "ready" : "needs-key";

  return (
    <SessionContext.Provider
      value={{
        owner,
        status,
        registered: registered.data,
        session,
        sessionBalance: balance.data?.value,
        sessionWallet,
        token,
        me: me.data,
        prepareKey,
        discardKey,
        login,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

export { EMPTY_GAS_WEI, LOW_GAS_WEI, TOP_UP_OPTIONS } from "./gas";

export type GasLevel = "ok" | "low" | "empty";
export function gasLevel(balance: bigint | undefined): GasLevel {
  if (balance === undefined) return "ok";
  if (balance < EMPTY_GAS_WEI) return "empty";
  if (balance < LOW_GAS_WEI) return "low";
  return "ok";
}

/**
 * Trả phần gas còn lại của session key về ví owner (ký bằng chính key đó, không popup).
 * Dùng tx legacy để phí = 21000 × gasPrice, chuyển đúng phần dư.
 */
export async function sweepKey(pk: Hex, to: Address): Promise<Hex | null> {
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const { createPublicClient } = await import("viem");
  const pub = createPublicClient({ chain, transport: http(rpcUrl) });
  const [bal, gasPrice] = await Promise.all([
    pub.getBalance({ address: account.address }),
    pub.getGasPrice(),
  ]);
  const price = (gasPrice * 12n) / 10n;
  const fee = 21_000n * price;
  if (bal <= fee * 2n) return null;
  const hash = await wallet.sendTransaction({
    to,
    value: bal - fee,
    gas: 21_000n,
    gasPrice: price,
    type: "legacy",
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
