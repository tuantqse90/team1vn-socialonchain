import { type Address, getAddress, type Hex, verifyMessage } from "viem";

/** Session key mặc định hết hạn sau 30 ngày. */
export const DEFAULT_SESSION_DAYS = 30;
/** Lượng gas nạp mặc định cho session key lúc onboarding (đơn vị wei). 0.05 AVAX. */
export const DEFAULT_SESSION_FUNDING_WEI = 50_000_000_000_000_000n;
/** Message đăng nhập chỉ có hiệu lực trong 10 phút. */
export const SESSION_AUTH_MAX_AGE_SEC = 600;

export type SessionAuthPayload = {
  owner: Address;
  key: Address;
  chainId: number;
  issuedAt: number;
};

/** Message mà session key ký để lấy JWT (kiểu SIWE, không cần popup vì key nằm trong trình duyệt). */
export function sessionAuthMessage(p: SessionAuthPayload): string {
  return [
    "socialonchain: đăng nhập bằng session key",
    `Owner: ${getAddress(p.owner)}`,
    `Session key: ${getAddress(p.key)}`,
    `Chain ID: ${p.chainId}`,
    `Issued at: ${p.issuedAt}`,
  ].join("\n");
}

export async function verifySessionAuth(
  p: SessionAuthPayload,
  signature: Hex,
  nowSec: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Math.abs(nowSec - p.issuedAt) > SESSION_AUTH_MAX_AGE_SEC) return { ok: false, reason: "expired" };
  const valid = await verifyMessage({ address: p.key, message: sessionAuthMessage(p), signature });
  return valid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
