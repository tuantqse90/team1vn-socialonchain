import { DEV_LABELER_ADDRESS, getNetwork } from "@socialonchain/protocol";
import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NETWORK: z.enum(["local", "fuji"]).default("local"),
  DATABASE_URL: z.string().min(1),
  ANVIL_RPC_URL: z.string().default("http://127.0.0.1:8545"),
  FUJI_RPC_URL: z.string().default("https://api.avax-test.network/ext/bc/C/rpc"),
  API_PORT: z.coerce.number().default(42069),
  PORT: z.coerce.number().optional(), // Railway đặt PORT
  PUBLIC_API_URL: z.string().default("http://localhost:42069"),
  JWT_SECRET: z.string().min(8).default("dev-only-change-me"),
  ADMIN_ADDRESSES: csv,
  TRUSTED_LABELERS: csv,
  LABELER_ADDRESS: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  COMPILER_MODEL: z.string().default("claude-sonnet-5-5"),
  FARCASTER_MODE: z.string().default("fixture"),
  NEYNAR_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  INDEXER_POLL_MS: z.coerce.number().default(1000),
  INDEXER_CHUNK: z.coerce.number().optional(),
  CANDIDATE_WINDOW_DAYS: z.coerce.number().default(14),
  FREE_COMPILES_PER_DAY: z.coerce.number().default(10),
  FREE_MAX_FEEDS: z.coerce.number().default(5),
  PRO_COMPILES_PER_DAY: z.coerce.number().default(200),
  PRO_MAX_FEEDS: z.coerce.number().default(50),
  PRO_PLAN_ID: z.coerce.number().default(1),
  ANALYTICS_SALT: z.string().default("socialonchain-dev-salt"),
  INDEXER_DISABLED: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & {
  rpcUrl: string;
  chainId: number;
  labelers: Set<string>;
  port: number;
};

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const env = EnvSchema.parse(raw);
  const network = getNetwork(env.NETWORK);
  if (env.NETWORK === "fuji" && env.JWT_SECRET === "dev-only-change-me") {
    throw new Error("JWT_SECRET must be set to a random secret when NETWORK=fuji");
  }
  const labelers = new Set(env.TRUSTED_LABELERS);
  if (env.LABELER_ADDRESS) labelers.add(env.LABELER_ADDRESS.toLowerCase());
  if (env.NETWORK === "local") labelers.add(DEV_LABELER_ADDRESS);
  return {
    ...env,
    rpcUrl: env.NETWORK === "fuji" ? env.FUJI_RPC_URL : env.ANVIL_RPC_URL,
    chainId: network.chain.id,
    labelers,
    port: env.PORT ?? env.API_PORT,
  };
}
