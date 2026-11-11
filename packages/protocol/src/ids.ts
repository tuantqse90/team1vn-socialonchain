import { type Hex, keccak256, toBytes } from "viem";

/** ID bài theo nguồn: "oc:<bytes32>" cho bài onchain, "fc:<hash>" cho bài Farcaster. */
export type PostSource = "onchain" | "farcaster";

export function onchainPostId(id: Hex): string {
  return `oc:${id.toLowerCase()}`;
}

export function farcasterPostId(hash: string): string {
  return `fc:${hash.toLowerCase()}`;
}

export function parsePostId(id: string): { source: PostSource; raw: string } | null {
  if (id.startsWith("oc:")) return { source: "onchain", raw: id.slice(3) };
  if (id.startsWith("fc:")) return { source: "farcaster", raw: id.slice(3) };
  return null;
}

/** bytes32 của kênh = keccak256(tên kênh viết thường). 0x00..00 = không thuộc kênh nào. */
export function channelHash(name: string): Hex {
  return keccak256(toBytes(name.trim().toLowerCase()));
}

export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
