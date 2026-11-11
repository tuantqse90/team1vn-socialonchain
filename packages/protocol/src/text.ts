import { type Hex, keccak256, toBytes } from "viem";

/** Giới hạn của contract Posts (byte UTF-8). */
export const MAX_POST_BYTES = 1024;

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Kênh cộng đồng đã biết (onchain lưu keccak256(tên), nên cần danh sách để hiển thị tên). */
export const KNOWN_CHANNELS = [
  "avalanche",
  "avax-builders",
  "builders",
  "team1",
  "team1-vietnam",
  "grants",
  "hackathons",
  "jobs",
  "general",
  "random",
];

const hashToName = new Map<string, string>(
  KNOWN_CHANNELS.map((n) => [keccak256(toBytes(n)).toLowerCase(), n] as const),
);

export function channelNameFromHash(hash: Hex | string | null | undefined): string | null {
  if (!hash) return null;
  return hashToName.get(hash.toLowerCase()) ?? null;
}

/** @handle (3–20 ký tự [a-z0-9_]) và @0x… */
export function parseMentions(text: string): { handles: string[]; addresses: string[] } {
  const handles = new Set<string>();
  const addresses = new Set<string>();
  for (const m of text.matchAll(/(^|[^\w@])@(0x[0-9a-fA-F]{40}|[a-z0-9_]{3,20})\b/g)) {
    const v = (m[2] ?? "").toLowerCase();
    if (v.startsWith("0x")) addresses.add(v);
    else handles.add(v);
  }
  return { handles: [...handles], addresses: [...addresses] };
}

export function parseHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{2,40})/gu)) tags.add((m[2] ?? "").toLowerCase());
  return [...tags];
}
