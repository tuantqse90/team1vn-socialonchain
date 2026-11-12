"use client";

import {
  type DmKeyPair,
  type DmPayload,
  dmBindMessage,
  dmDecrypt,
  dmDeriveMessage,
  dmEncrypt,
  dmKeyFromSignature,
  dmSharedKey,
} from "@socialonchain/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useSignMessage } from "wagmi";
import { api } from "./api";
import { chain } from "./chain";
import { useSession } from "./session";
import type { Author } from "./types";

/**
 * Tin nhắn riêng, mã hoá đầu cuối (xem packages/protocol/src/dm.ts).
 * Khoá riêng nhắn tin chỉ nằm trong localStorage của thiết bị này, như session key. KHÔNG log, KHÔNG gửi đi.
 */
export type DmMessage = {
  id: number;
  sender: string;
  recipient: string;
  senderKey: string;
  recipientKey: string;
  nonce: string;
  ciphertext: string;
  createdAt: number;
};
export type DmThreadItem = {
  peer: Author;
  peerKey: string | null;
  state: "open" | "accepted" | "declined";
  box: "main" | "requests";
  unread: boolean;
  youFollow: boolean;
  followsYou: boolean;
  mutuals: number;
  lastMessage: DmMessage | null;
};
export type DmThread = {
  peer: Author | undefined;
  state: "open" | "accepted" | "declined";
  box: "main" | "requests";
  peerReadId: number;
  pending: boolean;
  sentCount: number;
  limits: { requestMessages: number; newThreadsPerDay: number; perMinute: number };
  messages: DmMessage[];
  nextBefore: number | null;
};
type KeyRecord = { publicKey: string; signature: string; createdAt: number };
type KeysResponse = { address: string; current: KeyRecord | null; keys: KeyRecord[] };

const storageKey = (owner: string) => `soc:dm:${chain.id}:${owner.toLowerCase()}`;
const CHANGED = "soc:dm-changed";

function readKeys(owner: string): DmKeyPair | null {
  try {
    const v = localStorage.getItem(storageKey(owner));
    return v ? (JSON.parse(v) as DmKeyPair) : null;
  } catch {
    return null;
  }
}
function writeKeys(owner: string, kp: DmKeyPair | null) {
  try {
    if (kp) localStorage.setItem(storageKey(owner), JSON.stringify(kp));
    else localStorage.removeItem(storageKey(owner));
  } catch {
    // storage bị chặn: khoá chỉ sống trong phiên này
  }
  window.dispatchEvent(new Event(CHANGED));
}

export type DmStatus = "no-session" | "loading" | "off" | "stale" | "ready";

/** Khoá nhắn tin của chính mình trên thiết bị này. */
export function useDmKeys() {
  const { owner, status: session, token } = useSession();
  const qc = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [keys, setKeys] = useState<DmKeyPair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) {
      setKeys(null);
      setLoaded(true);
      return;
    }
    const load = () => {
      setKeys(readKeys(owner));
      setLoaded(true);
    };
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [owner]);

  const published = useQuery({
    queryKey: ["dm-keys", owner?.toLowerCase()],
    queryFn: () => api<KeysResponse>(`/dm/keys/${owner?.toLowerCase()}`),
    enabled: Boolean(owner),
    staleTime: 60_000,
  });

  const enable = useCallback(async () => {
    if (!owner || !token) return;
    setEnabling(true);
    setError(null);
    try {
      // 1 chữ ký (bí mật) → khoá tất định. Ví ký tất định thì thiết bị nào cũng ra cùng khoá.
      const kp = await dmKeyFromSignature(await signMessageAsync({ message: dmDeriveMessage(owner) }));
      const cur = await api<KeysResponse>(`/dm/keys/${owner.toLowerCase()}`);
      if (cur.current?.publicKey !== kp.publicKey) {
        // Lần đầu (hoặc khoá khác): ký xác nhận khoá công khai để người khác tự kiểm.
        const signature = await signMessageAsync({ message: dmBindMessage(owner, kp.publicKey) });
        await api("/dm/key", { method: "PUT", json: { publicKey: kp.publicKey, signature } });
      }
      writeKeys(owner, kp);
      await qc.invalidateQueries({ queryKey: ["dm-keys"] });
      await qc.invalidateQueries({ queryKey: ["dm"] });
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]?.slice(0, 160) || "error" : "error");
    } finally {
      setEnabling(false);
    }
  }, [owner, token, signMessageAsync, qc]);

  const forget = useCallback(() => {
    if (owner) writeKeys(owner, null);
  }, [owner]);

  let status: DmStatus = "loading";
  if (session !== "ready" || !token) status = session === "loading" ? "loading" : "no-session";
  else if (!loaded || published.isPending) status = "loading";
  else if (!keys) status = "off";
  else if (published.data?.current?.publicKey !== keys.publicKey) status = "stale";
  else status = "ready";

  return { status, keys: status === "ready" ? keys : null, enable, enabling, error, forget };
}

/** Khoá công khai của người khác, chỉ giữ những khoá có chữ ký owner hợp lệ (tự kiểm, không tin server). */
export function usePeerKeys(address: string | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["dm-keys", address?.toLowerCase(), "verified"],
    enabled: Boolean(address && client),
    staleTime: 60_000,
    queryFn: async () => {
      const r = await api<KeysResponse>(`/dm/keys/${address?.toLowerCase()}`);
      const verified = new Set<string>();
      for (const k of r.keys) {
        const ok = await client
          ?.verifyMessage({
            address: r.address as Address,
            message: dmBindMessage(r.address as Address, k.publicKey as Hex),
            signature: k.signature as Hex,
          })
          .catch(() => false);
        if (ok) verified.add(k.publicKey);
      }
      const current = r.current && verified.has(r.current.publicKey) ? r.current.publicKey : null;
      return { current, verified };
    },
  });
}

type AesKey = Awaited<ReturnType<typeof dmSharedKey>>;
const sharedCache = new Map<string, Promise<AesKey>>();
function shared(kp: DmKeyPair, theirKey: string, me: string, them: string): Promise<AesKey> {
  const id = `${kp.publicKey}|${theirKey}|${me}|${them}`;
  let k = sharedCache.get(id);
  if (!k) {
    k = dmSharedKey(kp.privateKey, theirKey as Hex, me as Address, them as Address);
    sharedCache.set(id, k);
  }
  return k;
}

export type Decrypted =
  | { ok: true; payload: DmPayload }
  | { ok: false; reason: "old-key" | "unverified" | "bad" };

export async function decryptMessage(
  m: DmMessage,
  me: string,
  kp: DmKeyPair,
  verifiedPeerKeys: Set<string>,
): Promise<Decrypted> {
  const mine = m.sender === me;
  const myKey = mine ? m.senderKey : m.recipientKey;
  const theirKey = mine ? m.recipientKey : m.senderKey;
  const peer = mine ? m.recipient : m.sender;
  if (myKey !== kp.publicKey) return { ok: false, reason: "old-key" };
  if (!verifiedPeerKeys.has(theirKey)) return { ok: false, reason: "unverified" };
  const k = await shared(kp, theirKey, me, peer);
  const payload = await dmDecrypt(k, m, m.sender as Address, m.recipient as Address);
  return payload ? { ok: true, payload } : { ok: false, reason: "bad" };
}

/** Giải mã cả loạt (chỉ trong bộ nhớ, không lưu plaintext). */
export function useDecrypted(
  messages: DmMessage[] | undefined,
  me: string | undefined,
  kp: DmKeyPair | null,
  peerKeys: Map<string, Set<string>>,
) {
  const ids = (messages ?? []).map((m) => m.id).join(",");
  const keySig = [...peerKeys.entries()].map(([a, s]) => `${a}:${s.size}`).join(",");
  return useQuery({
    queryKey: ["dm-plain", me, kp?.publicKey, ids, keySig],
    enabled: Boolean(messages && me && kp),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const out = new Map<number, Decrypted>();
      for (const m of messages ?? []) {
        const peer = m.sender === me ? m.recipient : m.sender;
        out.set(
          m.id,
          await decryptMessage(m, me as string, kp as DmKeyPair, peerKeys.get(peer) ?? new Set()),
        );
      }
      return out;
    },
  });
}

export async function sendDm(opts: {
  me: string;
  to: string;
  kp: DmKeyPair;
  peerKey: string;
  payload: DmPayload;
}): Promise<DmMessage> {
  const k = await shared(opts.kp, opts.peerKey, opts.me, opts.to);
  const env = await dmEncrypt(k, opts.payload, opts.me as Address, opts.to as Address);
  return api<DmMessage>("/dm/messages", {
    method: "POST",
    json: { to: opts.to, senderKey: opts.kp.publicKey, recipientKey: opts.peerKey, ...env },
  });
}

export function useDmUnread() {
  const { token } = useSession();
  return useQuery({
    queryKey: ["dm", "unread", token],
    queryFn: () => api<{ main: number; requests: number }>("/dm/unread"),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
}
