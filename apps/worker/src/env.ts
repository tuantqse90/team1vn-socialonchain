import { z } from "zod";

const EnvSchema = z.object({
  NETWORK: z.enum(["local", "fuji"]).default("local"),
  DATABASE_URL: z.string().min(1),
  INDEXER_URL: z.string().optional(),
  PUBLIC_API_URL: z.string().default("http://localhost:42069"),
  LABELER_MODE: z.enum(["heuristic", "llm"]).default("heuristic"),
  LABELER_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  LABELER_PRIVATE_KEY: z.string().optional(),
  LABELER_BATCH: z.coerce.number().int().min(1).max(50).default(20),
  /** Cùng giá trị với CANDIDATE_WINDOW_DAYS của indexer: bài cũ hơn không lên feed xếp hạng nên không gán nhãn. */
  CANDIDATE_WINDOW_DAYS: z.coerce.number().int().min(1).default(14),
  FARCASTER_MODE: z.enum(["fixture", "neynar"]).default("fixture"),
  NEYNAR_API_KEY: z.string().optional(),
  FC_CHANNELS: z.string().default("avalanche,avax-builders"),
  BUILDER_MODE: z.enum(["fixture", "data-api"]).default("fixture"),
  GLACIER_API_KEY: z.string().optional(),
  BUILDER_CHAIN_IDS: z.string().default("43114,43113"),
  SENTRY_DSN: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof EnvSchema> & {
  indexerUrl: string;
  channels: string[];
  builderChains: string[];
};

export function loadWorkerEnv(raw: Record<string, string | undefined> = process.env): WorkerEnv {
  const env = EnvSchema.parse(raw);
  return {
    ...env,
    indexerUrl: env.INDEXER_URL ?? env.PUBLIC_API_URL,
    channels: env.FC_CHANNELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    builderChains: env.BUILDER_CHAIN_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
