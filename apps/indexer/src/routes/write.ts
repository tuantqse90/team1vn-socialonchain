import { createHash, randomUUID } from "node:crypto";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  authorLabels,
  blocklist,
  compileCache,
  events,
  fcUsers,
  follows,
  labelBatches,
  labels,
  notifications,
  pendingFollows,
  profiles,
  reports,
  savedFeeds,
  userFc,
  userSettings,
} from "@socialonchain/db";
import { compileFeed, type FeedSpec, FeedSpecSchema } from "@socialonchain/feed-sdk";
import {
  batchDigest,
  identityRegistryAbi,
  type LabelBatch,
  verifyLabelBatch,
  verifySessionAuth,
} from "@socialonchain/protocol";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Context } from "hono";
import type { Address, Hex } from "viem";
import { type AppVars, issueJwt } from "../auth";
import type { AppContext } from "../context";
import { getEntitlements, incrementUsage } from "../entitlements";
import { ErrorSchema } from "../schemas";
import { loadAuthors, loadPostViews } from "../views";

type C = Context<{ Variables: AppVars }>;
const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Hex32 = z.string().regex(/^0x[0-9a-fA-F]+$/);

export function requireAuth(c: C) {
  const a = c.get("auth");
  if (!a) throw new HttpError(401, "unauthorized");
  return a;
}

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function body<T extends z.ZodType>(c: C, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "bad_request", { message: r.error.message.slice(0, 500) });
  return r.data;
}

const EVENT_NAMES = new Set([
  "app_open",
  "onboarding_step",
  "feed_view",
  "feed_switch",
  "why_open",
  "post_created",
  "feed_saved",
  "feed_compiled",
  "quota_hit",
  "import_started",
  "pro_purchased",
  "moderation_changed",
]);

export function writeRoutes(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>();
  const db = ctx.db;
  const isAdmin = (a: string) => ctx.env.ADMIN_ADDRESSES.includes(a);
  const subjectHash = (a: string) =>
    createHash("sha256").update(`${ctx.env.ANALYTICS_SALT}:${a}`).digest("hex").slice(0, 32);

  // ---------- Đăng nhập bằng session key ----------
  const SessionBody = z.object({
    owner: Addr,
    key: Addr,
    chainId: z.number().int(),
    issuedAt: z.number().int(),
    signature: Hex32,
  });
  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/session",
      tags: ["auth"],
      description:
        "Session key ký message (sessionAuthMessage) → server kiểm isAuthorized(owner, key) onchain → trả JWT.",
      request: { body: { content: { "application/json": { schema: SessionBody } } } },
      responses: {
        200: {
          description: "JWT",
          content: {
            "application/json": {
              schema: z.object({ token: z.string(), expiresAt: z.number(), address: z.string() }),
            },
          },
        },
        401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
      },
    }),
    async (c) => {
      const b = c.req.valid("json");
      const now = ctx.now();
      if (b.chainId !== ctx.env.chainId) return c.json({ error: "wrong_chain" }, 401);
      const v = await verifySessionAuth(
        { owner: b.owner as Address, key: b.key as Address, chainId: b.chainId, issuedAt: b.issuedAt },
        b.signature as Hex,
        now,
      );
      if (!v.ok) return c.json({ error: v.reason }, 401);
      const owner = b.owner.toLowerCase();
      const key = b.key.toLowerCase();
      let expiresAt = now + 7 * 86400;
      if (owner !== key) {
        const authorized = await ctx.client.readContract({
          address: ctx.deployment.IdentityRegistry,
          abi: identityRegistryAbi,
          functionName: "isAuthorized",
          args: [b.owner as Address, b.key as Address],
        });
        if (!authorized) return c.json({ error: "key_not_authorized" }, 401);
        const exp = await ctx.client.readContract({
          address: ctx.deployment.IdentityRegistry,
          abi: identityRegistryAbi,
          functionName: "delegateExpiry",
          args: [b.owner as Address, b.key as Address],
        });
        expiresAt = Math.min(expiresAt, Number(exp));
      }
      const token = await issueJwt(ctx.env.JWT_SECRET, { address: owner, key }, expiresAt);
      return c.json({ token, expiresAt, address: owner }, 200);
    },
  );

  // ---------- Me ----------
  app.get("/me", async (c) => {
    const a = requireAuth(c);
    const [s] = await db.select().from(userSettings).where(eq(userSettings.address, a.address));
    const [p] = await db.select().from(profiles).where(eq(profiles.address, a.address));
    const [link] = await db.select().from(userFc).where(eq(userFc.address, a.address));
    return c.json({
      address: a.address,
      key: a.key,
      admin: isAdmin(a.address),
      settings: s ?? null,
      profile: p ?? null,
      farcaster: link ? { fid: link.fid } : null,
      entitlements: await getEntitlements(db, ctx.env, a.address, ctx.now()),
    });
  });

  app.get("/me/entitlements", async (c) => {
    const a = requireAuth(c);
    return c.json(await getEntitlements(db, ctx.env, a.address, ctx.now()));
  });

  const SettingsBody = z.object({
    feeds: z.array(z.string().max(80)).max(20).optional(),
    moderation: z.array(z.string().max(80)).max(10).optional(),
    mutedAuthors: z.array(z.string().max(60)).max(500).optional(),
    locale: z.enum(["en", "vi"]).optional(),
    analyticsOptOut: z.boolean().optional(),
  });
  app.put("/me/settings", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, SettingsBody);
    const patch = { ...b, mutedAuthors: b.mutedAuthors?.map((m) => m.toLowerCase()), updatedAt: new Date() };
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const [row] = await db
      .insert(userSettings)
      .values({ address: a.address, ...clean })
      .onConflictDoUpdate({ target: userSettings.address, set: clean })
      .returning();
    if (b.moderation) await track(a.address, "moderation_changed", { moderation: b.moderation });
    return c.json(row);
  });

  const ProfileBody = z.object({
    displayName: z.string().trim().max(50).nullable().optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    avatarUrl: z.string().url().max(500).nullable().optional(),
    links: z.array(z.string().url().max(200)).max(5).optional(),
  });
  app.put("/me/profile", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, ProfileBody);
    const values = { ...b, updatedAt: new Date() };
    const [row] = await db
      .insert(profiles)
      .values({ address: a.address, ...values })
      .onConflictDoUpdate({ target: profiles.address, set: values })
      .returning();
    return c.json({ profile: row, profileUri: `${ctx.env.PUBLIC_API_URL}/profiles/${a.address}` });
  });

  // ---------- Notifications ----------
  app.get("/notifications", async (c) => {
    const a = requireAuth(c);
    const before = Number(c.req.query("before") ?? 0);
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipient, a.address), before ? lt(notifications.id, before) : undefined))
      .orderBy(desc(notifications.id))
      .limit(50);
    const actors = await loadAuthors(
      db,
      rows.map((r) => r.actor),
    );
    const postsById = new Map(
      (
        await loadPostViews(
          db,
          [...new Set(rows.map((r) => r.postId).filter((x): x is string => Boolean(x)))],
          a.address,
        )
      ).map((p) => [p.id, p]),
    );
    const [unread] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipient, a.address), isNull(notifications.readAt)));
    return c.json({
      unread: Number(unread?.n ?? 0),
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        actor: actors.get(r.actor),
        post: r.postId ? (postsById.get(r.postId) ?? null) : null,
        createdAt: r.createdAt,
        read: Boolean(r.readAt),
      })),
      nextBefore: rows.length === 50 ? rows[rows.length - 1]?.id : null,
    });
  });

  app.post("/notifications/read", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, z.object({ ids: z.array(z.number().int()).max(200).optional() }));
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipient, a.address),
          isNull(notifications.readAt),
          b.ids ? inArray(notifications.id, b.ids) : undefined,
        ),
      );
    return c.json({ ok: true });
  });

  // ---------- Feeds (lưu, sửa, xoá, biên dịch bằng lời) ----------
  const SaveFeedBody = z.object({
    name: z.string().trim().min(1).max(60),
    spec: FeedSpecSchema,
    nlText: z.string().max(2000).optional(),
    isPublic: z.boolean().optional(),
    forkedFrom: z.string().max(80).optional(),
  });
  app.post("/feeds", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, SaveFeedBody);
    const ent = await getEntitlements(db, ctx.env, a.address, ctx.now());
    if (ent.usage.feeds >= ent.limits.maxFeeds) {
      await track(a.address, "quota_hit", { kind: "feeds" });
      throw new HttpError(429, "quota_exceeded", { quota: "feeds", entitlements: ent });
    }
    const id = `u:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const [row] = await db
      .insert(savedFeeds)
      .values({
        id,
        owner: a.address,
        name: b.name,
        spec: { ...b.spec, name: b.name },
        nlText: b.nlText ?? null,
        isPublic: b.isPublic ?? true,
        forkedFrom: b.forkedFrom ?? null,
      })
      .returning();
    await track(a.address, "feed_saved", { forked: Boolean(b.forkedFrom), rules: b.spec.rules.length });
    return c.json(row, 201);
  });

  app.put("/feeds/:id", async (c) => {
    const a = requireAuth(c);
    const id = c.req.param("id");
    const b = await body(c, SaveFeedBody.partial());
    const [existing] = await db.select().from(savedFeeds).where(eq(savedFeeds.id, id));
    if (!existing) throw new HttpError(404, "not_found");
    if (existing.owner !== a.address) throw new HttpError(403, "forbidden");
    const name = b.name ?? existing.name;
    const [row] = await db
      .update(savedFeeds)
      .set({
        name,
        ...(b.spec ? { spec: { ...b.spec, name } } : {}),
        ...(b.nlText !== undefined ? { nlText: b.nlText } : {}),
        ...(b.isPublic !== undefined ? { isPublic: b.isPublic } : {}),
        updatedAt: new Date(),
      })
      .where(eq(savedFeeds.id, id))
      .returning();
    return c.json(row);
  });

  app.delete("/feeds/:id", async (c) => {
    const a = requireAuth(c);
    const id = c.req.param("id");
    const r = await db
      .delete(savedFeeds)
      .where(and(eq(savedFeeds.id, id), eq(savedFeeds.owner, a.address)))
      .returning({ id: savedFeeds.id });
    if (!r.length) throw new HttpError(404, "not_found");
    return c.json({ ok: true });
  });

  const CompileBody = z.object({
    text: z.string().trim().min(2).max(1000),
    current: FeedSpecSchema.optional(),
  });
  app.post("/feeds/compile", async (c) => {
    const a = requireAuth(c);
    const b = await body(c, CompileBody);
    const now = ctx.now();
    const hash = createHash("sha256")
      .update(JSON.stringify({ t: b.text.toLowerCase(), c: b.current ?? null, e: ctx.llm ? "llm" : "h" }))
      .digest("hex");
    const [cached] = await db.select().from(compileCache).where(eq(compileCache.hash, hash));
    const ent = await getEntitlements(db, ctx.env, a.address, now);
    if (cached) return c.json({ ...(cached.result as object), cached: true, entitlements: ent });
    if (ent.usage.compilesToday >= ent.limits.compilesPerDay) {
      await track(a.address, "quota_hit", { kind: "compile" });
      throw new HttpError(429, "quota_exceeded", { quota: "compile", entitlements: ent });
    }
    const result = await compileFeed(b.text, { current: b.current as FeedSpec | undefined, llm: ctx.llm });
    await db.insert(compileCache).values({ hash, result }).onConflictDoNothing();
    await incrementUsage(db, a.address, "compile", now);
    await track(a.address, "feed_compiled", {
      engine: result.engine,
      unsupported: result.unsupported.length,
    });
    const after = await getEntitlements(db, ctx.env, a.address, now);
    return c.json({ ...result, cached: false, entitlements: after });
  });

  // ---------- Báo cáo ----------
  app.post("/reports", async (c) => {
    const a = requireAuth(c);
    const b = await body(
      c,
      z.object({
        postId: z.string().regex(/^(oc|fc):0x[0-9a-f]+$/),
        reason: z.enum(["illegal", "spam", "harassment", "doxxing", "nsfw", "other"]),
        note: z.string().max(500).optional(),
      }),
    );
    const [row] = await db
      .insert(reports)
      .values({ reporter: a.address, postId: b.postId, reason: b.reason, note: b.note ?? null })
      .returning();
    return c.json(row, 201);
  });

  // ---------- Import Farcaster ----------
  app.get("/import/farcaster/preview", async (c) => {
    const a = requireAuth(c);
    const fidQ = c.req.query("fid");
    const username = c.req.query("username");
    const user = fidQ
      ? await ctx.farcaster.userByFid(Number(fidQ))
      : username
        ? await ctx.farcaster.userByUsername(username)
        : null;
    if (!user) throw new HttpError(404, "farcaster_user_not_found");
    const list = await ctx.farcaster.following(user.fid, 1000);
    const withAddr = list.filter((u) => u.addresses.length > 0);
    const pending = list.filter((u) => u.addresses.length === 0);
    const targets = [...new Set(withAddr.map((u) => u.addresses[0] as string))].filter(
      (t) => t !== a.address,
    );
    const already = targets.length
      ? new Set(
          (
            await db
              .select({ t: follows.target })
              .from(follows)
              .where(and(eq(follows.follower, a.address), inArray(follows.target, targets)))
          ).map((r) => r.t),
        )
      : new Set<string>();
    const toFollow = withAddr
      .filter((u) => !already.has(u.addresses[0] as string) && u.addresses[0] !== a.address)
      .map((u) => ({ fid: u.fid, username: u.username, address: u.addresses[0] as string }));
    // Liên kết viewer ↔ FID để bật source farcaster:following (dữ liệu công khai).
    await db
      .insert(userFc)
      .values({ address: a.address, fid: user.fid })
      .onConflictDoUpdate({ target: userFc.address, set: { fid: user.fid, linkedAt: new Date() } });
    await db
      .insert(fcUsers)
      .values({
        fid: user.fid,
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
        bio: user.bio,
        addresses: user.addresses,
        followerCount: user.followerCount,
      })
      .onConflictDoNothing();
    const batches = Math.ceil(toFollow.length / 50);
    await track(a.address, "import_started", { toFollow: toFollow.length, pending: pending.length });
    return c.json({
      farcaster: { fid: user.fid, username: user.username, verified: user.addresses.includes(a.address) },
      toFollow,
      pending: pending.map((u) => ({ fid: u.fid, username: u.username })),
      alreadyFollowing: already.size,
      estimate: {
        txs: batches,
        // ~25k gas/follow + 21k/tx (docs/COSTS.md)
        gas: toFollow.length * 25_000 + batches * 30_000,
        batchSize: 50,
      },
      mode: ctx.farcaster.mode,
    });
  });

  app.post("/import/farcaster/pending", async (c) => {
    const a = requireAuth(c);
    const b = await body(
      c,
      z.object({
        targets: z.array(z.object({ fid: z.number().int(), username: z.string().max(40) })).max(2000),
      }),
    );
    if (b.targets.length) {
      await db
        .insert(pendingFollows)
        .values(b.targets.map((t) => ({ owner: a.address, targetFid: t.fid, username: t.username })))
        .onConflictDoNothing();
    }
    return c.json({ saved: b.targets.length });
  });

  // ---------- Đo lường (ẩn danh) ----------
  async function track(address: string | null, name: string, props: Record<string, unknown> = {}) {
    if (address) {
      const [s] = await db
        .select({ o: userSettings.analyticsOptOut })
        .from(userSettings)
        .where(eq(userSettings.address, address));
      if (s?.o) return;
    }
    await db.insert(events).values({ name, subject: address ? subjectHash(address) : null, props });
  }

  app.post("/events", async (c) => {
    const b = await body(
      c,
      z.object({ name: z.string().max(40), props: z.record(z.string(), z.unknown()).optional() }),
    );
    if (!EVENT_NAMES.has(b.name)) throw new HttpError(400, "unknown_event");
    const props = JSON.stringify(b.props ?? {}).length > 2000 ? {} : (b.props ?? {});
    await track(c.get("auth")?.address ?? null, b.name, props);
    return c.json({ ok: true });
  });

  // ---------- Nhãn có chữ ký (labeler → indexer) ----------
  const LabelBatchBody = z.object({
    batch: z.object({
      v: z.literal(1),
      labeler: Addr,
      issuedAt: z.number().int(),
      items: z
        .array(
          z.object({
            subject: z.string().max(80),
            label: z.string().max(40),
            score: z.number().min(0).max(1),
          }),
        )
        .max(2000),
    }),
    signature: Hex32,
  });
  app.post("/labels", async (c) => {
    const b = await body(c, LabelBatchBody);
    const labeler = b.batch.labeler.toLowerCase();
    if (!ctx.env.labelers.has(labeler)) throw new HttpError(403, "untrusted_labeler");
    const ok = await verifyLabelBatch(b.batch as LabelBatch, b.signature as Hex);
    if (!ok) throw new HttpError(401, "bad_signature");
    const digest = batchDigest(b.batch as LabelBatch);
    await db.transaction(async (tx) => {
      await tx
        .insert(labelBatches)
        .values({
          digest,
          labeler,
          issuedAt: b.batch.issuedAt,
          signature: b.signature,
          items: b.batch.items.length,
          payload: b.batch,
        })
        .onConflictDoNothing();
      const postItems = b.batch.items.filter((i) => !i.subject.startsWith("author:"));
      const authorItems = b.batch.items.filter((i) => i.subject.startsWith("author:"));
      if (postItems.length) {
        await tx
          .insert(labels)
          .values(
            postItems.map((i) => ({
              postId: i.subject,
              label: i.label,
              score: i.score,
              labeler,
              batch: digest,
            })),
          )
          .onConflictDoUpdate({
            target: [labels.postId, labels.label, labels.labeler],
            set: { score: sql`excluded.score`, batch: sql`excluded.batch` },
          });
      }
      if (authorItems.length) {
        await tx
          .insert(authorLabels)
          .values(
            authorItems.map((i) => ({
              subject: i.subject.slice(7).toLowerCase(),
              label: i.label,
              score: i.score,
              labeler,
              batch: digest,
            })),
          )
          .onConflictDoUpdate({
            target: [authorLabels.subject, authorLabels.label, authorLabels.labeler],
            set: { score: sql`excluded.score`, batch: sql`excluded.batch` },
          });
      }
    });
    return c.json({ accepted: b.batch.items.length, digest });
  });

  // ---------- Admin (người vận hành client) ----------
  function requireAdmin(c: C) {
    const a = requireAuth(c);
    if (!isAdmin(a.address)) throw new HttpError(403, "forbidden");
    return a;
  }

  app.get("/admin/reports", async (c) => {
    requireAdmin(c);
    const status = c.req.query("status") ?? "open";
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.status, status))
      .orderBy(desc(reports.createdAt))
      .limit(100);
    const postsById = new Map(
      (await loadPostViews(db, [...new Set(rows.map((r) => r.postId))], null)).map((p) => [p.id, p]),
    );
    return c.json({ items: rows.map((r) => ({ ...r, post: postsById.get(r.postId) ?? null })) });
  });

  app.post("/admin/reports/:id", async (c) => {
    const a = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const b = await body(c, z.object({ action: z.enum(["hide_post", "block_author", "dismiss"]) }));
    const [r] = await db.select().from(reports).where(eq(reports.id, id));
    if (!r) throw new HttpError(404, "not_found");
    if (b.action !== "dismiss") {
      let subject = r.postId;
      if (b.action === "block_author") {
        const [p] = await loadPostViews(db, [r.postId], null);
        subject = p?.author.address ?? (p?.author.fid ? `fid:${p.author.fid}` : r.postId);
      }
      await db
        .insert(blocklist)
        .values({
          subject,
          kind: b.action === "hide_post" ? "post" : "author",
          reason: `report #${id}: ${r.reason}`,
          createdBy: a.address,
        })
        .onConflictDoNothing();
    }
    await db
      .update(reports)
      .set({
        status: b.action === "dismiss" ? "dismissed" : "actioned",
        resolvedBy: a.address,
        resolvedAt: new Date(),
      })
      .where(eq(reports.postId, r.postId));
    return c.json({ ok: true });
  });

  app.get("/admin/blocklist", async (c) => {
    requireAdmin(c);
    return c.json({ items: await db.select().from(blocklist).orderBy(desc(blocklist.createdAt)) });
  });

  app.post("/admin/blocklist", async (c) => {
    const a = requireAdmin(c);
    const b = await body(
      c,
      z.object({
        subject: z.string().max(80),
        kind: z.enum(["post", "author"]),
        reason: z.string().max(200),
      }),
    );
    await db
      .insert(blocklist)
      .values({ subject: b.subject.toLowerCase(), kind: b.kind, reason: b.reason, createdBy: a.address })
      .onConflictDoNothing();
    return c.json({ ok: true }, 201);
  });

  app.delete("/admin/blocklist/:subject", async (c) => {
    requireAdmin(c);
    await db.delete(blocklist).where(eq(blocklist.subject, c.req.param("subject").toLowerCase()));
    return c.json({ ok: true });
  });

  app.get("/admin/metrics", async (c) => {
    requireAdmin(c);
    const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) =>
      (await db.execute<T>(s)).rows;
    const [active] = await q<{ dau: number; wau: number; mau: number }>(sql`
      select
        count(distinct subject) filter (where created_at > now() - interval '1 day')::int as dau,
        count(distinct subject) filter (where created_at > now() - interval '7 days')::int as wau,
        count(distinct subject) filter (where created_at > now() - interval '30 days')::int as mau
      from app.events where subject is not null`);
    const retention = await q<{ cohort: string; users: number; d1: number; d7: number }>(sql`
      with first as (
        select subject, min(created_at)::date as d0 from app.events where subject is not null group by subject
      ), days as (
        select distinct subject, created_at::date as d from app.events where subject is not null
      )
      select to_char(f.d0, 'YYYY-MM-DD') as cohort, count(*)::int as users,
        count(*) filter (where exists (select 1 from days x where x.subject = f.subject and x.d = f.d0 + 1))::int as d1,
        count(*) filter (where exists (select 1 from days x where x.subject = f.subject and x.d between f.d0 + 7 and f.d0 + 13)))::int as d7
      from first f group by f.d0 order by f.d0 desc limit 30`);
    const [feeds] = await q<{ creators: number; users: number }>(sql`
      select (select count(distinct owner)::int from app.saved_feeds) as creators,
             (select count(*)::int from chain.users) as users`);
    const compiles = await q<{ day: string; n: number }>(sql`
      select to_char(created_at::date, 'YYYY-MM-DD') as day, count(*)::int as n from app.events
      where name = 'feed_compiled' group by created_at::date order by created_at::date desc limit 30`);
    const distribution = await q<{ feed: string; n: number }>(sql`
      select coalesce(props->>'feedId', 'unknown') as feed, count(*)::int as n from app.events
      where name = 'feed_view' and created_at > now() - interval '7 days' group by 1 order by n desc limit 20`);
    const quota = await q<{ kind: string; users: number }>(sql`
      select props->>'kind' as kind, count(distinct subject)::int as users from app.events
      where name = 'quota_hit' and created_at > now() - interval '30 days' group by 1`);
    const [pro] = await q<{ pro: number }>(sql`
      select count(distinct "user")::int as pro from chain.payments where paid_until > extract(epoch from now())`);
    return c.json({
      active,
      retention,
      feedCreatorsPct: feeds && feeds.users > 0 ? Math.round((feeds.creators / feeds.users) * 1000) / 10 : 0,
      compiles,
      distribution,
      quotaHits: quota,
      proUsers: pro?.pro ?? 0,
    });
  });

  return app;
}
