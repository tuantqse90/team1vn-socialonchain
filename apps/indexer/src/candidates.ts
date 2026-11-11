import {
  authorLabels,
  blocklist,
  builderStats,
  type Db,
  fcPosts,
  follows,
  posts,
  reactions,
  userFc,
  userSettings,
} from "@socialonchain/db";
import type { Candidate } from "@socialonchain/feed-sdk";
import { channelHash } from "@socialonchain/protocol";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { loadLabels } from "./views";

export type CandidateOptions = {
  viewer: string | null;
  sources: string[];
  now: number;
  windowDays: number;
  /** Số bài tối đa mỗi nguồn. */
  perSource?: number;
  /** Tổng số candidate tối đa (mới nhất). */
  max?: number;
};

type Hit = { id: string; createdAt: number };

/**
 * Gom candidate cho rank(): chạy từng source, gộp origins, rồi gắn nhãn + tín hiệu.
 * Áp danh sách chặn của người vận hành và mute của viewer. Bài đã xoá (tombstone) bị loại.
 */
export async function buildCandidates(db: Db, opts: CandidateOptions): Promise<Candidate[]> {
  const per = opts.perSource ?? 300;
  const max = opts.max ?? 500;
  const since = opts.now - opts.windowDays * 86400;
  const viewer = opts.viewer;
  const origins = new Map<string, Set<string>>();
  const created = new Map<string, number>();
  const add = (source: string, hits: Hit[]) => {
    for (const h of hits) {
      const s = origins.get(h.id) ?? new Set<string>();
      s.add(source);
      origins.set(h.id, s);
      created.set(h.id, h.createdAt);
    }
  };

  const following = viewer
    ? (await db.select({ t: follows.target }).from(follows).where(eq(follows.follower, viewer))).map(
        (r) => r.t,
      )
    : [];
  const viewerFid = viewer
    ? ((await db.select({ fid: userFc.fid }).from(userFc).where(eq(userFc.address, viewer)))[0]?.fid ?? null)
    : null;

  const oc = (where: ReturnType<typeof and>) =>
    db
      .select({ id: posts.id, createdAt: posts.createdAt })
      .from(posts)
      .where(and(eq(posts.deleted, false), gte(posts.createdAt, since), where))
      .orderBy(desc(posts.createdAt))
      .limit(per);
  const fc = (where: ReturnType<typeof and>) =>
    db
      .select({ id: fcPosts.id, createdAt: fcPosts.createdAt })
      .from(fcPosts)
      .where(and(gte(fcPosts.createdAt, since), where))
      .orderBy(desc(fcPosts.createdAt))
      .limit(per);

  let twoHop: string[] = [];
  for (const source of [...new Set(opts.sources)]) {
    if (source === "all") add(source, await oc(undefined));
    else if (source === "self" && viewer) add(source, await oc(eq(posts.author, viewer)));
    else if (source === "following" && following.length)
      add(source, await oc(inArray(posts.author, following)));
    else if (source === "replies_in_my_threads" && viewer) {
      add(
        source,
        await oc(
          and(
            ne(posts.author, viewer),
            sql`${posts.rootId} in (select id from chain.posts where author = ${viewer})`,
            sql`${posts.parentId} is not null`,
          ),
        ),
      );
    } else if (source === "two_hop" && following.length) {
      twoHop = (
        await db
          .selectDistinct({ t: follows.target })
          .from(follows)
          .where(
            and(
              inArray(follows.follower, following),
              notInArray(follows.target, [...following, viewer ?? ""]),
            ),
          )
          .limit(500)
      ).map((r) => r.t);
      if (twoHop.length) add(source, await oc(inArray(posts.author, twoHop)));
    } else if (source.startsWith("channel:")) {
      add(source, await oc(eq(posts.channel, channelHash(source.slice(8)).toLowerCase())));
    } else if (source === "farcaster:following") {
      const parts = [];
      if (viewerFid) {
        parts.push(
          await fc(sql`${fcPosts.fid} in (select target_fid from app.fc_links where fid = ${viewerFid})`),
        );
      }
      // Tác giả Farcaster mà viewer follow onchain (qua verified address)
      if (following.length) parts.push(await fc(inArray(fcPosts.authorAddress, following)));
      for (const p of parts) add(source, p);
    } else if (source.startsWith("farcaster:channel:")) {
      add(source, await fc(eq(fcPosts.channel, source.slice(18))));
    }
  }

  // Cắt còn `max` bài mới nhất.
  let ids = [...origins.keys()].sort((a, b) => (created.get(b) ?? 0) - (created.get(a) ?? 0)).slice(0, max);
  if (!ids.length) return [];

  // Chặn của người vận hành + mute của viewer
  const blocked = await db.select().from(blocklist);
  const blockedPosts = new Set(blocked.filter((b) => b.kind === "post").map((b) => b.subject));
  const blockedAuthors = new Set(blocked.filter((b) => b.kind === "author").map((b) => b.subject));
  if (viewer) {
    const [s] = await db
      .select({ m: userSettings.mutedAuthors })
      .from(userSettings)
      .where(eq(userSettings.address, viewer));
    for (const m of s?.m ?? []) blockedAuthors.add(m);
  }
  ids = ids.filter((i) => !blockedPosts.has(i));

  const ocIds = ids.filter((i) => i.startsWith("oc:"));
  const fcIds = ids.filter((i) => i.startsWith("fc:"));
  const [ocRows, fcRows, labelMap] = await Promise.all([
    ocIds.length
      ? db
          .select({ id: posts.id, author: posts.author, createdAt: posts.createdAt })
          .from(posts)
          .where(inArray(posts.id, ocIds))
      : [],
    fcIds.length
      ? db
          .select({
            id: fcPosts.id,
            fid: fcPosts.fid,
            authorAddress: fcPosts.authorAddress,
            createdAt: fcPosts.createdAt,
            reactions: fcPosts.reactions,
            replies: fcPosts.replies,
          })
          .from(fcPosts)
          .where(inArray(fcPosts.id, fcIds))
      : [],
    loadLabels(db, ids),
  ]);

  const authorOf = new Map<string, string>();
  for (const r of ocRows) authorOf.set(r.id, r.author);
  for (const r of fcRows) authorOf.set(r.id, r.authorAddress ?? `fid:${r.fid}`);
  const authors = [...new Set(authorOf.values())];
  const addrAuthors = authors.filter((a) => a.startsWith("0x"));

  const [reactionCounts, replyStats, threadRows, alRows, builderRows, followers, ocRate, fcRate] =
    await Promise.all([
      ocIds.length
        ? db
            .select({ postId: reactions.postId, n: sql<number>`count(*)::int` })
            .from(reactions)
            .where(inArray(reactions.postId, ocIds))
            .groupBy(reactions.postId)
        : [],
      ocIds.length
        ? db
            .select({
              parentId: posts.parentId,
              n: sql<number>`count(*)::int`,
              d: sql<number>`count(distinct ${posts.author})::int`,
            })
            .from(posts)
            .where(and(inArray(posts.parentId, ocIds), eq(posts.deleted, false)))
            .groupBy(posts.parentId)
        : [],
      ocIds.length
        ? db
            .select({ rootId: posts.rootId, author: posts.author })
            .from(posts)
            .where(
              and(inArray(posts.rootId, ocIds), sql`${posts.parentId} is not null`, eq(posts.deleted, false)),
            )
        : [],
      authors.length ? db.select().from(authorLabels).where(inArray(authorLabels.subject, authors)) : [],
      addrAuthors.length
        ? db.select().from(builderStats).where(inArray(builderStats.address, addrAuthors))
        : [],
      viewer && addrAuthors.length
        ? db
            .select({ f: follows.follower })
            .from(follows)
            .where(and(eq(follows.target, viewer), inArray(follows.follower, addrAuthors)))
        : [],
      addrAuthors.length
        ? db
            .select({ a: posts.author, n: sql<number>`count(*)::int` })
            .from(posts)
            .where(and(inArray(posts.author, addrAuthors), gte(posts.createdAt, opts.now - 86400)))
            .groupBy(posts.author)
        : [],
      fcRows.length
        ? db
            .select({ fid: fcPosts.fid, n: sql<number>`count(*)::int` })
            .from(fcPosts)
            .where(
              and(
                inArray(fcPosts.fid, [...new Set(fcRows.map((r) => r.fid))]),
                gte(fcPosts.createdAt, opts.now - 86400),
              ),
            )
            .groupBy(fcPosts.fid)
        : [],
    ]);

  const rc = new Map(reactionCounts.map((r) => [r.postId, Number(r.n)]));
  const rs = new Map(replyStats.map((r) => [r.parentId as string, { n: Number(r.n), d: Number(r.d) }]));
  const threads = new Map<string, string[]>();
  for (const t of threadRows) threads.set(t.rootId, [...(threads.get(t.rootId) ?? []), t.author]);
  const al = new Map<string, Record<string, number>>();
  for (const r of alRows) {
    const m = al.get(r.subject) ?? {};
    m[r.label] = Math.max(m[r.label] ?? 0, r.score);
    al.set(r.subject, m);
  }
  const builder = new Map(builderRows.map((r) => [r.address, r.contractsDeployed]));
  const followsMe = new Set(followers.map((r) => r.f));
  const followingSet = new Set(following);
  const twoHopSet = new Set(twoHop);
  const rate = new Map<string, number>([
    ...ocRate.map((r) => [r.a, Number(r.n)] as const),
    ...fcRate.map((r) => [`fid:${r.fid}`, Number(r.n)] as const),
  ]);
  const fcById = new Map(fcRows.map((r) => [r.id, r]));

  const out: Candidate[] = [];
  for (const id of ids) {
    const author = authorOf.get(id);
    if (!author || blockedAuthors.has(author)) continue;
    const signals: Candidate["signals"] = {};
    const fcRow = fcById.get(id);
    if (fcRow) {
      signals.reactions = fcRow.reactions;
      signals.reply_count = fcRow.replies;
      signals.author_post_rate = rate.get(`fid:${fcRow.fid}`) ?? 0;
    } else {
      const st = rs.get(id);
      signals.reactions = rc.get(id) ?? 0;
      signals.reply_count = st?.n ?? 0;
      signals.distinct_repliers = st?.d ?? 0;
      const thread = threads.get(id) ?? [];
      const repliers = new Set(thread.filter((a) => a !== author));
      // "Trò chuyện thật": ≥3 reply, ≥2 người khác nhau, và tác giả gốc có trả lời lại.
      signals.conversation = thread.length >= 3 && repliers.size >= 2 && thread.includes(author) ? 1 : 0;
      signals.author_post_rate = rate.get(author) ?? 0;
    }
    if (author.startsWith("0x")) {
      signals.onchain_builder = builder.get(author) ?? 0;
      signals.mutual_follow = followingSet.has(author) && followsMe.has(author) ? 1 : 0;
      if (followingSet.has(author)) signals.graph_distance = 1;
      else if (twoHopSet.has(author)) signals.graph_distance = 2;
    }
    out.push({
      id,
      author,
      createdAt: created.get(id) ?? 0,
      origins: [...(origins.get(id) ?? [])],
      labels: labelMap.get(id) ?? {},
      authorLabels: al.get(author) ?? {},
      signals,
    });
  }
  return out;
}
