import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { createDb } from "@socialonchain/db";
import { createFarcasterSource } from "@socialonchain/farcaster";
import { createAnthropicLlm } from "@socialonchain/llm";
import { getDeployment, getNetwork } from "@socialonchain/protocol";
import pino from "pino";
import { createPublicClient, http } from "viem";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { ChainIndexer } from "./sync";

const env = loadEnv();
const log = pino({ name: "indexer", level: process.env.LOG_LEVEL ?? "info" });
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NETWORK, tracesSampleRate: 0.1 });

const network = getNetwork(env.NETWORK);
const deployment = getDeployment(network.chain.id);
const client = createPublicClient({ chain: network.chain, transport: http(env.rpcUrl) });
const { db } = createDb(env.DATABASE_URL);
const indexer = new ChainIndexer(db, client, deployment, log, env.INDEXER_CHUNK);
const llm = env.ANTHROPIC_API_KEY
  ? createAnthropicLlm({ model: env.COMPILER_MODEL, effort: "medium", apiKey: env.ANTHROPIC_API_KEY })
  : undefined;

const app = createApp({
  db,
  env,
  client,
  deployment,
  farcaster: createFarcasterSource(env),
  llm,
  log,
  indexerError: () => indexer.lastError,
  now: () => Math.floor(Date.now() / 1000),
});

const controller = new AbortController();
if (!env.INDEXER_DISABLED) {
  indexer.run(env.INDEXER_POLL_MS, controller.signal).catch((err) => {
    Sentry.captureException(err);
    log.error({ err: (err as Error).message }, "indexer crashed");
  });
}

const server = serve({ fetch: app.fetch, port: env.port }, (info) =>
  log.info(
    {
      port: info.port,
      network: env.NETWORK,
      chainId: deployment.chainId,
      compiler: llm ? env.COMPILER_MODEL : "heuristic",
    },
    "API listening",
  ),
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    controller.abort();
    server.close();
    process.exit(0);
  });
}
