import { gcm } from "@noble/ciphers/aes";
import { scryptAsync } from "@noble/hashes/scrypt";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { type Address, bytesToHex, getAddress, type Hex, hexToBytes } from "viem";

/**
 * Tài khoản trong app (ví nhúng): người dùng chỉ có tên + mật khẩu, không cần ví ngoài, không popup.
 *
 * - Client tự sinh private key (owner), mã hoá bằng khoá dẫn xuất từ mật khẩu rồi mới gửi lên server.
 * - scrypt(mật khẩu, salt) → 64 byte: 32 byte đầu là khoá mã hoá (KHÔNG rời máy), 32 byte sau là `authKey`
 *   gửi lên server để đăng nhập. Server chỉ lưu sha256(authKey) + keystore đã mã hoá, nên không giải mã được ví.
 * - AES-256-GCM thuần JS (@noble/ciphers): chạy được cả ở trang http (LAN) nơi WebCrypto bị tắt.
 * - Quên mật khẩu = mất tài khoản (non-custodial); người dùng tự xuất khoá trong Cài đặt để dự phòng.
 */
export const ACCOUNT_VERSION = 1;
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;

export type KdfParams = { name: "scrypt"; N: number; r: number; p: number; dkLen: 64; salt: Hex };
export type Keystore = { v: 1; iv: Hex; ct: Hex };

/** 2^16 × 8 → ~64 MiB, khoảng 1 giây trên điện thoại. Server từ chối N < 2^15. */
export const DEFAULT_SCRYPT = { N: 2 ** 16, r: 8, p: 1 } as const;
export const MIN_SCRYPT_N = 2 ** 15;

const enc = new TextEncoder();

/** Tin nhắn owner ký khi tạo tài khoản: chứng minh người tạo giữ private key của địa chỉ. */
export function accountMessage(p: { handle: string; address: Address; chainId: number }): string {
  return `socialonchain account v${ACCOUNT_VERSION}\nhandle: ${p.handle}\naddress: ${getAddress(p.address)}\nchain: ${p.chainId}`;
}

export type AccountKeys = { encKey: Uint8Array; authKey: Hex };

/** Dẫn xuất khoá từ mật khẩu (chậm có chủ ý). `encKey` không bao giờ rời máy. */
export async function deriveAccountKeys(password: string, kdf: KdfParams): Promise<AccountKeys> {
  const dk = await scryptAsync(enc.encode(password.normalize("NFKC")), hexToBytes(kdf.salt), {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    dkLen: 64,
    asyncTick: 20,
  });
  return { encKey: dk.slice(0, 32), authKey: bytesToHex(dk.slice(32)) };
}

/** Giá trị server lưu thay cho authKey. */
export function authKeyHash(authKey: Hex): Hex {
  return bytesToHex(sha256(hexToBytes(authKey)));
}

function aad(address: Address): Uint8Array {
  return enc.encode(`socialonchain-keystore-v1:${address.toLowerCase()}`);
}

export function encryptKeystore(encKey: Uint8Array, privateKey: Hex, address: Address): Keystore {
  const iv = randomBytes(12);
  const ct = gcm(encKey, iv, aad(address)).encrypt(hexToBytes(privateKey));
  return { v: 1, iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Sai mật khẩu (hoặc keystore bị sửa) thì ném lỗi. */
export function decryptKeystore(encKey: Uint8Array, keystore: Keystore, address: Address): Hex {
  const pt = gcm(encKey, hexToBytes(keystore.iv), aad(address)).decrypt(hexToBytes(keystore.ct));
  return bytesToHex(pt);
}

/** Tạo tài khoản: salt mới, dẫn xuất khoá, mã hoá private key. */
export async function createAccountSecrets(
  password: string,
  privateKey: Hex,
  address: Address,
  params: { N: number; r: number; p: number } = DEFAULT_SCRYPT,
): Promise<{ kdf: KdfParams; authKey: Hex; keystore: Keystore }> {
  const kdf: KdfParams = { name: "scrypt", ...params, dkLen: 64, salt: bytesToHex(randomBytes(16)) };
  const { encKey, authKey } = await deriveAccountKeys(password, kdf);
  return { kdf, authKey, keystore: encryptKeystore(encKey, privateKey, address) };
}

/**
 * Tin nhắn ví ngoài (vd. ví deployer) ký để liên kết vào tài khoản `owner`: chứng minh người liên kết giữ
 * private key của `wallet`. Số contract `wallet` đã deploy được cộng vào tín hiệu `onchain_builder` của owner.
 */
export function linkWalletMessage(p: { owner: Address; wallet: Address; chainId: number }): string {
  return `socialonchain link wallet v1\naccount: ${getAddress(p.owner)}\nwallet: ${getAddress(p.wallet)}\nchain: ${p.chainId}`;
}
