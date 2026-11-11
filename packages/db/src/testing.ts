import pg from "pg";
import { runMigrations } from "./migrate";

/**
 * DB test riêng cho từng package (turbo chạy test song song): <TEST_DATABASE_URL>_<suffix>.
 * Tạo DB nếu chưa có rồi chạy migration. Trả về null nếu không có TEST_DATABASE_URL.
 */
export async function prepareTestDb(
  suffix: string,
  base = process.env.TEST_DATABASE_URL,
): Promise<string | null> {
  if (!base) return null;
  const url = new URL(base);
  const name = `${url.pathname.slice(1)}_${suffix}`.replace(/[^a-z0-9_]/gi, "_");
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const r = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!r.rowCount) await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  return url.toString();
}
