import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  authorLabels,
  builderStats,
  fcPosts,
  fcUsers,
  follows,
  indexerState,
  posts,
  profiles,
  savedFeeds,
  userFc,
  users,
} from "@socialonchain/db";
import {
  DEFAULT_FEEDS,
  DEFAULT_MODERATION_IDS,
  type FeedSpec,
  FeedSpecSchema,
  feedSpecJsonSchema,
  MODERATION_STACKS,
  rank,
} from "@socialonchain/feed-sdk";
import { getNetwork } from "@socialonchain/protocol";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { AppVars } from "../auth";
import { buildCandidates } from "../candidates";
import { type AppContext, lookupSpec, resolveFully } from "../context";
import {
  CandidateSchema,
  ErrorSchema,
  FeedItemSchema,
  PostViewSchema,
  type UserView,
  UserViewSchema,
} from "../schemas";
import { loadAuthors, loadPostViews } from "../views";

const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});
const notFound = json(ErrorSchema, "Not found");
const badRequest = json(ErrorSchema, "Bad request");

const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export async function resolveUser(ctx: AppContext, idOrHandle: string): Promise<string | null> {
  const v = idOrHandle.toLowerCase().replace(/^@/, "");
  if (Addr.safeParse(v).success) return v;
  const [u] = await ctx.db.select({ a: users.address }).from(users).where(eq(users.handle, v));
  return u?.a ?? null;
}

async function userView(ctx: AppContext, address: string, viewer: string | null): Promise<UserView> {
  const db = ctx.db;
  const [[u], [p], [b], [link], counts, al, rel] = await Promise.all([
    db.select().from(users).where(eq(users.address, address)),
    db.select().from(profiles).where(eq(profiles.address, address)),
    db.select().from(builderStats).where(eq(builderStats.address, address)),
    db.select().from(userFc).where(eq(userFc.address, address)),
    db.execute<{ followers: number; following: number; posts: number }>(sql`
      select
        (select count(*)::int from chain.follows where target = ${address}) as followers,
        (select count(*)::int from chain.follows where follower = ${address}) as following,
        (select count(*)::int from chain.posts where author = ${address} and not deleted) as posts`),
    db.select().from(authorLabels).where(eq(authorLabels.subject, address)),
    viewer
      ? db
          .select()
          .from(follows)
          .where(
            or(
              and(eq(follows.follower, viewer), eq(follows.target, address)),
              and(eq(follows.follower, address), eq(follows.target, viewer)),
            ),
          )
      : Promise.resolve([]),
  ]);
  let fc: { fid: number; username: string } | null = null;
  if (link) {
    const [f] = await db.select().from(fcUsers).where(eq(fcUsers.fid, link.fid));
    if (f) fc = { fid: f.fid, username: f.username };
  } else {
    const [f] = await db
      .select()
      .from(fcUsers)
      .where(sql`${fcUsers.addresses} @> ARRAY[${address}]::text[]`)
      .limit(1);
    if (f) fc = { fid: f.fid, username: f.username };
  }
  const c = counts.rows[0] ?? { followers: 0, following: 0, posts: 0 };
  const labelsOut: Record<string, number> = {};
  for (const r of al) labelsOut[r.label] = Math.max(labelsOut[r.label] ?? 0, r.score);
  return {
    address,
    handle: u?.handle ?? null,
    registered: Boolean(u),
    profileUri: u?.profileUri ?? "",
    registeredAt: u?.registeredAt ?? null,
    profile: {
      displayName: p?.displayName ?? null,
      bio: p?.bio ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      links: p?.links ?? [],
    },
    counts: { followers: Number(c.followers), following: Number(c.following), posts: Number(c.posts) },
    builder: b
      ? { contractsDeployed: b.contractsDeployed, chains: b.chains, checkedAt: b.checkedAt.toISOString() }
      : null,
    farcaster: fc,
    authorLabels: labelsOut,
    viewer: viewer
      ? {
          following: rel.some((r) => r.follower === viewer && r.target === address),
          followedBy: rel.some((r) => r.follower === address && r.target === viewer),
        }
      : null,
  };
}

const ViewerQuery = z.object({
  viewer: Addr.optional().openapi({ description: "Địa chỉ người xem (tuỳ chọn)" }),
});

export function readRoutes(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: "bad_request", message: result.error.message.slice(0, 500) }, 400);
    },
  });
  const viewerOf = (q: string | undefined, c: { get: (k: "auth") => AppVars["auth"] }) =>
    (q ?? c.get("auth")?.address ?? null)?.toLowerCase() ?? null;

  app.openapi(
    createRoute({
      method: "get",
      path: "/health",
      tags: ["ops"],
      responses: { 200: json(z.object({ ok: z.boolean() })) },
    }),
    (c) => c.json({ ok: true }, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/status",
      tags: ["ops"],
      responses: { 200: json(z.record(z.string(), z.unknown())) },
    }),
    async (c) => {
      const [state] = await ctx.db.select().from(indexerState);
      const counts = await ctx.db.execute<Record<string, number>>(sql`
        select (select count(*)::int from chain.users) as users,
               (select count(*)::int from chain.posts) as posts,
               (select count(*)::int from chain.follows) as follows,
               (select count(*)::int from app.fc_posts) as fc_posts,
               (select count(*)::int from app.labels) as labels,
               (select count(*)::int from app.reports where status = 'open') as open_reports`);
      let queues: unknown[] = [];
      try {
        const q = await ctx.db.execute(
          sql`select name, state, count(*)::int as n from pgboss.job where state in ('created','retry','active','failed') group by name, state order by name`,
        );
        queues = q.rows;
      } catch {
        queues = [];
      }
      const ws = await ctx.db.execute(sql`select key, value, updated_at from app.worker_state order by key`);
      return c.json(
        {
          network: ctx.env.NETWORK,
          chainId: ctx.env.chainId,
          contracts: ctx.deployment,
          indexer: state
            ? {
                lastBlock: state.lastBlock,
                headBlock: state.headBlock,
                lagBlocks: Math.max(0, state.headBlock - state.lastBlock),
                updatedAt: state.updatedAt.toISOString(),
                lastError: ctx.indexerError(),
              }
            : null,
          counts: counts.rows[0] ?? {},
          queues,
          worker: ws.rows,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/users/{id}",
      tags: ["users"],
      request: { params: z.object({ id: z.string() }), query: ViewerQuery },
      responses: { 200: json(UserViewSchema), 404: notFound },
    }),
    async (c) => {
      const address = await resolveUser(ctx, c.req.valid("param").id);
      if (!address) return c.json({ error: "not_found" }, 404);
      return c.json(await userView(ctx, address, viewerOf(c.req.valid("query").viewer, c)), 200);
    },
  );

  const Page = z.object({
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  });
  for (const dir of ["followers", "following"] as const) {
    app.openapi(
      createRoute({
        method: "get",
        path: `/users/{id}/${dir}`,
        tags: ["users"],
        request: { params: z.object({ id: z.string() }), query: Page },
        responses: {
          200: json(z.object({ items: z.array(z.any()), nextCursor: z.number().nullable() })),
          404: notFound,
        },
      }),
      async (c) => {
        const address = await resolveUser(ctx, c.req.valid("param").id);
        if (!address) return c.json({ error: "not_found" }, 404);
        const { cursor = 0, limit = 50 } = c.req.valid("query");
        const rows = await ctx.db
          .select()
          .from(follows)
          .where(dir === "followers" ? eq(follows.target, address) : eq(follows.follower, address))
          .orderBy(desc(follows.createdAt))
          .offset(cursor)
          .limit(limit + 1);
        const addrs = rows.slice(0, limit).map((r) => (dir === "followers" ? r.follower : r.target));
        const authors = await loadAuthors(ctx.db, addrs);
        return c.json(
          {
            items: addrs.map((a) => authors.get(a)),
            nextCursor: rows.length > limit ? cursor + limit : null,
          },
          200,
        );
      },
    );
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/users/{id}/posts",
      tags: ["users"],
      request: { params: z.object({ id: z.string() }), query: Page.merge(ViewerQuery) },
      responses: {
        200: json(z.object({ items: z.array(PostViewSchema), nextCursor: z.number().nullable() })),
        404: notFound,
      },
    }),
    async (c) => {
      const address = await resolveUser(ctx, c.req.valid("param").id);
      if (!address) return c.json({ error: "not_found" }, 404);
      const { cursor = 0, limit = 30, viewer } = c.req.valid("query");
      const rows = await ctx.db.execute<{ id: string }>(sql`
        select id from (
          select id, created_at from chain.posts where author = ${address} and not deleted
          union all
          select id, created_at from app.fc_posts where author_address = ${address}
        ) t order by created_at desc offset ${cursor} limit ${limit + 1}`);
      const ids = rows.rows.map((r) => r.id);
      const items = await loadPostViews(ctx.db, ids.slice(0, limit), viewerOf(viewer, c));
      return c.json({ items, nextCursor: ids.length > limit ? cursor + limit : null }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/posts/{id}",
      tags: ["posts"],
      request: { params: z.object({ id: z.string() }), query: ViewerQuery },
      responses: { 200: json(PostViewSchema), 404: notFound },
    }),
    async (c) => {
      const [p] = await loadPostViews(
        ctx.db,
        [c.req.valid("param").id.toLowerCase()],
        viewerOf(c.req.valid("query").viewer, c),
      );
      if (!p) return c.json({ error: "not_found" }, 404);
      return c.json(p, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/threads/{id}",
      tags: ["posts"],
      request: { params: z.object({ id: z.string() }), query: ViewerQuery },
      responses: {
        200: json(z.object({ root: PostViewSchema, replies: z.array(PostViewSchema) })),
        404: notFound,
      },
    }),
    async (c) => {
      const id = c.req.valid("param").id.toLowerCase();
      const viewer = viewerOf(c.req.valid("query").viewer, c);
      const [target] = await loadPostViews(ctx.db, [id], viewer);
      if (!target) return c.json({ error: "not_found" }, 404);
      const rootId = target.rootId;
      const [root] = rootId === id ? [target] : await loadPostViews(ctx.db, [rootId], viewer);
      const replyIds = id.startsWith("oc:")
        ? (
            await ctx.db
              .select({ id: posts.id })
              .from(posts)
              .where(and(eq(posts.rootId, rootId), sql`${posts.id} <> ${rootId}`))
              .orderBy(posts.createdAt)
              .limit(500)
          ).map((r) => r.id)
        : (
            await ctx.db
              .select({ id: fcPosts.id })
              .from(fcPosts)
              .where(eq(fcPosts.parentId, rootId))
              .orderBy(fcPosts.createdAt)
          ).map((r) => r.id);
      const replies = await loadPostViews(ctx.db, replyIds, viewer);
      return c.json({ root: root ?? target, replies }, 200);
    },
  );

  const FeedQuery = z.object({
    viewer: Addr.optional(),
    feedId: z.string().optional(),
    spec: z.string().optional().openapi({ description: "FeedSpec JSON (URL-encoded)" }),
    moderation: z
      .string()
      .optional()
      .openapi({ description: "Danh sách id moderation stack, phân tách bằng dấu phẩy" }),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  });

  async function specFromQuery(q: { feedId?: string; spec?: string }): Promise<FeedSpec | { error: string }> {
    if (q.spec) {
      try {
        const parsed = FeedSpecSchema.safeParse(JSON.parse(q.spec));
        if (!parsed.success) return { error: "invalid_spec" };
        return resolveFully(ctx, parsed.data);
      } catch {
        return { error: "invalid_spec" };
      }
    }
    const spec = await lookupSpec(ctx, q.feedId ?? "default:chronological");
    return spec ? resolveFully(ctx, spec) : { error: "feed_not_found" };
  }

  async function moderationFor(viewer: string | null, ids: string | undefined): Promise<FeedSpec[]> {
    let list = ids?.split(",").filter(Boolean);
    if (!list && viewer) {
      const r = await ctx.db.execute<{ moderation: string[] }>(
        sql`select moderation from app.user_settings where address = ${viewer}`,
      );
      list = r.rows[0]?.moderation;
    }
    const out: FeedSpec[] = [];
    for (const id of list ?? DEFAULT_MODERATION_IDS) {
      const s = await lookupSpec(ctx, id);
      if (s?.rules.every((r) => r.action !== "boost")) out.push(s);
    }
    return out;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/candidates",
      tags: ["feed"],
      description: "Candidate thô (đã gắn nhãn + tín hiệu) để chạy rank() trong trình duyệt.",
      request: {
        query: FeedQuery.pick({ viewer: true, feedId: true, spec: true }).extend({
          sources: z.string().optional(),
        }),
      },
      responses: {
        200: json(
          z.object({ candidates: z.array(CandidateSchema), posts: z.array(PostViewSchema), now: z.number() }),
        ),
        400: badRequest,
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const viewer = viewerOf(q.viewer, c);
      let sources = q.sources?.split(",").filter(Boolean);
      if (!sources) {
        const spec = await specFromQuery(q);
        if ("error" in spec) return c.json({ error: spec.error }, 400);
        sources = [...new Set([...spec.sources, ...Object.values(DEFAULT_FEEDS).flatMap((s) => s.sources)])];
      }
      const now = ctx.now();
      const candidates = await buildCandidates(ctx.db, {
        viewer,
        sources,
        now,
        windowDays: ctx.env.CANDIDATE_WINDOW_DAYS,
      });
      const postViews = await loadPostViews(
        ctx.db,
        candidates.map((x) => x.id),
        viewer,
      );
      return c.json(
        {
          candidates: candidates.map((x) => ({
            ...x,
            labels: x.labels as Record<string, number>,
            authorLabels: x.authorLabels as Record<string, number>,
            signals: x.signals as Record<string, number>,
          })),
          posts: postViews,
          now,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/feed",
      tags: ["feed"],
      request: { query: FeedQuery },
      responses: {
        200: json(
          z.object({
            items: z.array(FeedItemSchema),
            nextCursor: z.number().nullable(),
            hidden: z.number(),
            total: z.number(),
            spec: z.object({
              name: z.string(),
              explain: z.object({ en: z.array(z.string()), vi: z.array(z.string()) }).optional(),
            }),
          }),
        ),
        400: badRequest,
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const viewer = viewerOf(q.viewer, c);
      const spec = await specFromQuery(q);
      if ("error" in spec) return c.json({ error: spec.error }, 400);
      const now = ctx.now();
      const candidates = await buildCandidates(ctx.db, {
        viewer,
        sources: spec.sources,
        now,
        windowDays: ctx.env.CANDIDATE_WINDOW_DAYS,
      });
      const moderation = await moderationFor(viewer, q.moderation);
      const ranked = rank(spec, candidates, { now, moderation });
      const cursor = q.cursor ?? 0;
      const limit = q.limit ?? 30;
      const page = ranked.items.slice(cursor, cursor + limit);
      const views = await loadPostViews(
        ctx.db,
        page.map((i) => i.id),
        viewer,
      );
      const byId = new Map(views.map((v) => [v.id, v]));
      return c.json(
        {
          items: page
            .filter((i) => byId.has(i.id))
            .map((i) => ({
              post: byId.get(i.id) as z.infer<typeof PostViewSchema>,
              score: i.score,
              reasons: i.reasons,
            })),
          nextCursor: cursor + limit < ranked.items.length ? cursor + limit : null,
          hidden: ranked.hidden,
          total: ranked.items.length,
          spec: { name: spec.name, ...(spec.explain ? { explain: spec.explain } : {}) },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/feeds",
      tags: ["feed"],
      request: { query: ViewerQuery },
      responses: { 200: json(z.record(z.string(), z.unknown())) },
    }),
    async (c) => {
      const viewer = viewerOf(c.req.valid("query").viewer, c);
      const publicFeeds = await ctx.db
        .select()
        .from(savedFeeds)
        .where(eq(savedFeeds.isPublic, true))
        .orderBy(desc(savedFeeds.updatedAt))
        .limit(50);
      const mine = viewer
        ? await ctx.db
            .select()
            .from(savedFeeds)
            .where(eq(savedFeeds.owner, viewer))
            .orderBy(desc(savedFeeds.updatedAt))
        : [];
      return c.json(
        {
          defaults: Object.entries(DEFAULT_FEEDS).map(([id, spec]) => ({ id, spec })),
          moderation: Object.entries(MODERATION_STACKS).map(([id, spec]) => ({ id, spec })),
          public: publicFeeds,
          mine,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/feeds/{id}",
      tags: ["feed"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: json(z.object({ id: z.string(), spec: z.record(z.string(), z.unknown()) })),
        404: notFound,
      },
    }),
    async (c) => {
      const id = c.req.valid("param").id;
      const spec = await lookupSpec(ctx, id);
      if (!spec) return c.json({ error: "not_found" }, 404);
      return c.json({ id, spec: spec as unknown as Record<string, unknown> }, 200);
    },
  );

  app.get("/feedspec.schema.json", (c) => c.json(feedSpecJsonSchema()));

  app.openapi(
    createRoute({
      method: "get",
      path: "/search",
      tags: ["search"],
      request: { query: ViewerQuery.extend({ q: z.string().min(1).max(100) }) },
      responses: {
        200: json(z.object({ users: z.array(z.any()), posts: z.array(PostViewSchema) })),
      },
    }),
    async (c) => {
      const { q, viewer } = c.req.valid("query");
      const term = `%${q.trim().replace(/[%_\\]/g, "")}%`;
      const userRows = await ctx.db.execute<{ address: string }>(sql`
        select address from chain.users where handle ilike ${term} or address = ${q.toLowerCase()}
        union
        select address from app.profiles where app.f_unaccent(coalesce(display_name,'')) like app.f_unaccent(${term})
        limit 20`);
      const fcRows = await ctx.db
        .select()
        .from(fcUsers)
        .where(
          sql`${fcUsers.username} ilike ${term} or app.f_unaccent(coalesce(${fcUsers.displayName},'')) like app.f_unaccent(${term})`,
        )
        .limit(10);
      const postRows = await ctx.db.execute<{ id: string }>(sql`
        select id from (
          select id, created_at from chain.posts where not deleted and app.f_unaccent(text) like app.f_unaccent(${term})
          union all
          select id, created_at from app.fc_posts where app.f_unaccent(text) like app.f_unaccent(${term})
        ) t order by created_at desc limit 30`);
      const authors = await loadAuthors(
        ctx.db,
        userRows.rows.map((r) => r.address),
        fcRows.map((r) => r.fid),
      );
      const usersOut = [
        ...userRows.rows.map((r) => authors.get(r.address)),
        ...fcRows.map((r) => authors.get(`fid:${r.fid}`)),
      ].filter(Boolean);
      const postsOut = await loadPostViews(
        ctx.db,
        postRows.rows.map((r) => r.id),
        viewerOf(viewer, c),
      );
      return c.json({ users: usersOut, posts: postsOut }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/profiles/{address}",
      tags: ["users"],
      description: "Profile offchain. profileURI onchain trỏ về đây (không đưa PII lên chain).",
      request: { params: z.object({ address: Addr }) },
      responses: { 200: json(z.record(z.string(), z.unknown())), 404: notFound },
    }),
    async (c) => {
      const address = c.req.valid("param").address.toLowerCase();
      const [p] = await ctx.db.select().from(profiles).where(eq(profiles.address, address));
      if (!p) return c.json({ error: "not_found" }, 404);
      return c.json({ name: p.displayName, bio: p.bio, avatar: p.avatarUrl, links: p.links }, 200);
    },
  );

  app.get("/channels", async (c) => {
    const r = await ctx.db.execute<{ channel: string; n: number }>(
      sql`select channel, count(*)::int as n from app.fc_posts where channel is not null group by channel order by n desc limit 30`,
    );
    return c.json({ farcaster: r.rows });
  });

  app.get("/network", (c) => {
    const n = getNetwork(ctx.env.NETWORK);
    return c.json({
      network: n.name,
      chainId: n.chain.id,
      explorer: n.explorerUrl,
      contracts: ctx.deployment,
    });
  });

  // Luồng nhãn có chữ ký, công khai: client/indexer khác tự verify bằng `verifyLabelBatch` (packages/protocol).
  const SignedBatchSchema = z
    .object({
      digest: z.string(),
      labeler: z.string(),
      issuedAt: z.number(),
      signature: z.string(),
      batch: z.unknown(),
    })
    .openapi("SignedLabelBatch");
  app.openapi(
    createRoute({
      method: "get",
      path: "/labels",
      tags: ["labels"],
      description:
        "Batch nhãn đã ký, theo (`issuedAt`, `digest`) tăng dần. Lần đầu dùng `since`; trang sau truyền `next` vào `cursor`.",
      request: {
        query: z.object({
          since: z.coerce
            .number()
            .int()
            .min(0)
            .default(0)
            .openapi({ description: "issuedAt (unix giây), loại trừ" }),
          cursor: z
            .string()
            .regex(/^\d+:0x[0-9a-f]{64}$/)
            .optional()
            .openapi({ description: "`next` của trang trước" }),
          labeler: z
            .string()
            .regex(/^0x[0-9a-fA-F]{40}$/)
            .optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
      responses: {
        200: json(z.object({ items: z.array(SignedBatchSchema), next: z.string().nullable() })),
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const [at, dg] = q.cursor?.split(":") ?? [];
      const cursor = at && dg ? { issuedAt: Number(at), digest: dg } : null;
      const r = await ctx.db.execute<{
        digest: string;
        labeler: string;
        issued_at: string | number;
        signature: string;
        payload: unknown;
      }>(sql`
        select digest, labeler, issued_at, signature, payload from app.label_batches
        where payload is not null
          and ${
            cursor
              ? sql`(issued_at, digest) > (${cursor.issuedAt}, ${cursor.digest})`
              : sql`issued_at > ${q.since}`
          }
          ${q.labeler ? sql`and labeler = ${q.labeler.toLowerCase()}` : sql``}
        order by issued_at asc, digest asc
        limit ${q.limit}`);
      const items = r.rows.map((b) => ({
        digest: b.digest,
        labeler: b.labeler,
        issuedAt: Number(b.issued_at),
        signature: b.signature,
        batch: b.payload,
      }));
      const last = items.at(-1);
      return c.json(
        { items, next: items.length === q.limit && last ? `${last.issuedAt}:${last.digest}` : null },
        200,
      );
    },
  );

  // Dùng trong UI: các tác giả bị gán nhãn nhiều (debug) — giữ nội bộ.
  app.get("/labels/{id}", async (c) => {
    const id = c.req.param("id");
    const r = await ctx.db.execute(
      sql`select label, score, labeler, batch from app.labels where post_id = ${id}`,
    );
    return c.json({ id, labels: r.rows });
  });

  return app;
}
