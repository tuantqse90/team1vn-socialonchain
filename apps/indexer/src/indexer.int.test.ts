import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accounts, createDb } from "@socialonchain/db";
import { prepareTestDb } from "@socialonchain/db/testing";
import { FixtureFarcaster } from "@socialonchain/farcaster";
import {
  accountMessage,
  authKeyHash,
  channelHash,
  createAccountSecrets,
  decryptKeystore,
  deriveAccountKeys,
  dmBindMessage,
  dmDecrypt,
  dmDeriveMessage,
  dmEncrypt,
  dmKeyFromSignature,
  dmSharedKey,
  getDeployment,
  identityRegistryAbi,
  type KdfParams,
  type Keystore,
  type LabelBatch,
  onchainPostId,
  planPaymentsAbi,
  postsAbi,
  sessionAuthMessage,
  signLabelBatch,
  socialGraphAbi,
  testUSDAbi,
  verifyLabelBatch,
  ZERO_BYTES32,
} from "@socialonchain/protocol";
import { eq } from "drizzle-orm";
import pino from "pino";
import {
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  parseEther,
  parseEventLogs,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { ChainIndexer } from "./sync";

/**
 * Integration test: Anvil thật (port riêng) + Postgres thật (TEST_DATABASE_URL).
 * Thiếu anvil/forge/Postgres thì skip, không làm đỏ cả repo.
 */
const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const DB_URL = process.env.TEST_DATABASE_URL;
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const has = (bin: string) => {
  try {
    execFileSync("which", [bin]);
    return true;
  } catch {
    return false;
  }
};
const canRun = Boolean(DB_URL) && has("anvil") && has("forge");

// Khoá công khai của Anvil (chỉ dùng trong test local)
const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  alice: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  bob: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  carol: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  labeler: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  faucet: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // Anvil #8, như dev-local
} as const;

describe.skipIf(!canRun)("indexer + API (integration)", () => {
  let anvilProc: ChildProcess;
  let pub: PublicClient;
  let pool: { end: () => Promise<void> };
  let app: ReturnType<typeof createApp>;
  let indexer: ChainIndexer;
  let testDb = "";
  const d = getDeployment(31337);
  const alice = privateKeyToAccount(KEYS.alice);
  const bob = privateKeyToAccount(KEYS.bob);
  const carol = privateKeyToAccount(KEYS.carol);
  const session = privateKeyToAccount(generatePrivateKey());
  const wallet = (acc: ReturnType<typeof privateKeyToAccount>) =>
    createWalletClient({ account: acc, chain: anvil, transport: http(RPC) });
  let alicePost: Hex = ZERO_BYTES32;
  let deletedPost: Hex = ZERO_BYTES32;
  const now = () => Math.floor(Date.now() / 1000);

  // Kiểu args của writeContract là generic theo ABI; trong test ta nới lỏng để gọn.
  async function send(acc: ReturnType<typeof privateKeyToAccount>, args: Record<string, unknown>) {
    const hash = await wallet(acc).writeContract(args as never);
    return pub.waitForTransactionReceipt({ hash });
  }
  async function postAs(
    acc: ReturnType<typeof privateKeyToAccount>,
    actor: Hex,
    text: string,
    parent: Hex = ZERO_BYTES32,
  ) {
    const r = await send(acc, {
      address: d.Posts,
      abi: postsAbi,
      functionName: "post",
      args: [actor, text, parent, channelHash("avalanche"), "0x"],
      chain: anvil,
      account: acc,
    });
    const [ev] = parseEventLogs({ abi: postsAbi, logs: r.logs, eventName: "Posted" });
    return ev?.args.id as Hex;
  }

  beforeAll(async () => {
    anvilProc = spawn("anvil", ["--silent", "--port", String(PORT), "--chain-id", "31337"], {
      stdio: "ignore",
    });
    pub = createPublicClient({ chain: anvil, transport: http(RPC), pollingInterval: 50 });
    for (let i = 0; i < 50; i++) {
      try {
        await pub.getChainId();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    execFileSync(
      "forge",
      ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast", "--private-key", KEYS.deployer],
      { cwd: join(root, "contracts"), stdio: "ignore" },
    );

    testDb = (await prepareTestDb("indexer")) as string;
    const created = createDb(testDb);
    pool = created.pool;
    await created.db.execute(
      "truncate chain.users, chain.delegates, chain.follows, chain.posts, chain.reactions, chain.payments, chain.indexer_state, app.notifications, app.labels, app.author_labels, app.label_batches, app.usage, app.compile_cache, app.saved_feeds, app.events, app.user_settings, app.reports, app.blocklist, app.dm_keys, app.dm_messages, app.dm_threads, app.accounts" as never,
    );
    const env = loadEnv({
      DATABASE_URL: testDb,
      NETWORK: "local",
      FREE_COMPILES_PER_DAY: "2",
      ANVIL_RPC_URL: RPC,
      FAUCET_PRIVATE_KEY: KEYS.faucet,
    });
    indexer = new ChainIndexer(created.db, pub, d, pino({ level: "silent" }));
    app = createApp({
      db: created.db,
      env,
      client: pub,
      deployment: d,
      farcaster: FixtureFarcaster.fromFile(join(root, "fixtures/farcaster/fixture.json")),
      llm: undefined,
      log: pino({ level: "silent" }),
      indexerError: () => null,
      now,
    });

    // --- Hành trình onchain ---
    await send(alice, {
      address: d.IdentityRegistry,
      abi: identityRegistryAbi,
      functionName: "registerWithDelegate",
      args: ["alice", "", session.address, BigInt(now() + 30 * 86400)],
      value: parseEther("0.05"),
      chain: anvil,
      account: alice,
    });
    await send(bob, {
      address: d.IdentityRegistry,
      abi: identityRegistryAbi,
      functionName: "register",
      args: ["bob", ""],
      chain: anvil,
      account: bob,
    });
    // Đăng bài bằng session key (không popup ví)
    alicePost = await postAs(session, alice.address, "Shipped the indexer today @bob #Avalanche");
    await send(bob, {
      address: d.SocialGraph,
      abi: socialGraphAbi,
      functionName: "follow",
      args: [bob.address, alice.address],
      chain: anvil,
      account: bob,
    });
    await send(session, {
      address: d.SocialGraph,
      abi: socialGraphAbi,
      functionName: "follow",
      args: [alice.address, bob.address],
      chain: anvil,
      account: session,
    });
    await postAs(bob, bob.address, "How did you handle reorgs?", alicePost);
    await postAs(session, alice.address, "Avalanche has instant finality, so no reorg handling.", alicePost);
    await postAs(carol, carol.address, "Nice, same experience here.", alicePost);
    await send(bob, {
      address: d.Posts,
      abi: postsAbi,
      functionName: "react",
      args: [bob.address, alicePost, 1],
      chain: anvil,
      account: bob,
    });
    deletedPost = await postAs(session, alice.address, "oops typo");
    await send(session, {
      address: d.Posts,
      abi: postsAbi,
      functionName: "deletePost",
      args: [alice.address, deletedPost],
      chain: anvil,
      account: session,
    });
    // Mua Pro bằng tUSD
    await send(alice, {
      address: d.TestUSD,
      abi: testUSDAbi,
      functionName: "faucet",
      args: [],
      chain: anvil,
      account: alice,
    });
    await send(alice, {
      address: d.TestUSD,
      abi: testUSDAbi,
      functionName: "approve",
      args: [d.PlanPayments, 5_000_000n],
      chain: anvil,
      account: alice,
    });
    await send(alice, {
      address: d.PlanPayments,
      abi: planPaymentsAbi,
      functionName: "pay",
      args: [1, 1],
      chain: anvil,
      account: alice,
    });

    await indexer.catchUp();
  }, 120_000);

  afterAll(async () => {
    anvilProc?.kill();
    await pool?.end();
  });

  async function login(acc: ReturnType<typeof privateKeyToAccount>, owner: Hex) {
    const issuedAt = now();
    const p = { owner, key: acc.address, chainId: 31337, issuedAt };
    const signature = await acc.signMessage({ message: sessionAuthMessage(p) });
    const res = await app.request("/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, signature }),
    });
    return { status: res.status, body: (await res.json()) as { token: string } };
  }

  it("indexes users, follows, posts, threads, reactions, tombstones", async () => {
    const u = (await (await app.request("/users/alice")).json()) as {
      counts: { followers: number; following: number; posts: number };
    };
    expect(u.counts).toEqual({ followers: 1, following: 1, posts: 2 });
    const t = (await (await app.request(`/threads/${onchainPostId(alicePost)}`)).json()) as {
      root: { stats: { likes: number; replies: number }; channel: string };
      replies: unknown[];
    };
    expect(t.root.stats).toMatchObject({ likes: 1, replies: 3 });
    expect(t.root.channel).toBe("avalanche");
    expect(t.replies).toHaveLength(3);
    const del = (await (await app.request(`/posts/${onchainPostId(deletedPost)}`)).json()) as {
      deleted: boolean;
      text: string;
    };
    expect(del).toMatchObject({ deleted: true, text: "" });
  });

  it("session key login → JWT; owner wallet login works too", async () => {
    const s = await login(session, alice.address);
    expect(s.status).toBe(200);
    const me = (await (
      await app.request("/me", { headers: { authorization: `Bearer ${s.body.token}` } })
    ).json()) as {
      address: string;
      entitlements: { plan: string };
    };
    expect(me.address).toBe(alice.address.toLowerCase());
    expect(me.entitlements.plan).toBe("pro");
    const stranger = privateKeyToAccount(generatePrivateKey());
    expect((await login(stranger, alice.address)).status).toBe(401);
    expect((await login(bob, bob.address)).status).toBe(200);
  });

  it("notifications: mention, follow, reply, like", async () => {
    const bobToken = (await login(bob, bob.address)).body.token;
    const aliceToken = (await login(session, alice.address)).body.token;
    const nb = (await (
      await app.request("/notifications", { headers: { authorization: `Bearer ${bobToken}` } })
    ).json()) as {
      items: { kind: string }[];
    };
    expect(nb.items.map((i) => i.kind).sort()).toEqual(["follow", "mention"]);
    const na = (await (
      await app.request("/notifications", { headers: { authorization: `Bearer ${aliceToken}` } })
    ).json()) as {
      items: { kind: string }[];
    };
    expect(na.items.map((i) => i.kind).sort()).toEqual(["follow", "like", "reply", "reply"]);
  });

  it("feed: following source, conversation signal, Why reasons", async () => {
    const r = (await (
      await app.request(`/feed?viewer=${bob.address}&feedId=default:real-conversations`)
    ).json()) as {
      items: { post: { id: string }; reasons: { ruleIndex: number }[] }[];
    };
    const top = r.items.find((i) => i.post.id === onchainPostId(alicePost));
    expect(top?.reasons.map((x) => x.ruleIndex)).toContain(0);
  });

  it("signed label batches: trusted labeler accepted, unknown rejected; labels drive hide", async () => {
    const labeler = privateKeyToAccount(KEYS.labeler);
    const batch: LabelBatch = {
      v: 1,
      labeler: labeler.address,
      issuedAt: now(),
      items: [{ subject: onchainPostId(alicePost), label: "quality:shill", score: 0.95 }],
    };
    const ok = await app.request("/labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch, signature: await signLabelBatch(labeler, batch) }),
    });
    expect(ok.status).toBe(200);
    const rogue = privateKeyToAccount(generatePrivateKey());
    const bad = await app.request("/labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batch: { ...batch, labeler: rogue.address },
        signature: await signLabelBatch(rogue, { ...batch, labeler: rogue.address }),
      }),
    });
    expect(bad.status).toBe(403);
    const r = (await (
      await app.request(`/feed?viewer=${bob.address}&feedId=default:avalanche-no-shill`)
    ).json()) as {
      items: { post: { id: string } }[];
      hidden: number;
    };
    expect(r.items.some((i) => i.post.id === onchainPostId(alicePost))).toBe(false);
    expect(r.hidden).toBeGreaterThanOrEqual(1);
    // Luồng nhãn công khai: bên thứ ba lấy lại batch gốc + chữ ký và tự verify.
    const pub = (await (await app.request("/labels?since=0&limit=10")).json()) as {
      items: { labeler: string; signature: `0x${string}`; batch: LabelBatch }[];
      next: string | null;
    };
    expect(pub.items).toHaveLength(1);
    expect(pub.items[0]?.labeler).toBe(labeler.address.toLowerCase());
    expect(
      await verifyLabelBatch(pub.items[0]?.batch as LabelBatch, pub.items[0]?.signature as `0x${string}`),
    ).toBe(true);
    expect(pub.next).toBeNull();
  });

  it("free quota for compile: limit reached → 429 with entitlements", async () => {
    const token = (await login(bob, bob.address)).body.token;
    const compile = (text: string) =>
      app.request("/feeds/compile", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
    expect((await compile("less politics")).status).toBe(200);
    expect((await compile("less politics")).status).toBe(200); // cache hit, không tính quota
    expect((await compile("more defi")).status).toBe(200);
    const over = await compile("hide shill");
    expect(over.status).toBe(429);
    expect(((await over.json()) as { quota: string }).quota).toBe("compile");
  });

  it("revoked session key cannot post anymore (contract) and replay rebuilds the same state", async () => {
    await send(alice, {
      address: d.IdentityRegistry,
      abi: identityRegistryAbi,
      functionName: "removeDelegate",
      args: [session.address],
      chain: anvil,
      account: alice,
    });
    await expect(postAs(session, alice.address, "should fail")).rejects.toThrow();
    await indexer.catchUp();
    const before = await (await app.request("/users/alice")).json();
    const { db, pool: p2 } = createDb(testDb);
    await db.execute(
      "truncate chain.users, chain.delegates, chain.follows, chain.posts, chain.reactions, chain.payments, chain.indexer_state" as never,
    );
    await indexer.catchUp();
    await p2.end();
    expect(await (await app.request("/users/alice")).json()).toEqual(before);
  });

  it("farcaster import preview (fixture)", async () => {
    const token = (await login(bob, bob.address)).body.token;
    const r = await app.request("/import/farcaster/preview?fid=10001", {
      headers: { authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { toFollow: unknown[]; pending: unknown[]; estimate: { txs: number } };
    expect(r.status).toBe(200);
    expect(j.toFollow.length + j.pending.length).toBeGreaterThan(0);
    expect(j.estimate.txs).toBeGreaterThanOrEqual(j.toFollow.length ? 1 : 0);
  });

  it("design sync API: channels + join, builders, origins, kind filter, follow state, report reasons", async () => {
    const token = (await login(bob, bob.address)).body.token;
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const put = await app.request("/me/settings", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ channels: ["avalanche"] }),
    });
    expect(put.status).toBe(200);
    const ch = (await (await app.request("/channels/avalanche", { headers: auth })).json()) as {
      name: string;
      posts: number;
      members: number;
      joined: boolean | null;
    };
    expect(ch).toMatchObject({ name: "avalanche", members: 1, joined: true });
    expect(ch.posts).toBeGreaterThan(0);
    const anon = (await (await app.request("/channels/avalanche")).json()) as { joined: boolean | null };
    expect(anon.joined).toBeNull();
    const list = (await (await app.request("/channels")).json()) as { items: { name: string }[] };
    expect(list.items.some((i) => i.name === "avalanche")).toBe(true);

    const feed = (await (
      await app.request(`/feed?feedId=default:chronological&viewer=${bob.address.toLowerCase()}`)
    ).json()) as { items: { origins?: string[] }[] };
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.every((i) => Array.isArray(i.origins) && i.origins.length > 0)).toBe(true);

    const replies = (await (await app.request("/users/alice/posts?kind=replies")).json()) as {
      items: { parentId: string | null }[];
    };
    expect(replies.items.every((p) => p.parentId !== null)).toBe(true);
    const roots = (await (await app.request("/users/alice/posts?kind=posts")).json()) as {
      items: { parentId: string | null }[];
    };
    expect(roots.items.length).toBeGreaterThan(0);
    expect(roots.items.every((p) => p.parentId === null)).toBe(true);

    const u = (await (await app.request("/users/alice")).json()) as {
      registeredBlock: number | null;
      topTopics: string[];
    };
    expect(u.registeredBlock).toBeGreaterThan(0);
    expect(Array.isArray(u.topTopics)).toBe(true);

    const s = (await (await app.request(`/search?q=alice&viewer=${bob.address.toLowerCase()}`)).json()) as {
      users: { address: string | null; viewerFollows?: boolean }[];
    };
    expect(s.users.length).toBeGreaterThan(0);
    expect(s.users.filter((x) => x.address).every((x) => typeof x.viewerFollows === "boolean")).toBe(true);

    expect((await app.request("/builders?limit=5")).status).toBe(200);
    const net = (await (await app.request("/network")).json()) as { labelers: string[] };
    expect(net.labelers.length).toBeGreaterThan(0);

    const posts = (await (await app.request("/users/alice/posts")).json()) as { items: { id: string }[] };
    const report = await app.request("/reports", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ postId: posts.items[0]?.id, reason: "shill" }),
    });
    expect(report.status).toBeLessThan(300);

    const aliceToken = (await login(alice, alice.address)).body.token;
    const notes = (await (
      await app.request("/notifications", { headers: { authorization: `Bearer ${aliceToken}` } })
    ).json()) as {
      items: { kind: string; actor: { viewerFollows?: boolean }; parent: { id: string } | null }[];
    };
    const reply = notes.items.find((n) => n.kind === "reply");
    expect(reply?.parent?.id).toMatch(/^oc:0x/);
    expect(typeof reply?.actor.viewerFollows).toBe("boolean");
  });

  it("dm: keys bound by owner signature, E2E ciphertext, inbox main/requests, request limit, accept/decline", async () => {
    type Acc = ReturnType<typeof privateKeyToAccount>;
    const dave = privateKeyToAccount(generatePrivateKey()); // chưa đăng ký
    await send(carol, {
      address: d.IdentityRegistry,
      abi: identityRegistryAbi,
      functionName: "register",
      args: ["carol", ""],
      chain: anvil,
      account: carol,
    });
    // bob follow carol → carol có 1 "bạn chung" với alice (alice follow bob)
    await send(bob, {
      address: d.SocialGraph,
      abi: socialGraphAbi,
      functionName: "follow",
      args: [bob.address, carol.address],
      chain: anvil,
      account: bob,
    });
    await indexer.catchUp();

    const req = async (token: string, path: string, init: { method?: string; json?: unknown } = {}) => {
      const r = await app.request(path, {
        method: init.method ?? "GET",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
      });
      return { status: r.status, body: (await r.json()) as Record<string, unknown> & { [k: string]: never } };
    };
    const tok = async (acc: Acc) => (await login(acc, acc.address)).body.token;
    const enable = async (acc: Acc, token: string) => {
      const keys = await dmKeyFromSignature(await acc.signMessage({ message: dmDeriveMessage(acc.address) }));
      const signature = await acc.signMessage({ message: dmBindMessage(acc.address, keys.publicKey) });
      expect(
        (await req(token, "/dm/key", { method: "PUT", json: { publicKey: keys.publicKey, signature } }))
          .status,
      ).toBe(200);
      return keys;
    };
    const T = {
      alice: await tok(alice),
      bob: await tok(bob),
      carol: await tok(carol),
      dave: await tok(dave),
    };
    const K = {
      alice: await enable(alice, T.alice),
      bob: await enable(bob, T.bob),
      carol: await enable(carol, T.carol),
    };

    // Khoá phải do chính owner ký: bob không công bố khoá hộ người khác được.
    const forged = await bob.signMessage({ message: dmBindMessage(alice.address, K.bob.publicKey) });
    expect(
      (
        await req(T.alice, "/dm/key", {
          method: "PUT",
          json: { publicKey: K.bob.publicKey, signature: forged },
        })
      ).status,
    ).toBe(401);
    const pubAlice = (await (await app.request(`/dm/keys/${alice.address}`)).json()) as {
      current: { publicKey: string };
    };
    expect(pubAlice.current.publicKey).toBe(K.alice.publicKey);

    const sendDm = async (
      from: Acc,
      fromKey: { privateKey: Hex; publicKey: Hex },
      to: Acc,
      toPub: Hex,
      text: string,
    ) => {
      const k = await dmSharedKey(fromKey.privateKey, toPub, from.address, to.address);
      const env = await dmEncrypt(k, { v: 1, t: "text", text }, from.address, to.address);
      return req(
        (T as Record<string, string>)[from === bob ? "bob" : from === carol ? "carol" : "alice"] as string,
        "/dm/messages",
        {
          method: "POST",
          json: { to: to.address, senderKey: fromKey.publicKey, recipientKey: toPub, ...env },
        },
      );
    };

    // bob → alice: alice follow bob → vào "main"; server chỉ thấy ciphertext.
    const m1 = await sendDm(bob, K.bob, alice, K.alice.publicKey, "gm alice, chào 🔥");
    expect(m1.status).toBe(201);
    expect(String(m1.body.ciphertext)).not.toContain("chào");
    const main = await req(T.alice, "/dm/threads?box=main");
    const items = main.body.items as unknown as {
      peer: { address: string };
      unread: boolean;
      lastMessage: { nonce: string; ciphertext: string };
    }[];
    const fromBob = items.find((i) => i.peer.address === bob.address.toLowerCase());
    expect(fromBob?.unread).toBe(true);
    const kAB = await dmSharedKey(K.alice.privateKey, K.bob.publicKey, alice.address, bob.address);
    expect(await dmDecrypt(kAB, fromBob!.lastMessage, bob.address, alice.address)).toEqual({
      v: 1,
      t: "text",
      text: "gm alice, chào 🔥",
    });
    expect((await req(T.alice, "/dm/unread")).body).toEqual({ main: 1, requests: 0 });
    await req(T.alice, `/dm/threads/${bob.address}/read`, { method: "POST", json: { upTo: m1.body.id } });
    expect((await req(T.alice, "/dm/unread")).body).toEqual({ main: 0, requests: 0 });

    // carol → alice: người lạ → "requests", có 1 bạn chung; tối đa 3 tin khi chưa được chấp nhận.
    for (let i = 0; i < 3; i++)
      expect((await sendDm(carol, K.carol, alice, K.alice.publicKey, `hi ${i}`)).status).toBe(201);
    const over = await sendDm(carol, K.carol, alice, K.alice.publicKey, "hi 3");
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("request_pending");
    const reqs = (await req(T.alice, "/dm/threads?box=requests")).body.items as unknown as {
      peer: { address: string };
      mutuals: number;
    }[];
    expect(reqs.map((r) => r.peer.address)).toEqual([carol.address.toLowerCase()]);
    expect(reqs[0]?.mutuals).toBe(1);
    expect((await req(T.alice, "/dm/unread")).body).toEqual({ main: 0, requests: 1 });

    // Khoá cũ/sai → 409, client lấy khoá mới.
    const stale = await req(T.carol, "/dm/messages", {
      method: "POST",
      json: {
        to: alice.address,
        senderKey: K.carol.publicKey,
        recipientKey: K.bob.publicKey,
        nonce: "AAAAAAAAAAAAAAAA",
        ciphertext: "AAAA",
      },
    });
    expect(stale.status).toBe(409);

    // alice chấp nhận → carol vào main, gửi tiếp được.
    expect(
      (
        await req(T.alice, `/dm/threads/${carol.address}/state`, {
          method: "POST",
          json: { state: "accepted" },
        })
      ).status,
    ).toBe(200);
    expect((await sendDm(carol, K.carol, alice, K.alice.publicKey, "thanks!")).status).toBe(201);
    const mainAfter = (await req(T.alice, "/dm/threads?box=main")).body.items as unknown as {
      peer: { address: string };
    }[];
    expect(mainAfter.map((i) => i.peer.address)).toContain(carol.address.toLowerCase());
    const thread = (await req(T.alice, `/dm/threads/${carol.address}`)).body as unknown as {
      messages: { sender: string }[];
      box: string;
    };
    expect(thread.messages).toHaveLength(4);
    expect(thread.box).toBe("main");

    // alice từ chối bob → bob biến khỏi hộp thư của alice; bob không biết (vẫn gửi được như tin chờ).
    await req(T.alice, `/dm/threads/${bob.address}/state`, { method: "POST", json: { state: "declined" } });
    const mainDeclined = (await req(T.alice, "/dm/threads?box=main")).body.items as unknown as {
      peer: { address: string };
    }[];
    expect(mainDeclined.map((i) => i.peer.address)).not.toContain(bob.address.toLowerCase());

    // Chưa đăng ký onchain thì không gửi được.
    await enable(dave, T.dave);
    const daveSend = await req(T.dave, "/dm/messages", {
      method: "POST",
      json: {
        to: alice.address,
        senderKey: K.alice.publicKey,
        recipientKey: K.alice.publicKey,
        nonce: "AAAAAAAAAAAAAAAA",
        ciphertext: "AAAA",
      },
    });
    expect(daveSend.status).toBe(403);
    // Không đăng nhập thì không đọc được hộp thư.
    expect((await app.request("/dm/threads")).status).toBe(401);
  });
  it("embedded account: signup + gas drip, kdf, login, conflicts; server never holds the key", async () => {
    const post = async (path: string, json: unknown, headers: Record<string, string> = {}) => {
      const res = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(json),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };
    const sign = (acc: ReturnType<typeof privateKeyToAccount>, handle: string) =>
      acc.signMessage({ message: accountMessage({ handle, address: acc.address, chainId: 31337 }) });
    const FAST = { N: 2 ** 15, r: 8, p: 1 }; // mức tối thiểu server chấp nhận
    const password = "mật khẩu đủ dài 123";
    const ownerKey = generatePrivateKey();
    const eve = privateKeyToAccount(ownerKey);
    const handle = "eve_builder";
    const secrets = await createAccountSecrets(password, ownerKey, eve.address, FAST);

    // Tạo tài khoản → 201 + được tặng đúng GAS_DRIP_WEI (local 0.1).
    const before = await pub.getBalance({ address: eve.address });
    const signup = await post("/accounts", {
      handle,
      address: eve.address,
      ...secrets,
      signature: await sign(eve, handle),
    });
    expect(signup.status).toBe(201);
    expect(signup.body).toMatchObject({ handle, address: eve.address.toLowerCase() });
    expect(signup.body.dripSkipped).toBeUndefined();
    const dripHash = (signup.body.drip as { hash: string }).hash;
    expect(dripHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await pub.getBalance({ address: eve.address })).toBe(before + parseEther("0.1"));

    // Tham số KDF công khai (tên không phân biệt hoa thường).
    const kdfRes = await app.request("/accounts/kdf/Eve_Builder");
    expect(kdfRes.status).toBe(200);
    expect(await kdfRes.json()).toEqual({ handle, kdf: secrets.kdf });
    expect((await app.request("/accounts/kdf/nobody_here")).status).toBe(404);

    // Đăng nhập: authKey đúng → keystore giải mã ra đúng private key.
    const login = await post("/accounts/login", { handle, authKey: secrets.authKey });
    expect(login.status).toBe(200);
    expect(login.body.address).toBe(eve.address.toLowerCase());
    const { encKey, authKey } = await deriveAccountKeys(password, login.body.kdf as KdfParams);
    expect(authKey).toBe(secrets.authKey);
    expect(decryptKeystore(encKey, login.body.keystore as Keystore, eve.address)).toBe(ownerKey);
    // Sai mật khẩu và tên không tồn tại: cùng một lỗi.
    const wrong = await deriveAccountKeys("sai mật khẩu rồi", secrets.kdf);
    const bad = await post("/accounts/login", { handle, authKey: wrong.authKey });
    expect(bad).toEqual({ status: 401, body: { error: "bad_credentials" } });
    const ghost = await post("/accounts/login", { handle: "nobody_here", authKey: secrets.authKey });
    expect(ghost).toEqual({ status: 401, body: { error: "bad_credentials" } });

    // Trùng tên / trùng địa chỉ / tên đã đăng ký onchain bởi người khác → 409.
    const mallory = privateKeyToAccount(generatePrivateKey());
    const m = { address: mallory.address, ...secrets };
    const dupHandle = await post("/accounts", { ...m, handle, signature: await sign(mallory, handle) });
    expect(dupHandle).toEqual({ status: 409, body: { error: "handle_taken" } });
    const onchainTaken = await post("/accounts", {
      ...m,
      handle: "alice",
      signature: await sign(mallory, "alice"),
    });
    expect(onchainTaken).toEqual({ status: 409, body: { error: "handle_taken" } });
    const dupAddr = await post("/accounts", {
      address: eve.address,
      ...secrets,
      handle: "eve_two",
      signature: await sign(eve, "eve_two"),
    });
    expect(dupAddr).toEqual({ status: 409, body: { error: "address_exists" } });
    // Chữ ký không phải của `address` (hoặc ký tên khác) → 401; KDF quá yếu → 400.
    const forged = await post("/accounts", {
      ...m,
      handle: "mallory",
      signature: await sign(eve, "mallory"),
    });
    expect(forged).toEqual({ status: 401, body: { error: "bad_signature" } });
    const wrongMsg = await post("/accounts", {
      ...m,
      handle: "mallory",
      signature: await sign(mallory, "other"),
    });
    expect(wrongMsg.status).toBe(401);
    const weak = await post("/accounts", {
      ...m,
      handle: "mallory",
      kdf: { ...secrets.kdf, N: 2 ** 14 },
      signature: await sign(mallory, "mallory"),
    });
    expect(weak.status).toBe(400);

    // Ví đã có gas (bob, cùng địa chỉ với tên onchain "bob") → tạo được, không tặng thêm.
    const bobSignup = await post("/accounts", {
      handle: "bob",
      address: bob.address,
      ...secrets,
      signature: await sign(bob, "bob"),
    });
    expect(bobSignup).toEqual({
      status: 201,
      body: { handle: "bob", address: bob.address.toLowerCase(), drip: null, dripSkipped: "funded" },
    });

    // DB chỉ có ciphertext + sha256(authKey): không có private key, không có authKey.
    const { db, pool: p } = createDb(testDb);
    try {
      const [row] = await db.select().from(accounts).where(eq(accounts.handle, handle));
      expect(row?.authHash).toBe(authKeyHash(secrets.authKey));
      expect(row?.dripTx).toBe(dripHash);
      const dump = JSON.stringify(row).toLowerCase();
      expect(dump).not.toContain(ownerKey.slice(2).toLowerCase());
      expect(dump).not.toContain(secrets.authKey.slice(2).toLowerCase());
    } finally {
      await p.end();
    }

    // Đoán mật khẩu: tối đa 10 lần/phút mỗi tên (kể cả đổi IP qua x-forwarded-for).
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await post(
        "/accounts/login",
        { handle, authKey: wrong.authKey },
        { "x-forwarded-for": `198.51.100.${i}, 10.0.0.1` },
      );
      statuses.push(r.status);
    }
    // Trước đó đã thử 2 lần với tên này: 8 lần nữa là đủ 10, sau đó 429.
    expect(statuses).toEqual([...Array(8).fill(401), 429, 429]);
  });
});
