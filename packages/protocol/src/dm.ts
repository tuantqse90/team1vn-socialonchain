import { x25519 } from "@noble/curves/ed25519";
import { type Address, bytesToHex, getAddress, type Hex, hexToBytes, verifyMessage } from "viem";

/**
 * Tin nhắn riêng (DM): mã hoá đầu cuối, KHÔNG lên chain. Server (indexer API) chỉ thấy ciphertext + metadata
 * (ai gửi ai, lúc nào, dài bao nhiêu).
 *
 * - Khoá nhắn tin X25519 sinh tất định từ chữ ký ví owner trên `dmDeriveMessage` (ký 1 lần mỗi thiết bị, không gas).
 *   Ví ký tất định (RFC 6979: hầu hết EOA) thì thiết bị nào cũng ra cùng khoá.
 * - Khoá công khai được owner ký xác nhận (`dmBindMessage`): client tự kiểm chữ ký, không phải tin server.
 * - Mỗi cặp (A, B): ECDH X25519 → HKDF-SHA256 → AES-256-GCM, nonce ngẫu nhiên 12 byte,
 *   AAD = "sender>recipient" (server không đảo chiều tin được).
 * - Giới hạn đã biết: không có forward secrecy (khoá tĩnh). Xem docs/LIMITATIONS.md.
 */
export const DM_VERSION = 1;
/** Độ dài tối đa của text trong 1 tin (ký tự). */
export const DM_MAX_TEXT = 2000;
/** Bộ emoji cho thả cảm xúc nhanh (Twemoji ở client). */
export const DM_QUICK_REACTIONS = ["❤️", "🔥", "😂", "😮", "🙏", "👍"] as const;

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode("socialonchain-dm-v1");

export type DmPayload =
  | { v: 1; t: "text"; text: string }
  /** Thả cảm xúc lên tin `to` (id server). emoji rỗng = gỡ. */
  | { v: 1; t: "react"; to: number; emoji: string };

export type DmEnvelope = { nonce: string; ciphertext: string };

/** Message owner ký để sinh khoá nhắn tin. Chữ ký này là BÍ MẬT: không gửi đi đâu, không log. */
export function dmDeriveMessage(owner: Address): string {
  return [
    "socialonchain: bật tin nhắn mã hoá / enable encrypted messages",
    "",
    "Ký để tạo khoá tin nhắn trên thiết bị này. Không tốn gas, không gửi giao dịch.",
    "Sign to create your messaging key on this device. No gas, no transaction.",
    "Chỉ ký trên ứng dụng bạn tin. Only sign this inside the app you trust.",
    "",
    `Owner: ${getAddress(owner)}`,
    `Version: ${DM_VERSION}`,
  ].join("\n");
}

/** Message owner ký để công bố khoá công khai nhắn tin (chữ ký này công khai). */
export function dmBindMessage(owner: Address, publicKey: Hex): string {
  return [
    "socialonchain: khoá tin nhắn / messaging key",
    "",
    `Owner: ${getAddress(owner)}`,
    `Public key: ${publicKey.toLowerCase()}`,
    `Version: ${DM_VERSION}`,
  ].join("\n");
}

async function hkdf(ikm: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", new Uint8Array(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(SALT), info: enc.encode(info) },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

export type DmKeyPair = { privateKey: Hex; publicKey: Hex };

/** Chữ ký `dmDeriveMessage` → cặp khoá X25519 (tất định theo chữ ký). */
export async function dmKeyFromSignature(signature: Hex): Promise<DmKeyPair> {
  const priv = await hkdf(hexToBytes(signature), "x25519-identity", 32);
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(x25519.getPublicKey(priv)) };
}

export function isDmPublicKey(k: string): k is Hex {
  return /^0x[0-9a-f]{64}$/.test(k);
}

/** Kiểm chữ ký owner trên khoá công khai (EOA). Ví hợp đồng (ERC-1271) thì dùng publicClient.verifyMessage. */
export function verifyDmKeyBinding(owner: Address, publicKey: Hex, signature: Hex): Promise<boolean> {
  return verifyMessage({ address: owner, message: dmBindMessage(owner, publicKey), signature }).catch(
    () => false,
  );
}

export const dmPair = (a: string, b: string) => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${x}:${y}`;
};

type AesKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** Khoá AES chung của 2 người (cùng kết quả ở cả 2 phía). */
export async function dmSharedKey(
  myPrivateKey: Hex,
  theirPublicKey: Hex,
  me: Address,
  them: Address,
): Promise<AesKey> {
  const shared = x25519.getSharedSecret(hexToBytes(myPrivateKey), hexToBytes(theirPublicKey));
  const raw = await hkdf(shared, `aes-gcm:${dmPair(me, them)}`, 32);
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

const aad = (sender: string, recipient: string) =>
  enc.encode(`${sender.toLowerCase()}>${recipient.toLowerCase()}`);

export async function dmEncrypt(
  key: AesKey,
  payload: DmPayload,
  sender: Address,
  recipient: Address,
): Promise<DmEnvelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(sender, recipient) },
    key,
    enc.encode(JSON.stringify(payload)),
  );
  return { nonce: toB64(nonce), ciphertext: toB64(new Uint8Array(ct)) };
}

/** Giải mã + kiểm dạng payload. Sai khoá/bị sửa/không hợp lệ → null. */
export async function dmDecrypt(
  key: AesKey,
  env: DmEnvelope,
  sender: Address,
  recipient: Address,
): Promise<DmPayload | null> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(env.nonce), additionalData: aad(sender, recipient) },
      key,
      fromB64(env.ciphertext),
    );
    return parseDmPayload(JSON.parse(dec.decode(pt)));
  } catch {
    return null;
  }
}

export function parseDmPayload(x: unknown): DmPayload | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (o.t === "text" && typeof o.text === "string" && o.text.length > 0 && o.text.length <= DM_MAX_TEXT)
    return { v: 1, t: "text", text: o.text };
  if (
    o.t === "react" &&
    typeof o.to === "number" &&
    Number.isInteger(o.to) &&
    o.to > 0 &&
    typeof o.emoji === "string" &&
    o.emoji.length <= 16
  )
    return { v: 1, t: "react", to: o.to, emoji: o.emoji };
  return null;
}

export function toB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
