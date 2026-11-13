#!/usr/bin/env node
// Chạy indexer + worker + web ở localhost, đọc/ghi contract thật trên Fuji (43113).
//   Postgres (Docker, DB riêng `socialonchain_fuji`) → migrate → indexer + worker + web
// Cần: contract đã deploy (packages/protocol/deployments/43113.json), JWT_SECRET khác giá trị dev.
// Không seed: dữ liệu hư cấu chỉ dùng với Anvil (pnpm dev:local --seed).
// Dùng: pnpm dev:fuji [--no-web]
// Chạy song song với 1 stack Fuji khác (vd. worktree): đặt FUJI_DATABASE_URL, API_PORT, WEB_PORT, NEXT_DIST_DIR.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
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
process.env.NEXT_DIST_DIR ||= ".next-fuji";
const apiPort = process.env.API_PORT || "42069";
const webPort = process.env.WEB_PORT || "3000";
process.env.PUBLIC_API_URL ||= `http://localhost:${apiPort}`;
process.env.NEXT_PUBLIC_API_URL ||= process.env.PUBLIC_API_URL;

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

// Postgres đã nghe ở cổng của DATABASE_URL thì dùng luôn (không `compose up`, tránh đụng container của worktree khác).
const dbUrl = new URL(process.env.DATABASE_URL);
const dbUp = await new Promise((resolve) => {
  const sock = createConnection({ host: dbUrl.hostname, port: Number(dbUrl.port || 5432) });
  sock.once("connect", () => {
    sock.end();
    resolve(true);
  });
  sock.once("error", () => resolve(false));
});
if (dbUp) log("Postgres đã chạy sẵn");
else {
  log("Postgres (docker compose)…");
  run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
}
// Tạo DB (nếu chưa có) qua chính URL, không cần psql/docker exec.
const dbName = decodeURIComponent(dbUrl.pathname.slice(1));
run(
  "pnpm",
  [
    "--filter",
    "@socialonchain/db",
    "exec",
    "node",
    "-e",
    `const pg=require("pg");(async()=>{const u=new URL(process.env.SOC_DB_URL);const n=decodeURIComponent(u.pathname.slice(1));u.pathname="/postgres";const c=new pg.Client({connectionString:u.toString()});await c.connect();const r=await c.query("select 1 from pg_database where datname=$1",[n]);if(!r.rowCount){await c.query('create database "'+n.replace(/"/g,'""')+'"');console.log("[dev-fuji] tạo database "+n)}await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})`,
  ],
  { env: { ...process.env, SOC_DB_URL: process.env.DATABASE_URL }, stdio: ["ignore", "inherit", "inherit"] },
);
log(`DB: ${dbName}`);

log("Migrate DB…");
run("pnpm", ["db:migrate"]);

start("indexer", "32", "pnpm", ["--filter", "@socialonchain/indexer", "dev"]);
start("worker", "33", "pnpm", ["--filter", "@socialonchain/worker", "dev"]);
if (!args.has("--no-web"))
  start("web", "35", "pnpm", ["--filter", "@socialonchain/web", "exec", "next", "dev", "-p", webPort]);
log(`Web: http://localhost:${webPort} (Fuji) · API: ${process.env.PUBLIC_API_URL}/health · Ctrl+C để dừng`);
