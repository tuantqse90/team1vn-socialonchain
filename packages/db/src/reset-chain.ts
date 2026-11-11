import { fileURLToPath } from "node:url";
import pg from "pg";

/** Xoá schema `chain` (dựng lại được bằng replay). KHÔNG đụng schema `app`. */
export async function resetChain(url = process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='chain') THEN TRUNCATE chain.users, chain.delegates, chain.follows, chain.posts, chain.reactions, chain.payments, chain.indexer_state; END IF; END $$;",
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resetChain().then(() => console.log("chain schema truncated"));
}
