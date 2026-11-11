import * as Sentry from "@sentry/node";
import { createDb } from "@socialonchain/db";
import { createFarcasterSource } from "@socialonchain/farcaster";
import { createAnthropicLlm } from "@socialonchain/llm";
import { PgBoss } from "pg-boss";
import pino from "pino";
import { loadWorkerEnv } from "./env";
import { runAuthorLabels } from "./jobs/authors";
import { DataApiBuilderCounter, FixtureBuilderCounter, runBuilder } from "./jobs/builder";
import { runIngest } from "./jobs/ingest";
import { runJoinedNotifier } from "./jobs/joined";
import { runLabeler } from "./jobs/labeler";
import { httpSink, labelerAccount, recordState, runJob } from "./shared";

const env = loadWorkerEnv();
const log = pino({ name: "worker", level: process.env.LOG_LEVEL ?? "info" });
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NETWORK });

const { db } = createDb(env.DATABASE_URL);
const account = labelerAccount(env);
const sink = httpSink(env.indexerUrl);
const farcaster = createFarcasterSource(env);
const counter =
  env.BUILDER_MODE === "data-api"
    ? new DataApiBuilderCounter(env.builderChains, env.GLACIER_API_KEY)
    : new FixtureBuilderCounter();
const llm =
  env.LABELER_MODE === "llm" && env.ANTHROPIC_API_KEY
    ? createAnthropicLlm({ model: env.LABELER_MODEL, effort: "low", apiKey: env.ANTHROPIC_API_KEY })
    : undefined;
const now = () => Math.floor(Date.now() / 1000);

const JOBS: Record<string, { cron: string; every?: number; run: () => Promise<Record<string, unknown>> }> = {
  "label-posts": {
    cron: "* * * * *",
    every: 10_000,
    run: async () => {
      if (!account) throw new Error("LABELER_PRIVATE_KEY is required outside local");
      return runLabeler(db, account, sink, {
        llm,
        batchSize: env.LABELER_BATCH,
        windowDays: env.CANDIDATE_WINDOW_DAYS,
      });
    },
  },
  "author-labels": {
    cron: "*/10 * * * *",
    run: async () => {
      if (!account) throw new Error("LABELER_PRIVATE_KEY is required outside local");
      return runAuthorLabels(db, account, sink, now());
    },
  },
  "ingest-farcaster": {
    cron: env.FARCASTER_MODE === "fixture" ? "*/30 * * * *" : "*/5 * * * *",
    run: () => runIngest(db, farcaster, env.channels),
  },
  "onchain-builder": { cron: "*/15 * * * *", run: () => runBuilder(db, counter) },
  "notify-joined": { cron: "*/5 * * * *", run: () => runJoinedNotifier(db, now()) },
};

const boss = new PgBoss({ connectionString: env.DATABASE_URL });
boss.on("error", (err) => log.error({ err: err.message }, "pg-boss error"));
await boss.start();

for (const [name, job] of Object.entries(JOBS)) {
  await boss.createQueue(name, { policy: "exclusive", retryLimit: 2, retryDelay: 30 });
  await boss.schedule(name, job.cron);
  await boss.work(name, async () => {
    try {
      const r = await runJob(db, name, job.run);
      log.info({ job: name, ...r }, "job done");
    } catch (err) {
      Sentry.captureException(err);
      log.warn({ job: name, err: (err as Error).message }, "job failed");
      throw err;
    }
  });
  await boss.send(name, {});
  if (job.every) setInterval(() => void boss.send(name, {}).catch(() => undefined), job.every);
}

await recordState(db, "worker", {
  ok: true,
  at: new Date().toISOString(),
  labeler: account?.address ?? null,
  labelerMode: llm ? `llm:${env.LABELER_MODEL}` : "heuristic",
  farcaster: farcaster.mode,
  builder: counter.mode,
});
log.info(
  {
    labeler: account?.address,
    mode: llm ? "llm" : "heuristic",
    farcaster: farcaster.mode,
    builder: counter.mode,
  },
  "worker started",
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await boss.stop({ graceful: true, timeout: 5000 }).catch(() => undefined);
    process.exit(0);
  });
}
