import {
  builderStats,
  type Db,
  fcPosts,
  fcUsers,
  labels,
  posts,
  profiles,
  reactions,
  userFc,
  users,
} from "@socialonchain/db";
import { channelNameFromHash } from "@socialonchain/protocol";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AuthorView, PostView } from "./schemas";

/** Thông tin tác giả theo lô. Key: địa chỉ (0x…) hoặc `fid:<n>`. */
export async function loadAuthors(
  db: Db,
  addresses: string[],
  fids: number[] = [],
): Promise<Map<string, AuthorView>> {
  const out = new Map<string, AuthorView>();
  const addrs = [...new Set(addresses.filter(Boolean))];
  const [userRows, profileRows, builderRows, linkRows] = addrs.length
    ? await Promise.all([
        db.select().from(users).where(inArray(users.address, addrs)),
        db.select().from(profiles).where(inArray(profiles.address, addrs)),
        db.select().from(builderStats).where(inArray(builderStats.address, addrs)),
        db.select().from(userFc).where(inArray(userFc.address, addrs)),
      ])
    : [[], [], [], []];
  const allFids = [...new Set([...fids, ...linkRows.map((l) => l.fid)])];
  const fcRows = allFids.length ? await db.select().from(fcUsers).where(inArray(fcUsers.fid, allFids)) : [];
  // fc user có verified address trùng với tác giả
  const fcByAddr = addrs.length
    ? await db
        .select()
        .from(fcUsers)
        .where(
          sql`${fcUsers.addresses} && ARRAY[${sql.join(
            addrs.map((a) => sql`${a}`),
            sql`, `,
          )}]::text[]`,
        )
    : [];

  const u = new Map(userRows.map((r) => [r.address, r]));
  const p = new Map(profileRows.map((r) => [r.address, r]));
  const b = new Map(builderRows.map((r) => [r.address, r]));
  const fcById = new Map(fcRows.map((r) => [r.fid, r]));
  const link = new Map(linkRows.map((r) => [r.address, r.fid]));
  const fcAddr = new Map<string, (typeof fcByAddr)[number]>();
  for (const f of fcByAddr) for (const a of f.addresses) fcAddr.set(a, f);

  for (const a of addrs) {
    const fc = (link.has(a) ? fcById.get(link.get(a) as number) : undefined) ?? fcAddr.get(a);
    out.set(a, {
      address: a,
      handle: u.get(a)?.handle ?? null,
      displayName: p.get(a)?.displayName ?? fc?.displayName ?? null,
      avatarUrl: p.get(a)?.avatarUrl ?? fc?.pfpUrl ?? null,
      registered: u.has(a),
      fid: fc?.fid ?? null,
      fcUsername: fc?.username ?? null,
      contractsDeployed: b.get(a)?.contractsDeployed ?? 0,
    });
  }
  for (const fid of fids) {
    const fc = fcById.get(fid);
    if (!fc) continue;
    out.set(`fid:${fid}`, {
      address: null,
      handle: null,
      displayName: fc.displayName,
      avatarUrl: fc.pfpUrl,
      registered: false,
      fid,
      fcUsername: fc.username,
      contractsDeployed: 0,
    });
  }
  return out;
}

export async function loadLabels(db: Db, ids: string[]): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!ids.length) return out;
  const rows = await db
    .select({ postId: labels.postId, label: labels.label, score: sql<number>`max(${labels.score})` })
    .from(labels)
    .where(inArray(labels.postId, ids))
    .groupBy(labels.postId, labels.label);
  for (const r of rows) {
    const m = out.get(r.postId) ?? {};
    m[r.label] = Number(r.score);
    out.set(r.postId, m);
  }
  return out;
}

/** Dựng PostView theo đúng thứ tự `ids`. Bỏ qua id không tồn tại. */
export async function loadPostViews(db: Db, ids: string[], viewer: string | null): Promise<PostView[]> {
  if (!ids.length) return [];
  const ocIds = ids.filter((i) => i.startsWith("oc:"));
  const fcIds = ids.filter((i) => i.startsWith("fc:"));
  const [ocRows, fcRows, reactionRows, replyRows, viewerRows, labelMap] = await Promise.all([
    ocIds.length ? db.select().from(posts).where(inArray(posts.id, ocIds)) : [],
    fcIds.length ? db.select().from(fcPosts).where(inArray(fcPosts.id, fcIds)) : [],
    ocIds.length
      ? db
          .select({ postId: reactions.postId, kind: reactions.kind, n: sql<number>`count(*)::int` })
          .from(reactions)
          .where(inArray(reactions.postId, ocIds))
          .groupBy(reactions.postId, reactions.kind)
      : [],
    ocIds.length
      ? db
          .select({ parentId: posts.parentId, n: sql<number>`count(*)::int` })
          .from(posts)
          .where(and(inArray(posts.parentId, ocIds), eq(posts.deleted, false)))
          .groupBy(posts.parentId)
      : [],
    viewer && ocIds.length
      ? db
          .select({ postId: reactions.postId, kind: reactions.kind })
          .from(reactions)
          .where(and(eq(reactions.actor, viewer), inArray(reactions.postId, ocIds)))
      : [],
    loadLabels(db, ids),
  ]);

  const authors = await loadAuthors(
    db,
    [...ocRows.map((r) => r.author), ...fcRows.map((r) => r.authorAddress ?? "").filter(Boolean)],
    fcRows.filter((r) => !r.authorAddress).map((r) => r.fid),
  );
  const fcAuthorsByFid = await loadAuthors(db, [], [...new Set(fcRows.map((r) => r.fid))]);

  const likes = new Map<string, number>();
  const reposts = new Map<string, number>();
  for (const r of reactionRows) (r.kind === 2 ? reposts : likes).set(r.postId, Number(r.n));
  const replies = new Map(replyRows.map((r) => [r.parentId as string, Number(r.n)]));
  const mine = new Set(viewerRows.map((r) => `${r.postId}:${r.kind}`));

  const byId = new Map<string, PostView>();
  for (const r of ocRows) {
    byId.set(r.id, {
      id: r.id,
      source: "onchain",
      author: authors.get(r.author) as AuthorView,
      text: r.deleted ? "" : r.text,
      createdAt: r.createdAt,
      parentId: r.parentId,
      rootId: r.rootId,
      channel: channelNameFromHash(r.channel),
      stats: {
        likes: likes.get(r.id) ?? 0,
        reposts: reposts.get(r.id) ?? 0,
        replies: replies.get(r.id) ?? 0,
      },
      viewer: viewer ? { liked: mine.has(`${r.id}:1`), reposted: mine.has(`${r.id}:2`) } : null,
      txHash: r.txHash,
      deleted: r.deleted,
      labels: labelMap.get(r.id) ?? {},
      embeds: [],
    });
  }
  for (const r of fcRows) {
    const base = fcAuthorsByFid.get(`fid:${r.fid}`);
    const addrView = r.authorAddress ? authors.get(r.authorAddress) : undefined;
    const author: AuthorView = addrView
      ? {
          ...addrView,
          fid: r.fid,
          fcUsername: base?.fcUsername ?? addrView.fcUsername,
          avatarUrl: addrView.avatarUrl ?? base?.avatarUrl ?? null,
          displayName: addrView.displayName ?? base?.displayName ?? null,
        }
      : (base ?? {
          address: null,
          handle: null,
          displayName: null,
          avatarUrl: null,
          registered: false,
          fid: r.fid,
          fcUsername: null,
          contractsDeployed: 0,
        });
    byId.set(r.id, {
      id: r.id,
      source: "farcaster",
      author,
      text: r.text,
      createdAt: r.createdAt,
      parentId: r.parentId,
      rootId: r.parentId ?? r.id,
      channel: r.channel,
      stats: { likes: r.reactions, reposts: 0, replies: r.replies },
      viewer: null,
      txHash: null,
      deleted: false,
      labels: labelMap.get(r.id) ?? {},
      embeds: r.embeds ?? [],
    });
  }
  return ids.map((i) => byId.get(i)).filter((x): x is PostView => Boolean(x));
}
