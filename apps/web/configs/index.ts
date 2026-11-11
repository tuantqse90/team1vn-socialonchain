import a from "./a";
import b from "./b";
import type { ClientConfig } from "./types";

export type { ClientConfig };

const base = process.env.NEXT_PUBLIC_CLIENT_CONFIG === "b" ? b : a;

/** Config đang dùng. NEXT_PUBLIC_API_URL / NEXT_PUBLIC_NETWORK ghi đè giá trị trong file. */
export const clientConfig: ClientConfig = {
  ...base,
  indexerUrl: process.env.NEXT_PUBLIC_API_URL || base.indexerUrl,
  chain: process.env.NEXT_PUBLIC_NETWORK === "fuji" ? "fuji" : base.chain,
};
