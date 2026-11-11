import { createDb } from "@socialonchain/db";
import { resetChain } from "@socialonchain/db/reset-chain";
import { getDeployment, getNetwork } from "@socialonchain/protocol";
import pino from "pino";
import { createPublicClient, http } from "viem";
import { loadEnv } from "./env";
import { ChainIndexer } from "./sync";

/** Dựng lại toàn bộ schema `chain` từ block deploy. Ai cũng chạy được: chỉ cần RPC + Postgres. */
const env = loadEnv();
const log = pino({ name: "replay" });
const network = getNetwork(env.NETWORK);
const deployment = getDeployment(network.chain.id);
await resetChain(env.DATABASE_URL);
const { db, pool } = createDb(env.DATABASE_URL);
const client = createPublicClient({ chain: network.chain, transport: http(env.rpcUrl) });
const indexer = new ChainIndexer(db, client, deployment, log, env.INDEXER_CHUNK);
const started = Date.now();
await indexer.catchUp();
log.info({ lastBlock: await indexer.lastBlock(), ms: Date.now() - started }, "replay done");
await pool.end();
