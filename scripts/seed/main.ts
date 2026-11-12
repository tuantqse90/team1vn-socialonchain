/**
 * Seed dữ liệu HƯ CẤU — CHỈ dùng ở local (Anvil). Không tên/ảnh người thật, không chính trị VN có thật.
 * - 40 persona (scripts/seed/personas.json), key sinh tất định: keccak256("socialonchain-seed:<key>")
 * - Graph follow, 360 bài + 30 thread (scripts/seed/posts.json), like ngẫu nhiên tất định
 * - Nếu chain đang ở quá khứ (dev-local --seed khởi động Anvil lùi 8 ngày) thì trải bài đều 7 ngày
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, dmKeys, profiles } from "@socialonchain/db";
import {
  channelHash,
  dmBindMessage,
  dmDeriveMessage,
  dmKeyFromSignature,
  getDeployment,
  identityRegistryAbi,
  postsAbi,
  socialGraphAbi,
  ZERO_BYTES32,
} from "@socialonchain/protocol";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  type Hex,
  http,
  keccak256,
  parseEther,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

type Persona = { key: string; handle: string; name: string; bio: string; kind: string; lang: string };
type SeedPost = { persona: string; text: string; channel?: string | null };
type Thread = { root: SeedPost; replies: SeedPost[] };

if ((process.env.NETWORK ?? "local") !== "local") {
  console.error("seed chỉ chạy ở NETWORK=local");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const personas = JSON.parse(readFileSync(join(here, "personas.json"), "utf8")) as Persona[];
const content = JSON.parse(readFileSync(join(here, "posts.json"), "utf8")) as {
  posts: SeedPost[];
  threads: Thread[];
};
const RPC = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
const API = process.env.PUBLIC_API_URL ?? "http://localhost:42069";
const d = getDeployment(31337);
const pub = createPublicClient({ chain: anvil, transport: http(RPC), pollingInterval: 20 });
const test = createTestClient({ chain: anvil, mode: "anvil", transport: http(RPC) });
const funder = createWalletClient({
  account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  chain: anvil,
  transport: http(RPC),
});

// PRNG tất định (mulberry32) để seed chạy lại ra cùng kết quả
let s = 0x5eed;
const rand = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)] as T;

const accounts = new Map(
  personas.map((p) => [p.key, privateKeyToAccount(keccak256(toBytes(`socialonchain-seed:${p.key}`)))]),
);
const wallet = (key: string) =>
  createWalletClient({ account: accounts.get(key)!, chain: anvil, transport: http(RPC) });
const nonces = new Map<string, bigint>();

/**
 * Anvil 1.8 automine chậm (~400ms/tx) khi đồng hồ chain ở quá khứ. Seed tắt automine và tự mine từng block
 * (~4ms/tx), cuối cùng bật lại automine cho app.
 */
async function waitTx(hash: Hex) {
  await test.mine({ blocks: 1 });
  const r = await pub.getTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx reverted ${hash}`);
}
await test.setAutomine(false);
process.on("uncaughtException", async (e) => {
  await test.setAutomine(true).catch(() => undefined);
  console.error(e);
  process.exit(1);
});
process.on("unhandledRejection", async (e) => {
  await test.setAutomine(true).catch(() => undefined);
  console.error(e);
  process.exit(1);
});

// Thời gian: nếu chain đang ở quá khứ thì trải bài từ (now-7d) tới now.
const nowSec = Math.floor(Date.now() / 1000);
const latest = await pub.getBlock();
let clock = Number(latest.timestamp);
const totalPosts = content.posts.length + content.threads.reduce((n, t) => n + 1 + t.replies.length, 0);
const spread = clock < nowSec - 6 * 86400;
const step = spread ? Math.floor((nowSec - 600 - Math.max(clock, nowSec - 7 * 86400)) / (totalPosts + 1)) : 0;
if (spread) clock = Math.max(clock, nowSec - 7 * 86400);
async function tick(seconds: number) {
  if (!spread) return;
  clock += seconds;
  await test.setNextBlockTimestamp({ timestamp: BigInt(clock) });
}

console.log(`seed: ${personas.length} personas, ${totalPosts} posts, spread=${spread}`);

// 1) Nạp AVAX + đăng ký + profile offchain
const { db, pool } = createDb();
for (const p of personas) {
  const acc = accounts.get(p.key)!;
  const registered = await pub.readContract({
    address: d.IdentityRegistry,
    abi: identityRegistryAbi,
    functionName: "registered",
    args: [acc.address],
  });
  if (!registered) {
    await waitTx(await funder.sendTransaction({ to: acc.address, value: parseEther("2") }));
    await tick(30);
    await waitTx(
      await wallet(p.key).writeContract({
        address: d.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "register",
        args: [p.handle, `${API}/profiles/${acc.address.toLowerCase()}`],
      }),
    );
  }
  await db
    .insert(profiles)
    .values({ address: acc.address.toLowerCase(), displayName: p.name, bio: p.bio })
    .onConflictDoUpdate({ target: profiles.address, set: { displayName: p.name, bio: p.bio } });
  nonces.set(
    p.key,
    await pub.readContract({
      address: d.Posts,
      abi: postsAbi,
      functionName: "postNonce",
      args: [acc.address],
    }),
  );
}

// 2) Graph follow: builder/founder follow nhau nhiều hơn
const keys = personas.map((p) => p.key);
const kindOf = new Map(personas.map((p) => [p.key, p.kind]));
for (const p of personas) {
  const targets = new Set<string>();
  const want = 6 + Math.floor(rand() * 10);
  while (targets.size < want) {
    const t = pick(keys);
    if (t === p.key) continue;
    const techy = ["builder", "founder"].includes(kindOf.get(t) ?? "");
    if (!techy && rand() < 0.4) continue;
    targets.add(t);
  }
  const addrs = [...targets].map((t) => accounts.get(t)!.address);
  await tick(20);
  await waitTx(
    await wallet(p.key).writeContract({
      address: d.SocialGraph,
      abi: socialGraphAbi,
      functionName: "followMany",
      args: [accounts.get(p.key)!.address, addrs],
    }),
  );
}

// 3) Bài + thread, xen kẽ theo thời gian
const followersOf = new Map<string, string[]>();
const allIds: { id: Hex; author: string }[] = [];

async function post(sp: SeedPost, parent: Hex = ZERO_BYTES32): Promise<Hex> {
  const acc = accounts.get(sp.persona);
  if (!acc) throw new Error(`unknown persona ${sp.persona}`);
  const n = nonces.get(sp.persona) ?? 0n;
  const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [acc.address, n]));
  nonces.set(sp.persona, n + 1n);
  await tick(step);
  await waitTx(
    await wallet(sp.persona).writeContract({
      address: d.Posts,
      abi: postsAbi,
      functionName: "post",
      args: [acc.address, sp.text, parent, sp.channel ? channelHash(sp.channel) : ZERO_BYTES32, "0x"],
    }),
  );
  allIds.push({ id, author: sp.persona });
  return id;
}

const queue: (SeedPost | Thread)[] = [...content.posts];
content.threads.forEach((t, i) => {
  queue.splice(Math.floor(((i + 1) * queue.length) / (content.threads.length + 1)), 0, t);
});
for (const item of queue) {
  if ("root" in item) {
    const root = await post(item.root);
    let last = root;
    for (const r of item.replies) last = await post(r, rand() < 0.7 ? root : last);
  } else {
    await post(item);
  }
}

// 4) Like: bài builder/founder có nội dung được like nhiều hơn
for (const { id, author } of allIds) {
  const kind = kindOf.get(author) ?? "";
  const likes = Math.floor(rand() * (["builder", "founder"].includes(kind) ? 7 : kind === "bait" ? 9 : 3));
  const likers = new Set<string>();
  for (let i = 0; i < likes; i++) likers.add(pick(keys));
  likers.delete(author);
  for (const l of likers) {
    await waitTx(
      await wallet(l).writeContract({
        address: d.Posts,
        abi: postsAbi,
        functionName: "react",
        args: [accounts.get(l)!.address, id, 1],
      }),
    );
  }
}
void followersOf;

// 5) Đồng bộ đồng hồ chain về hiện tại để bài mới của người dùng không bị "cũ", rồi bật lại automine
if (spread) {
  await test.setNextBlockTimestamp({ timestamp: BigInt(Math.floor(Date.now() / 1000)) });
  await test.mine({ blocks: 1 });
}
await test.setAutomine(true);

// 6) Tin nhắn: vài builder bật khoá nhắn tin (khoá sinh tất định từ chữ ký persona, như trên client)
for (const key of ["p08", "p09", "p10", "p11", "p12"]) {
  const acc = accounts.get(key);
  if (!acc) continue;
  const kp = await dmKeyFromSignature(await acc.signMessage({ message: dmDeriveMessage(acc.address) }));
  const signature = await acc.signMessage({ message: dmBindMessage(acc.address, kp.publicKey) });
  await db
    .insert(dmKeys)
    .values({ address: acc.address.toLowerCase(), publicKey: kp.publicKey, signature })
    .onConflictDoNothing();
}
await pool.end();
console.log(`seed xong: ${allIds.length} bài onchain. Indexer sẽ tự bắt kịp; worker gán nhãn trong ~1 phút.`);
