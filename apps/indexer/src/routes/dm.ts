import { OpenAPIHono, z } from "@hono/zod-openapi";
import { blocklist, dmKeys, dmMessages, dmThreads, follows, users } from "@socialonchain/db";
import { dmBindMessage, dmPair, isDmPublicKey } from "@socialonchain/protocol";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import type { AppVars } from "../auth";
import type { AppContext } from "../context";
import { loadAuthors } from "../views";
import { body, HttpError, requireAuth } from "./write";

/**
 * Tin nhắn riêng (DM), mã hoá đầu cuối ở client. Server chỉ lưu ciphertext + metadata, không đọc được nội dung.
 * Hộp thư chia 2: "main" (người mình follow, đã chấp nhận, hoặc mình đã nhắn) và "requests" (người lạ).
 */
export const DM_LIMITS = {
  /** Tin tối đa gửi cho người chưa chấp nhận/chưa follow mình. */
  requestMessages: 3,
  /** Số người lạ tối đa được nhắn lần đầu trong 24 giờ. */
  newThreadsPerDay: 20,
  /** Tin tối đa mỗi phút mỗi người gửi. */
  perMinute: 30,
  /** Độ dài tối đa của ciphertext (base64). */
  maxCiphertext: 6000,
} as const;

const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const PubKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const B64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

type MessageRow = typeof dmMessages.$inferSelect;
const view = (m: MessageRow) => ({
  id: m.id,
  sender: m.sender,
  recipient: m.recipient,
  senderKey: m.senderKey,
  recipientKey: m.recipientKey,
  nonce: m.nonce,
  ciphertext: m.ciphertext,
  createdAt: Math.floor(m.createdAt.getTime() / 1000),
});

export function dmRoutes(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>();
  const db = ctx.db;

  async function currentKey(address: string) {
    const [k] = await db
      .select()
      .from(dmKeys)
      .where(eq(dmKeys.address, address))
      .orderBy(desc(dmKeys.createdAt))
      .limit(1);
    return k ?? null;
  }

  /** R có coi P là "main" không: đã chấp nhận/đã nhắn (state accepted) hoặc R follow P. */
  async function isMainFor(owner: string, peer: string) {
    const [t] = await db
      .select({ state: dmThreads.state })
      .from(dmThreads)
      .where(and(eq(dmThreads.owner, owner), eq(dmThreads.peer, peer)));
    if (t?.state === "accepted") return true;
    const [f] = await db
      .select({ x: follows.follower })
      .from(follows)
      .where(and(eq(follows.follower, owner), eq(follows.target, peer)));
    return Boolean(f);
  }

  // ---------- Khoá ----------
  app.get("/dm/keys/:address", async (c) => {
    const address = c.req.param("address").toLowerCase();
    if (!Addr.safeParse(address).success) throw new HttpError(400, "bad_address");
    const rows = await db
      .select()
      .from(dmKeys)
      .where(eq(dmKeys.address, address))
      .orderBy(desc(dmKeys.createdAt))
      .limit(20);
    const keys = rows.map((r) => ({
      publicKey: r.publicKey,
      signature: r.signature,
      createdAt: Math.floor(r.createdAt.getTime() / 1000),
    }));
    return c.json({ address, current: keys[0] ?? null, keys });
  });

  app.put("/dm/key", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, z.object({ publicKey: PubKey, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }));
    const publicKey = b.publicKey.toLowerCase();
    if (!isDmPublicKey(publicKey)) throw new HttpError(400, "bad_public_key");
    // publicClient.verifyMessage: EOA + ví hợp đồng (ERC-1271).
    const ok = await ctx.client
      .verifyMessage({
        address: a.address as Address,
        message: dmBindMessage(a.address as Address, publicKey),
        signature: b.signature as Hex,
      })
      .catch(() => false);
    if (!ok) throw new HttpError(401, "bad_signature");
    await db
      .insert(dmKeys)
      .values({ address: a.address, publicKey, signature: b.signature })
      .onConflictDoUpdate({
        target: [dmKeys.address, dmKeys.publicKey],
        set: { signature: b.signature, createdAt: new Date() },
      });
    return c.json({ ok: true, publicKey });
  });

  // ---------- Hộp thư ----------
  async function loadThreads(owner: string) {
    const rows = await db
      .select()
      .from(dmThreads)
      .where(and(eq(dmThreads.owner, owner), ne(dmThreads.state, "declined"), gt(dmThreads.lastMessageId, 0)))
      .orderBy(desc(dmThreads.lastMessageId))
      .limit(200);
    const peers = rows.map((r) => r.peer);
    const followed = new Set(
      peers.length
        ? (
            await db
              .select({ t: follows.target })
              .from(follows)
              .where(and(eq(follows.follower, owner), inArray(follows.target, peers)))
          ).map((r) => r.t)
        : [],
    );
    return rows.map((r) => ({
      ...r,
      youFollow: followed.has(r.peer),
      box: r.state === "accepted" || followed.has(r.peer) ? ("main" as const) : ("requests" as const),
      unread: r.lastIncomingId > r.lastReadId,
    }));
  }

  app.get("/dm/unread", async (c) => {
    const a = requireAuth(c);
    const threads = await loadThreads(a.address);
    return c.json({
      main: threads.filter((t) => t.box === "main" && t.unread).length,
      requests: threads.filter((t) => t.box === "requests").length,
    });
  });

  app.get("/dm/threads", async (c) => {
    const a = requireAuth(c);
    const box = c.req.query("box") === "requests" ? "requests" : "main";
    const all = await loadThreads(a.address);
    const threads = all.filter((t) => t.box === box).slice(0, 100);
    const peers = threads.map((t) => t.peer);
    const lastIds = threads.map((t) => t.lastMessageId);
    const [authors, lastRows, keyRows, mutualRows, followsYouRows] = await Promise.all([
      loadAuthors(db, peers),
      lastIds.length ? db.select().from(dmMessages).where(inArray(dmMessages.id, lastIds)) : [],
      peers.length
        ? db.select().from(dmKeys).where(inArray(dmKeys.address, peers)).orderBy(desc(dmKeys.createdAt))
        : [],
      // Bạn chung: người mình follow mà cũng follow peer.
      peers.length
        ? db.execute(sql`
            select f2.target as peer, count(*)::int as n
            from chain.follows f1 join chain.follows f2 on f2.follower = f1.target
            where f1.follower = ${a.address} and f2.target in (${sql.join(
              peers.map((p) => sql`${p}`),
              sql`, `,
            )})
            group by f2.target`)
        : { rows: [] },
      peers.length
        ? db
            .select({ f: follows.follower })
            .from(follows)
            .where(and(eq(follows.target, a.address), inArray(follows.follower, peers)))
        : [],
    ]);
    const last = new Map(lastRows.map((m) => [m.id, m]));
    const keyOf = new Map<string, string>();
    for (const k of keyRows) if (!keyOf.has(k.address)) keyOf.set(k.address, k.publicKey);
    const mutuals = new Map(
      (mutualRows.rows as { peer: string; n: number }[]).map((r) => [r.peer, Number(r.n)]),
    );
    const followsYou = new Set(followsYouRows.map((r) => r.f));
    const items = threads.map((t) => {
      const m = last.get(t.lastMessageId);
      return {
        peer: authors.get(t.peer),
        peerKey: keyOf.get(t.peer) ?? null,
        state: t.state,
        box: t.box,
        unread: t.unread,
        youFollow: t.youFollow,
        followsYou: followsYou.has(t.peer),
        mutuals: mutuals.get(t.peer) ?? 0,
        lastMessage: m ? view(m) : null,
      };
    });
    if (box === "requests") {
      // Người lạ: xếp theo bạn chung, rồi số contract đã deploy (onchain_builder), rồi mới nhất.
      items.sort(
        (x, y) =>
          y.mutuals - x.mutuals ||
          (y.peer?.contractsDeployed ?? 0) - (x.peer?.contractsDeployed ?? 0) ||
          (y.lastMessage?.id ?? 0) - (x.lastMessage?.id ?? 0),
      );
    }
    return c.json({ box, items });
  });

  app.get("/dm/threads/:peer", async (c) => {
    const a = requireAuth(c);
    const peer = c.req.param("peer").toLowerCase();
    if (!Addr.safeParse(peer).success) throw new HttpError(400, "bad_address");
    const before = Number(c.req.query("before") ?? 0);
    const pair = dmPair(a.address, peer);
    const rows = await db
      .select()
      .from(dmMessages)
      .where(and(eq(dmMessages.pair, pair), before ? lt(dmMessages.id, before) : undefined))
      .orderBy(desc(dmMessages.id))
      .limit(50);
    const [mine, theirs] = await Promise.all([
      db
        .select()
        .from(dmThreads)
        .where(and(eq(dmThreads.owner, a.address), eq(dmThreads.peer, peer))),
      db
        .select({ lastReadId: dmThreads.lastReadId })
        .from(dmThreads)
        .where(and(eq(dmThreads.owner, peer), eq(dmThreads.peer, a.address))),
    ]);
    const t = mine[0];
    const main = await isMainFor(a.address, peer);
    const authors = await loadAuthors(db, [peer]);
    return c.json({
      peer: authors.get(peer),
      state: t?.state ?? "open",
      box: main ? "main" : t ? "requests" : "main",
      /** Người kia đã đọc tới tin nào (để hiện "Đã xem"). */
      peerReadId: theirs[0]?.lastReadId ?? 0,
      /** Mình đã gửi bao nhiêu tin khi người kia chưa chấp nhận (giới hạn requestMessages). */
      pending: !(await isMainFor(peer, a.address)),
      sentCount: t?.sentCount ?? 0,
      limits: DM_LIMITS,
      messages: rows.reverse().map(view),
      nextBefore: rows.length === 50 ? rows[0]?.id : null,
    });
  });

  // ---------- Gửi ----------
  const SendBody = z.object({
    to: Addr,
    senderKey: PubKey,
    recipientKey: PubKey,
    nonce: B64.length(16),
    ciphertext: B64.max(DM_LIMITS.maxCiphertext),
  });
  app.post("/dm/messages", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, SendBody);
    const from = a.address;
    const to = b.to.toLowerCase();
    if (to === from) throw new HttpError(400, "self");

    const [reg] = await db.select({ a: users.address }).from(users).where(eq(users.address, from));
    if (!reg) throw new HttpError(403, "not_registered");
    const [banned] = await db.select().from(blocklist).where(eq(blocklist.subject, from));
    if (banned) throw new HttpError(403, "blocked");

    const [myKey, theirKey] = await Promise.all([currentKey(from), currentKey(to)]);
    if (!theirKey) throw new HttpError(409, "recipient_no_key");
    if (!myKey || myKey.publicKey !== b.senderKey.toLowerCase())
      throw new HttpError(409, "stale_key", { which: "sender" });
    if (theirKey.publicKey !== b.recipientKey.toLowerCase())
      throw new HttpError(409, "stale_key", { which: "recipient", current: theirKey.publicKey });

    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dmMessages)
      .where(and(eq(dmMessages.sender, from), gt(dmMessages.createdAt, new Date(Date.now() - 60_000))));
    if (Number(recent?.n ?? 0) >= DM_LIMITS.perMinute) throw new HttpError(429, "rate_limited");

    // Người nhận chưa coi mình là "main" (chưa follow, chưa chấp nhận) → đây là tin nhắn chờ (request).
    const pending = !(await isMainFor(to, from));
    const [mine] = await db
      .select()
      .from(dmThreads)
      .where(and(eq(dmThreads.owner, from), eq(dmThreads.peer, to)));
    if (pending) {
      if ((mine?.sentCount ?? 0) >= DM_LIMITS.requestMessages)
        throw new HttpError(429, "request_pending", { limit: DM_LIMITS.requestMessages });
      if (!mine) {
        const [opened] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(dmThreads)
          .where(
            and(
              eq(dmThreads.owner, from),
              eq(dmThreads.lastIncomingId, 0),
              gt(dmThreads.createdAt, new Date(Date.now() - 86_400_000)),
            ),
          );
        if (Number(opened?.n ?? 0) >= DM_LIMITS.newThreadsPerDay)
          throw new HttpError(429, "request_quota", { limit: DM_LIMITS.newThreadsPerDay });
      }
    }

    const msg = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(dmMessages)
        .values({
          pair: dmPair(from, to),
          sender: from,
          recipient: to,
          senderKey: myKey.publicKey,
          recipientKey: theirKey.publicKey,
          nonce: b.nonce,
          ciphertext: b.ciphertext,
        })
        .returning();
      if (!m) throw new Error("insert failed");
      const now = new Date();
      // Phía người gửi: nhắn = chấp nhận cuộc trò chuyện.
      await tx
        .insert(dmThreads)
        .values({
          owner: from,
          peer: to,
          state: "accepted",
          lastMessageId: m.id,
          lastReadId: m.id,
          sentCount: 1,
        })
        .onConflictDoUpdate({
          target: [dmThreads.owner, dmThreads.peer],
          set: {
            state: "accepted",
            lastMessageId: m.id,
            lastReadId: m.id,
            sentCount: sql`${dmThreads.sentCount} + 1`,
            updatedAt: now,
          },
        });
      // Phía người nhận: giữ nguyên state (open/accepted/declined).
      await tx
        .insert(dmThreads)
        .values({ owner: to, peer: from, lastMessageId: m.id, lastIncomingId: m.id })
        .onConflictDoUpdate({
          target: [dmThreads.owner, dmThreads.peer],
          set: { lastMessageId: m.id, lastIncomingId: m.id, updatedAt: now },
        });
      return m;
    });
    return c.json(view(msg), 201);
  });

  app.post("/dm/threads/:peer/read", async (c) => {
    const a = requireAuth(c);
    const peer = c.req.param("peer").toLowerCase();
    const b = await body(c, z.object({ upTo: z.number().int().positive() }));
    await db
      .update(dmThreads)
      .set({
        lastReadId: sql`greatest(${dmThreads.lastReadId}, least(${b.upTo}, ${dmThreads.lastMessageId}))`,
      })
      .where(and(eq(dmThreads.owner, a.address), eq(dmThreads.peer, peer)));
    return c.json({ ok: true });
  });

  app.post("/dm/threads/:peer/state", async (c) => {
    const a = requireAuth(c);
    const peer = c.req.param("peer").toLowerCase();
    if (!Addr.safeParse(peer).success) throw new HttpError(400, "bad_address");
    const b = await body(c, z.object({ state: z.enum(["accepted", "declined"]) }));
    const r = await db
      .update(dmThreads)
      .set({ state: b.state, updatedAt: new Date() })
      .where(and(eq(dmThreads.owner, a.address), eq(dmThreads.peer, peer)))
      .returning();
    if (!r.length) throw new HttpError(404, "not_found");
    return c.json({ ok: true, state: b.state });
  });

  return app;
}
