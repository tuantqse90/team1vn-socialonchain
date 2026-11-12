#!/usr/bin/env node
// Chạy toàn bộ stack ở local, KHÔNG cần key nào:
//   Postgres (Docker) → Anvil → deploy contract → migrate DB → (seed) → indexer + worker + web
// Dùng: pnpm dev:local [--seed] [--no-web]
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
// RPC/cổng đọc từ .env (ANVIL_RPC_URL) sau khi nạp env bên dưới; mặc định Anvil 8545.
let RPC = "http://127.0.0.1:8545";
const children = [];

function log(msg) {
  console.log(`\x1b[36m[dev-local]\x1b[0m ${msg}`);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`[dev-local] lỗi khi chạy: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

async function anvilUp() {
  try {
    return (await rpc("eth_chainId")) === "0x7a69";
  } catch {
    return false;
  }
}

function start(name, color, cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { cwd: root, env: process.env, ...opts });
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
  return child;
}

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!existsSync(join(root, ".env"))) {
  copyFileSync(join(root, ".env.example"), join(root, ".env"));
  log("Tạo .env từ .env.example");
}
process.loadEnvFile?.(join(root, ".env"));
process.env.NETWORK = "local";
process.env.NEXT_PUBLIC_NETWORK = "local";
RPC = process.env.ANVIL_RPC_URL || RPC;
process.env.NEXT_PUBLIC_RPC_URL ||= RPC;
const anvilPort = new URL(RPC).port || "8545";

// Postgres đã nghe ở cổng của DATABASE_URL (vd. container của worktree khác) thì dùng luôn, không `compose up`.
const dbUrl = new URL(process.env.DATABASE_URL || "postgres://soc:soc@localhost:5440/socialonchain");
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

if (!(await anvilUp())) {
  log("Khởi động Anvil (chainId 31337, automine)…");
  // Với --seed: lùi đồng hồ chain 8 ngày để seed trải bài đều 7 ngày, rồi seed tự đồng bộ về hiện tại.
  const anvilArgs = ["--silent", "--port", anvilPort, "--chain-id", "31337"];
  if (args.has("--seed")) anvilArgs.push("--timestamp", String(Math.floor(Date.now() / 1000) - 8 * 86400));
  start("anvil", "90", "anvil", anvilArgs);
  for (let i = 0; i < 50 && !(await anvilUp()); i++) await new Promise((r) => setTimeout(r, 200));
} else {
  log("Anvil đã chạy sẵn");
}

const deployFile = join(root, "packages/protocol/deployments/31337.json");
const deployed = existsSync(deployFile) ? JSON.parse(readFileSync(deployFile, "utf8")) : null;
const code = deployed ? await rpc("eth_getCode", [deployed.IdentityRegistry, "latest"]) : "0x";
if (!code || code === "0x") {
  log("Deploy contract lên Anvil…");
  run(
    "forge",
    [
      "script",
      "script/Deploy.s.sol",
      "--rpc-url",
      RPC,
      "--broadcast",
      "--private-key",
      // Khoá công khai của Anvil account #0 (chỉ dùng ở local)
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ],
    { cwd: join(root, "contracts") },
  );
  run("node", ["scripts/gen-abis.mjs"]);
  if (!args.has("--keep-db")) {
    log("Chain mới → xoá state indexer cũ (schema chain)");
    run("pnpm", ["--filter", "@socialonchain/db", "reset-chain"]);
  }
} else {
  log("Contract đã có trên Anvil");
}

log("Migrate DB…");
run("pnpm", ["db:migrate"]);

if (args.has("--seed")) {
  log("Seed dữ liệu hư cấu…");
  run("pnpm", ["seed"]);
}

start("indexer", "32", "pnpm", ["--filter", "@socialonchain/indexer", "dev"]);
start("worker", "33", "pnpm", ["--filter", "@socialonchain/worker", "dev"]);
const webPort = process.env.WEB_PORT || "3000";
if (!args.has("--no-web"))
  start("web", "35", "pnpm", ["--filter", "@socialonchain/web", "exec", "next", "dev", "-p", webPort]);
log(
  `Web: http://localhost:${webPort} · API: ${process.env.PUBLIC_API_URL || "http://localhost:42069"}/openapi.json · Ctrl+C để dừng`,
);
