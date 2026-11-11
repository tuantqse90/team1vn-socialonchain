import {
  type Db,
  delegates,
  follows,
  notifications,
  payments,
  posts,
  reactions,
  users,
} from "@socialonchain/db";
import { onchainPostId, parseHashtags, parseMentions, ZERO_BYTES32 } from "@socialonchain/protocol";
import { and, eq, inArray } from "drizzle-orm";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type LogCtx = { blockNumber: number; txHash: string; logIndex: number; timestamp: number };

/** Event đã decode. args để `unknown` rồi đọc có kiểm tra để không phụ thuộc kiểu ABI sinh ra. */
export type DecodedEvent = { eventName: string; args: Record<string, unknown> };

const lc = (v: unknown) => String(v).toLowerCase();

async function notify(
  tx: Tx,
  n: { recipient: string; kind: string; actor: string; postId: string | null; createdAt: number },
) {
  if (n.recipient === n.actor) return;
  await tx.insert(notifications).values(n).onConflictDoNothing();
}

/**
 * Áp 1 event vào schema `chain`. Idempotent (replay an toàn): insert dùng ON CONFLICT.
 * Thông báo (schema `app`) được sinh cùng transaction, khử trùng bằng unique constraint.
 */
export async function applyEvent(tx: Tx, ev: DecodedEvent, ctx: LogCtx): Promise<void> {
  const a = ev.args;
  switch (ev.eventName) {
    case "Registered": {
      const handle = String(a.handle ?? "");
      await tx
        .insert(users)
        .values({
          address: lc(a.owner),
          handle: handle === "" ? null : handle,
          profileUri: String(a.profileURI ?? ""),
          registeredAt: ctx.timestamp,
          blockNumber: ctx.blockNumber,
        })
        .onConflictDoNothing();
      return;
    }
    case "ProfileUpdated":
      await tx
        .update(users)
        .set({ profileUri: String(a.profileURI ?? "") })
        .where(eq(users.address, lc(a.owner)));
      return;
    case "DelegateAdded":
      await tx
        .insert(delegates)
        .values({
          owner: lc(a.owner),
          key: lc(a.key),
          expiresAt: Number(a.expiresAt),
          addedAt: ctx.timestamp,
        })
        .onConflictDoUpdate({
          target: [delegates.owner, delegates.key],
          set: { expiresAt: Number(a.expiresAt), addedAt: ctx.timestamp },
        });
      return;
    case "DelegateRemoved":
      await tx.delete(delegates).where(and(eq(delegates.owner, lc(a.owner)), eq(delegates.key, lc(a.key))));
      return;
    case "Followed": {
      const follower = lc(a.follower);
      const target = lc(a.target);
      await tx.insert(follows).values({ follower, target, createdAt: ctx.timestamp }).onConflictDoNothing();
      await notify(tx, {
        recipient: target,
        kind: "follow",
        actor: follower,
        postId: null,
        createdAt: ctx.timestamp,
      });
      return;
    }
    case "Unfollowed":
      await tx
        .delete(follows)
        .where(and(eq(follows.follower, lc(a.follower)), eq(follows.target, lc(a.target))));
      return;
    case "Posted": {
      const id = onchainPostId(a.id as `0x${string}`);
      const author = lc(a.author);
      const rawParent = lc(a.parentId);
      const parentId = rawParent === ZERO_BYTES32 ? null : onchainPostId(rawParent as `0x${string}`);
      const rawChannel = lc(a.channel);
      const text = String(a.text ?? "");
      let rootId = id;
      let parentAuthor: string | null = null;
      if (parentId) {
        const [parent] = await tx
          .select({ rootId: posts.rootId, author: posts.author })
          .from(posts)
          .where(eq(posts.id, parentId));
        rootId = parent?.rootId ?? parentId;
        parentAuthor = parent?.author ?? null;
      }
      const m = parseMentions(text);
      let mentioned = m.addresses;
      if (m.handles.length) {
        const rows = await tx
          .select({ address: users.address })
          .from(users)
          .where(inArray(users.handle, m.handles));
        mentioned = [...new Set([...mentioned, ...rows.map((r) => r.address)])];
      }
      await tx
        .insert(posts)
        .values({
          id,
          author,
          parentId,
          rootId,
          channel: rawChannel === ZERO_BYTES32 ? null : rawChannel,
          text,
          meta: String(a.meta ?? "0x"),
          mentions: mentioned,
          hashtags: parseHashtags(text),
          createdAt: Number(a.timestamp ?? ctx.timestamp),
          blockNumber: ctx.blockNumber,
          txHash: ctx.txHash,
        })
        .onConflictDoNothing();
      const createdAt = Number(a.timestamp ?? ctx.timestamp);
      if (parentAuthor)
        await notify(tx, { recipient: parentAuthor, kind: "reply", actor: author, postId: id, createdAt });
      for (const r of mentioned) {
        if (r !== parentAuthor)
          await notify(tx, { recipient: r, kind: "mention", actor: author, postId: id, createdAt });
      }
      return;
    }
    case "Reacted": {
      const actor = lc(a.actor);
      const postId = onchainPostId(a.postId as `0x${string}`);
      const kind = Number(a.kind);
      await tx
        .insert(reactions)
        .values({ actor, postId, kind, createdAt: ctx.timestamp })
        .onConflictDoNothing();
      const [p] = await tx.select({ author: posts.author }).from(posts).where(eq(posts.id, postId));
      if (p) {
        await notify(tx, {
          recipient: p.author,
          kind: kind === 2 ? "repost" : "like",
          actor,
          postId,
          createdAt: ctx.timestamp,
        });
      }
      return;
    }
    case "Unreacted":
      await tx
        .delete(reactions)
        .where(
          and(
            eq(reactions.actor, lc(a.actor)),
            eq(reactions.postId, onchainPostId(a.postId as `0x${string}`)),
            eq(reactions.kind, Number(a.kind)),
          ),
        );
      return;
    case "Deleted":
      // Tombstone: giữ hàng (để thread không gãy) nhưng xoá nội dung.
      await tx
        .update(posts)
        .set({ deleted: true, text: "", meta: "0x", mentions: [], hashtags: [] })
        .where(eq(posts.id, onchainPostId(a.id as `0x${string}`)));
      return;
    case "Paid":
      await tx
        .insert(payments)
        .values({
          id: `${ctx.txHash}:${ctx.logIndex}`,
          user: lc(a.user),
          planId: Number(a.planId),
          amount: String(a.amount),
          paidUntil: Number(a.paidUntil),
          createdAt: ctx.timestamp,
          txHash: ctx.txHash,
        })
        .onConflictDoNothing();
      return;
    default:
      // Event không cần index (OwnershipTransferred, PlanSet, TreasurySet, …)
      return;
  }
}
