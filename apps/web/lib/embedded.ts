"use client";

import {
  accountMessage,
  createAccountSecrets,
  decryptKeystore,
  deriveAccountKeys,
  type KdfParams,
  type Keystore,
} from "@socialonchain/protocol";
import { useSyncExternalStore } from "react";
import { type Address, createWalletClient, getAddress, type Hex, http, type PrivateKeyAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { api } from "./api";
import { chain, rpcUrl } from "./chain";

/**
 * Ví nhúng (owner): không dùng ví ngoài, không popup. Người dùng chỉ có tên + mật khẩu.
 * - Đăng ký: sinh private key trong máy → mã hoá bằng khoá dẫn xuất từ mật khẩu → server chỉ giữ ciphertext.
 * - Đăng nhập máy khác: tên + mật khẩu → lấy ciphertext → giải mã trong máy.
 * - Sau khi mở khoá, private key nằm trong localStorage của thiết bị (như session key) để ký ngầm.
 *   KHÔNG BAO GIỜ log/gửi private key đi đâu. Đăng xuất là xoá nó khỏi máy.
 */
type Stored = { address: Address; pk: Hex; handle: string | null };

const KEY = `soc:wallet:${chain.id}`;
const EVENT = "soc:wallet";
/**
 * Chỉ E2E: Anvil account đã biết công khai, tự mở khoá để test không phải tạo tài khoản.
 * Test cần máy "trắng" (tạo tài khoản bằng mật khẩu) thì đặt localStorage `soc:e2e-off` = "1".
 */
const E2E_PK = (process.env.NEXT_PUBLIC_E2E_PRIVATE_KEY || "") as Hex | "";
function e2eOff(): boolean {
  try {
    return localStorage.getItem("soc:e2e-off") === "1";
  } catch {
    return true;
  }
}

let cacheRaw: string | null | undefined;
let cacheVal: Stored | null = null;

function readStored(): Stored | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cacheRaw) return cacheVal;
  cacheRaw = raw;
  try {
    cacheVal = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    cacheVal = null;
  }
  if (!cacheVal && E2E_PK && !e2eOff()) {
    cacheVal = { address: privateKeyToAccount(E2E_PK).address, pk: E2E_PK, handle: null };
  }
  return cacheVal;
}

function writeStored(v: Stored | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // storage bị chặn: chỉ sống trong phiên này
    cacheRaw = v ? JSON.stringify(v) : null;
    cacheVal = v;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const accounts = new Map<Hex, PrivateKeyAccount>();
function accountOf(pk: Hex): PrivateKeyAccount {
  let a = accounts.get(pk);
  if (!a) {
    a = privateKeyToAccount(pk);
    accounts.set(pk, a);
  }
  return a;
}

export type EmbeddedWallet = {
  /** false trong lần render đầu (SSR/hydrate): chưa đọc được localStorage. */
  hydrated: boolean;
  address: Address | undefined;
  handle: string | null;
  account: PrivateKeyAccount | null;
};

const SERVER: EmbeddedWallet = { hydrated: false, address: undefined, handle: null, account: null };
let lastSnap: EmbeddedWallet = SERVER;
let lastFor: Stored | null | undefined;

function snapshot(): EmbeddedWallet {
  const s = readStored();
  if (s === lastFor) return lastSnap;
  lastFor = s;
  lastSnap = s
    ? { hydrated: true, address: getAddress(s.address), handle: s.handle, account: accountOf(s.pk) }
    : { hydrated: true, address: undefined, handle: null, account: null };
  return lastSnap;
}

export function useEmbeddedWallet(): EmbeddedWallet {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}

export function walletClientFor(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

type KdfResponse = { handle: string; kdf: KdfParams };
type LoginResponse = { handle: string; address: Address; kdf: KdfParams; keystore: Keystore };
export type SignupResponse = {
  handle: string;
  address: Address;
  drip: { hash: Hex } | null;
  /** funded: địa chỉ đã có gas; cap: hết lượt tặng hôm nay; faucet_off: vòi tắt; error: gửi lỗi. */
  dripSkipped?: "faucet_off" | "cap" | "funded" | "error";
};

/**
 * Tạo tài khoản: ví mới + keystore mã hoá + app tặng gas (server chờ tx tặng gas xong mới trả về).
 * `importKey`: dùng ví có sẵn (vd. đã đăng ký bằng Core/MetaMask) thay vì sinh ví mới. Key vẫn chỉ rời máy
 * ở dạng đã mã hoá bằng mật khẩu.
 */
export async function signup(handle: string, password: string, importKey?: Hex): Promise<SignupResponse> {
  const pk = importKey ?? generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const { kdf, authKey, keystore } = await createAccountSecrets(password, pk, account.address);
  const signature = await account.signMessage({
    message: accountMessage({ handle, address: account.address, chainId: chain.id }),
  });
  const r = await api<SignupResponse>("/accounts", {
    method: "POST",
    json: { handle, address: account.address.toLowerCase(), kdf, authKey, keystore, signature },
  });
  writeStored({ address: account.address, pk, handle });
  return r;
}

/** Chuẩn hoá private key người dùng dán vào (có/không có 0x, khoảng trắng). Sai định dạng thì null. */
export function parsePrivateKey(raw: string): Hex | null {
  const v = raw.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(v)) return null;
  const pk = `0x${v}` as Hex;
  try {
    privateKeyToAccount(pk);
    return pk;
  } catch {
    return null;
  }
}

/** Mở khoá bằng tên + mật khẩu. Sai thì ném ApiError 401 (bad_credentials). */
export async function login(handle: string, password: string): Promise<Address> {
  const pk = await unlockKey(handle, password);
  const address = privateKeyToAccount(pk).address;
  writeStored({ address, pk, handle });
  return address;
}

async function unlockKey(handle: string, password: string): Promise<Hex> {
  const { kdf } = await api<KdfResponse>(`/accounts/kdf/${encodeURIComponent(handle)}`);
  const { encKey, authKey } = await deriveAccountKeys(password, kdf);
  const r = await api<LoginResponse>("/accounts/login", { method: "POST", json: { handle, authKey } });
  return decryptKeystore(encKey, r.keystore, r.address);
}

/** Xuất private key: hỏi lại mật khẩu (kiểm qua server) rồi mới trả về. */
export async function exportKey(handle: string, password: string): Promise<Hex> {
  return unlockKey(handle, password);
}

/** Đăng xuất khỏi thiết bị: xoá ví owner khỏi máy. Tài khoản (ciphertext) vẫn ở server. */
export function forgetWallet() {
  writeStored(null);
}
