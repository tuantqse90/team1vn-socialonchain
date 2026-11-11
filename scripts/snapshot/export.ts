/**
 * pnpm snapshot:export — xuất graph + bài onchain ra JSON công khai.
 * Fuji là testnet (không cam kết lưu trữ vĩnh viễn) nên snapshot bảo đảm graph không mất và có thể chuyển chain.
 * Chỉ dữ liệu ONCHAIN (schema chain). Không có dữ liệu offchain/cá nhân.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@socialonchain/db";
import { getDeployment, getNetwork } from "@socialonchain/protocol";
import { sql } from "drizzle-orm";

const network = getNetwork(process.env.NETWORK);
const deployment = getDeployment(network.chain.id);
const { db, pool } = createDb();
const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) =>
  (await db.execute<T>(s)).rows;

const [state] = await q<{ last_block: number }>(
  sql`select last_block from chain.indexer_state where chain_id = ${network.chain.id}`,
);
const snapshot = {
  format: "socialonchain-snapshot/v1",
  exportedAt: new Date().toISOString(),
  chainId: network.chain.id,
  contracts: deployment,
  lastBlock: state?.last_block ?? null,
  users: await q(
    sql`select address, handle, profile_uri, registered_at from chain.users order by registered_at, address`,
  ),
  follows: await q(
    sql`select follower, target, created_at from chain.follows order by created_at, follower, target`,
  ),
  posts: await q(sql`
    select id, author, parent_id, root_id, channel, case when deleted then null else text end as text,
           case when deleted then null else meta end as meta, created_at, tx_hash, deleted
    from chain.posts order by created_at, id`),
  reactions: await q(
    sql`select actor, post_id, kind, created_at from chain.reactions order by created_at, actor`,
  ),
};
const outArg = process.argv.indexOf("--out");
const out =
  outArg > 0
    ? (process.argv[outArg + 1] as string)
    : join(
        dirname(fileURLToPath(import.meta.url)),
        `../../snapshots/snapshot-${network.chain.id}-${snapshot.lastBlock ?? 0}.json`,
      );
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(snapshot)}\n`);
console.log(
  `snapshot: ${snapshot.users.length} users, ${snapshot.follows.length} follows, ${snapshot.posts.length} posts → ${out}`,
);
await pool.end();
