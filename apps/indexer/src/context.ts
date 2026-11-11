import type { Db } from "@socialonchain/db";
import { savedFeeds } from "@socialonchain/db";
import type { FarcasterSource } from "@socialonchain/farcaster";
import type { FeedSpec, LlmCall } from "@socialonchain/feed-sdk";
import { DEFAULT_FEEDS, MODERATION_STACKS, parseFeedSpec, resolveSpec } from "@socialonchain/feed-sdk";
import type { Deployment } from "@socialonchain/protocol";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { PublicClient } from "viem";
import type { Env } from "./env";

export type AppContext = {
  db: Db;
  env: Env;
  client: PublicClient;
  deployment: Deployment;
  farcaster: FarcasterSource;
  llm: LlmCall | undefined;
  log: Logger;
  /** Trạng thái lỗi gần nhất của vòng index (cho /status). */
  indexerError: () => string | null;
  now: () => number;
};

/** Tìm FeedSpec theo id: feed mặc định, moderation stack, hoặc feed đã lưu ("u:…"). */
export async function lookupSpec(ctx: AppContext, id: string): Promise<FeedSpec | undefined> {
  if (DEFAULT_FEEDS[id]) return DEFAULT_FEEDS[id];
  if (MODERATION_STACKS[id]) return MODERATION_STACKS[id];
  const [row] = await ctx.db.select().from(savedFeeds).where(eq(savedFeeds.id, id));
  if (!row) return undefined;
  try {
    return parseFeedSpec(row.spec);
  } catch {
    return undefined;
  }
}

/** Gộp `extends` (tối đa 3 tầng). */
export async function resolveFully(ctx: AppContext, spec: FeedSpec): Promise<FeedSpec> {
  const cache = new Map<string, FeedSpec | undefined>();
  let cur: FeedSpec | undefined = spec;
  for (let i = 0; i < 3 && cur?.extends; i++) {
    if (!cache.has(cur.extends)) cache.set(cur.extends, await lookupSpec(ctx, cur.extends));
    cur = cache.get(cur.extends);
  }
  return resolveSpec(spec, (id) => cache.get(id));
}
