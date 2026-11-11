// Backup schema `app` (dữ liệu offchain, KHÔNG dựng lại được bằng replay).
// Schema `chain` không cần backup: `pnpm indexer:replay` dựng lại từ event.
//
//   pnpm db:backup [file]      → mặc định backups/app-<UTC>.sql.gz
//   Khôi phục: gunzip -c <file> | psql "$DATABASE_URL"
//
// Dùng pg_dump trên máy nếu có, không thì chạy pg_dump trong container postgres:17.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGzip } from "node:zlib";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("db:backup: thiếu DATABASE_URL");
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const out = process.argv[2] ?? `backups/app-${stamp}.sql.gz`;
mkdirSync(dirname(out), { recursive: true });

const args = [url, "--schema=app", "--no-owner", "--no-privileges"];
const hasLocal = spawnSync("pg_dump", ["--version"]).status === 0;
const [cmd, argv] = hasLocal
  ? ["pg_dump", args]
  : ["docker", ["run", "--rm", "--network", "host", "postgres:17", "pg_dump", ...args]];

const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "inherit"] });
const file = createWriteStream(out);
child.stdout.pipe(createGzip()).pipe(file);
child.on("close", (code) => {
  if (code !== 0) {
    console.error(`db:backup: pg_dump thoát với mã ${code}`);
    process.exit(code ?? 1);
  }
  file.on("close", () => console.log(`db:backup: schema app → ${out}`));
});
