import type { Author } from "./types";

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function displayName(a: Author): string {
  return a.displayName || a.handle || a.fcUsername || shortAddr(a.address) || (a.fid ? `fid ${a.fid}` : "?");
}

export function handleOf(a: Author): string | null {
  if (a.handle) return `@${a.handle}`;
  if (a.fcUsername) return `@${a.fcUsername}`;
  return a.address ? shortAddr(a.address) : null;
}

/** Đường dẫn profile: handle, rồi địa chỉ. Tác giả Farcaster không có địa chỉ thì không có profile. */
export function profileHref(a: Author): string | null {
  if (a.handle) return `/u/${a.handle}`;
  if (a.address) return `/u/${a.address}`;
  return null;
}

export function timeAgo(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(now - unix));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatAvax(wei: bigint, digits = 3): string {
  const v = Number(wei) / 1e18;
  return v.toFixed(v > 0 && v < 0.001 ? 5 : digits);
}

/** Màu avatar tất định từ địa chỉ/handle (khi không có ảnh). */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
