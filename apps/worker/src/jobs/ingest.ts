import { type Db, fcLinks, fcPosts, fcUsers, userFc } from "@socialonchain/db";
import { type FarcasterSource, type FcCast, type FcUser, FixtureFarcaster } from "@socialonchain/farcaster";
import { farcasterPostId } from "@socialonchain/protocol";
import { sql } from "drizzle-orm";

async function upsertUsers(db: Db, list: FcUser[]) {
  const uniq = [...new Map(list.map((u) => [u.fid, u])).values()];
  for (let i = 0; i < uniq.length; i += 200) {
    await db
      .insert(fcUsers)
      .values(
        uniq.slice(i, i + 200).map((u) => ({
          fid: u.fid,
          username: u.username,
          displayName: u.displayName,
          pfpUrl: u.pfpUrl,
          bio: u.bio,
          addresses: u.addresses,
          followerCount: u.followerCount,
        })),
      )
      .onConflictDoUpdate({
        target: fcUsers.fid,
        set: {
          username: sql`excluded.username`,
          displayName: sql`excluded.display_name`,
          pfpUrl: sql`excluded.pfp_url`,
          bio: sql`excluded.bio`,
          addresses: sql`excluded.addresses`,
          followerCount: sql`excluded.follower_count`,
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertCasts(db: Db, casts: FcCast[]) {
  await upsertUsers(
    db,
    casts.map((c) => c.author),
  );
  const uniq = [...new Map(casts.map((c) => [c.hash, c])).values()];
  for (let i = 0; i < uniq.length; i += 200) {
    await db
      .insert(fcPosts)
      .values(
        uniq.slice(i, i + 200).map((c) => ({
          id: farcasterPostId(c.hash),
          fid: c.author.fid,
          authorAddress: c.author.addresses[0] ?? null,
          text: c.text.slice(0, 4000),
          channel: c.channel,
          parentId: c.parentHash ? farcasterPostId(c.parentHash) : null,
          createdAt: c.createdAt,
          reactions: c.reactions,
          replies: c.replies,
          embeds: c.embeds,
        })),
      )
      .onConflictDoUpdate({
        target: fcPosts.id,
        set: {
          reactions: sql`excluded.reactions`,
          replies: sql`excluded.replies`,
          embeds: sql`excluded.embeds`,
        },
      });
  }
}

/**
 * Ingest Farcaster (CHỈ ĐỌC). Chỉ lấy những gì có khả năng vào feed:
 * các channel đang theo dõi + following feed của những FID đã liên kết với user.
 */
export async function runIngest(
  db: Db,
  source: FarcasterSource,
  channels: string[],
): Promise<{ casts: number; links: number }> {
  let casts = 0;
  let links = 0;
  if (source instanceof FixtureFarcaster) {
    // Fixture: nạp toàn bộ (nhỏ) để local có nội dung ngay.
    await upsertUsers(db, source.allUsers());
    await upsertCasts(db, source.allCasts());
    casts = source.allCasts().length;
  } else {
    for (const ch of channels) {
      const list = await source.channelFeed(ch, 100);
      await upsertCasts(db, list);
      casts += list.length;
    }
  }

  const linked = await db.select({ fid: userFc.fid }).from(userFc);
  const fids = [...new Set(linked.map((l) => l.fid))];
  // Fixture: thêm các FID có following trong fixture để source farcaster:following chạy được ở local.
  for (const fid of fids) {
    const following = await source.following(fid, 1000);
    await upsertUsers(db, following);
    if (following.length) {
      await db
        .insert(fcLinks)
        .values(following.map((u) => ({ fid, targetFid: u.fid })))
        .onConflictDoNothing();
      links += following.length;
    }
    if (!(source instanceof FixtureFarcaster)) {
      const feed = await source.followingFeed(fid, 100);
      await upsertCasts(db, feed);
      casts += feed.length;
    }
  }
  return { casts, links };
}
