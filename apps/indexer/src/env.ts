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

/** Biến để trống trong .env ("X=") coi như không đặt, để dùng giá trị mặc định. */
const blankToUndef = (v: unknown) => (v === "" ? undefined : v);

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
  // ---- Tài khoản trong app (ví nhúng) + vòi gas ----
  /** Ví tặng gas cho tài khoản mới. Không đặt → không tặng (dripSkipped: "faucet_off"). */
  FAUCET_PRIVATE_KEY: z.preprocess(
    blankToUndef,
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, "FAUCET_PRIVATE_KEY must be 0x + 64 hex")
      .optional(),
  ),
  /**
   * Mặc định: local 0.1, fuji 0.001 (AVAX, đơn vị wei; người dùng chốt 0.001 ngày 2026-11-12).
   * Phải ≥ MIN_OWNER_WEI của web (`apps/web/lib/gas.ts`: nạp session key + phí), không thì kẹt ở bước nạp AVAX.
   */
  GAS_DRIP_WEI: z.preprocess(blankToUndef, z.coerce.bigint().positive().optional()),
  /** Số lần tặng gas tối đa mỗi ngày (UTC). */
  GAS_DRIP_DAILY_CAP: z.preprocess(blankToUndef, z.coerce.number().int().min(0).default(200)),
  /** Mặc định: fuji 5, local 50. */
  SIGNUPS_PER_IP_PER_HOUR: z.preprocess(blankToUndef, z.coerce.number().int().positive().optional()),
});

export type Env = Omit<z.infer<typeof EnvSchema>, "GAS_DRIP_WEI" | "SIGNUPS_PER_IP_PER_HOUR"> & {
  GAS_DRIP_WEI: bigint;
  SIGNUPS_PER_IP_PER_HOUR: number;
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
  const fuji = env.NETWORK === "fuji";
  return {
    ...env,
    GAS_DRIP_WEI: env.GAS_DRIP_WEI ?? (fuji ? 1_000_000_000_000_000n : 100_000_000_000_000_000n),
    SIGNUPS_PER_IP_PER_HOUR: env.SIGNUPS_PER_IP_PER_HOUR ?? (fuji ? 5 : 50),
    rpcUrl: env.NETWORK === "fuji" ? env.FUJI_RPC_URL : env.ANVIL_RPC_URL,
    chainId: network.chain.id,
    labelers,
    port: env.PORT ?? env.API_PORT,
  };
}
