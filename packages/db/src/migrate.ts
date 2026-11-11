import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index";

/** Chạy migration (idempotent). Dùng được cả từ CLI lẫn từ test. */
export async function runMigrations(url = process.env.DATABASE_URL) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../drizzle") });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => console.log("migrations applied"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
