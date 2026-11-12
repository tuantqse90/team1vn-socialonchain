#!/usr/bin/env node
// Chạy indexer + worker + web ở localhost, đọc/ghi contract thật trên Fuji (43113).
//   Postgres (Docker, DB riêng `socialonchain_fuji`) → migrate → indexer + worker + web
// Cần: contract đã deploy (packages/protocol/deployments/43113.json), JWT_SECRET khác giá trị dev.
// Không seed: dữ liệu hư cấu chỉ dùng với Anvil (pnpm dev:local --seed).
// Dùng: pnpm dev:fuji [--no-web]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const children = [];
const ZERO = "0x0000000000000000000000000000000000000000";
const FUJI_DB = "socialonchain_fuji";

function log(msg) {
  console.log(`\x1b[36m[dev-fuji]\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`\x1b[31m[dev-fuji]\x1b[0m ${msg}`);
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...opts });
  if (r.status !== 0) fail(`lỗi khi chạy: ${cmd} ${cmdArgs.join(" ")}`);
  return r;
}

function start(name, color, cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { cwd: root, env: process.env });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix + line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => log(`${name} thoát (code ${code})`));
  children.push(child);
}

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!existsSync(join(root, ".env"))) fail("Thiếu .env (copy từ .env.example rồi điền)");
process.loadEnvFile(join(root, ".env"));
process.env.NETWORK = "fuji";
process.env.NEXT_PUBLIC_NETWORK = "fuji";
// DB riêng cho Fuji: schema `chain` không lẫn với dữ liệu Anvil.
process.env.DATABASE_URL =
  process.env.FUJI_DATABASE_URL || process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${FUJI_DB}$1`);
// Admin ở local là account công khai của Anvil: không dùng trên Fuji.
process.env.ADMIN_ADDRESSES = process.env.FUJI_ADMIN_ADDRESSES ?? "";
// Build cache riêng: NEXT_PUBLIC_* khác với bản local.
process.env.NEXT_DIST_DIR = ".next-fuji";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-only-change-me") {
  fail("JWT_SECRET phải là chuỗi ngẫu nhiên khi chạy với Fuji");
}

const deployment = JSON.parse(readFileSync(join(root, "packages/protocol/deployments/43113.json"), "utf8"));
if (!deployment.IdentityRegistry || deployment.IdentityRegistry === ZERO) {
  fail("Chưa deploy contract lên Fuji (packages/protocol/deployments/43113.json còn trống)");
}
const rpcUrl = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const res = await fetch(rpcUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getCode",
    params: [deployment.IdentityRegistry, "latest"],
  }),
});
const code = (await res.json()).result;
if (!code || code === "0x")
  fail(`Không thấy bytecode IdentityRegistry ${deployment.IdentityRegistry} trên Fuji`);
log(`Fuji · IdentityRegistry ${deployment.IdentityRegistry} · từ block ${deployment.startBlock}`);

log("Postgres (docker compose)…");
run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
const exists = spawnSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "soc",
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname='${FUJI_DB}'`,
  ],
  { cwd: root, encoding: "utf8" },
);
if (exists.stdout.trim() !== "1") {
  log(`Tạo database ${FUJI_DB}…`);
  run("docker", ["compose", "exec", "-T", "postgres", "createdb", "-U", "soc", FUJI_DB]);
}

log("Migrate DB…");
run("pnpm", ["db:migrate"]);

start("indexer", "32", "pnpm", ["--filter", "@socialonchain/indexer", "dev"]);
start("worker", "33", "pnpm", ["--filter", "@socialonchain/worker", "dev"]);
if (!args.has("--no-web")) start("web", "35", "pnpm", ["--filter", "@socialonchain/web", "dev"]);
log("Web: http://localhost:3000 (Fuji) · API: http://localhost:42069/health · Ctrl+C để dừng");
