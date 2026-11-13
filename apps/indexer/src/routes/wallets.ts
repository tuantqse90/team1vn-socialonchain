import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { builderStats, linkedWallets } from "@socialonchain/db";
import { linkWalletMessage } from "@socialonchain/protocol";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import type { AppVars } from "../auth";
import type { AppContext } from "../context";
import { ErrorSchema } from "../schemas";
import { HttpError, requireAuth } from "./write";

/**
 * Ví ngoài liên kết vào tài khoản (vd. ví deployer của builder). Ví nhúng là địa chỉ mới, chưa deploy gì,
 * nên builder thật mất badge `onchain_builder`; liên kết ví deployer bằng chữ ký của chính ví đó để worker
 * cộng số contract của ví vào tài khoản.
 *
 * - Chữ ký = personal_sign của ví trên linkWalletMessage({owner, wallet, chainId}): gắn đúng owner + chain.
 * - Mỗi ví thuộc 1 owner; chữ ký hợp lệ từ owner khác thì ví chuyển sang owner mới.
 * - Liên kết/huỷ xong xoá `builder_stats` của owner (cũ + mới) để worker quét lại sớm.
 */
export const MAX_LINKED_WALLETS = 5;

const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const LinkBody = z.object({
  address: Addr.openapi({ description: "Ví ngoài cần liên kết" }),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(2 + 2 * 4096)
    .openapi({ description: "personal_sign của `address` trên linkWalletMessage({owner, wallet, chainId})" }),
});
const LinkedWalletSchema = z
  .object({
    address: z.string().openapi({ description: "chữ thường" }),
    createdAt: z.number().openapi({ description: "unix giây" }),
  })
  .openapi("LinkedWallet");

export function walletRoutes(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: "bad_request", message: result.error.message.slice(0, 500) }, 400);
    },
  });
  const db = ctx.db;

  app.openapi(
    createRoute({
      method: "get",
      path: "/me/wallets",
      tags: ["wallets"],
      description: "Ví ngoài đã liên kết vào tài khoản đang đăng nhập (cũ nhất trước).",
      responses: {
        200: json(z.object({ items: z.array(LinkedWalletSchema) })),
        401: json(ErrorSchema, "unauthorized"),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const rows = await db
        .select({ address: linkedWallets.address, createdAt: linkedWallets.createdAt })
        .from(linkedWallets)
        .where(eq(linkedWallets.owner, a.address))
        .orderBy(asc(linkedWallets.createdAt));
      const items = rows.map((r) => ({
        address: r.address,
        createdAt: Math.floor(r.createdAt.getTime() / 1000),
      }));
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/me/wallets",
      tags: ["wallets"],
      description:
        `Liên kết ví ngoài (tối đa ${MAX_LINKED_WALLETS}). Ví đã thuộc tài khoản khác thì chuyển sang tài khoản này. ` +
        "Số contract ví đã deploy được cộng vào tín hiệu onchain_builder của tài khoản ở lượt quét sau.",
      request: { body: { content: { "application/json": { schema: LinkBody } } } },
      responses: {
        201: json(z.object({ address: z.string() }), "Linked"),
        400: json(ErrorSchema, "bad_request"),
        401: json(ErrorSchema, "unauthorized | bad_signature"),
        409: json(ErrorSchema, "same_as_owner | too_many"),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const b = c.req.valid("json");
      const owner = a.address;
      const wallet = b.address.toLowerCase();
      if (wallet === owner) throw new HttpError(409, "same_as_owner");
      // mode "eoa": ecrecover cục bộ trước, không khớp mới thử ERC-1271/6492 qua RPC (ví deployer có thể là ví hợp đồng).
      const ok = await ctx.client
        .verifyMessage({
          address: wallet as Address,
          message: linkWalletMessage({
            owner: owner as Address,
            wallet: wallet as Address,
            chainId: ctx.deployment.chainId,
          }),
          signature: b.signature as Hex,
          mode: "eoa",
        })
        .catch(() => false);
      if (!ok) throw new HttpError(401, "bad_signature");

      await db.transaction(async (tx) => {
        // Khoá theo owner: hai yêu cầu song song không vượt quá giới hạn.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`linked_wallets:${owner}`}))`);
        const [n] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(linkedWallets)
          .where(and(eq(linkedWallets.owner, owner), ne(linkedWallets.address, wallet)));
        if (Number(n?.n ?? 0) >= MAX_LINKED_WALLETS) throw new HttpError(409, "too_many");
        const [prev] = await tx
          .select({ owner: linkedWallets.owner })
          .from(linkedWallets)
          .where(eq(linkedWallets.address, wallet));
        await tx
          .insert(linkedWallets)
          .values({ address: wallet, owner, signature: b.signature })
          .onConflictDoUpdate({
            target: linkedWallets.address,
            set: { owner, signature: b.signature, createdAt: new Date() },
          });
        const stale = prev && prev.owner !== owner ? [owner, prev.owner] : [owner];
        await tx.delete(builderStats).where(inArray(builderStats.address, stale));
      });
      return c.json({ address: wallet }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/me/wallets/{address}",
      tags: ["wallets"],
      description: "Huỷ liên kết 1 ví của tài khoản đang đăng nhập.",
      request: { params: z.object({ address: Addr }) },
      responses: {
        200: json(z.object({ ok: z.literal(true) })),
        400: json(ErrorSchema, "bad_request"),
        401: json(ErrorSchema, "unauthorized"),
        404: json(ErrorSchema, "not_found"),
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const wallet = c.req.valid("param").address.toLowerCase();
      const removed = await db.transaction(async (tx) => {
        const rows = await tx
          .delete(linkedWallets)
          .where(and(eq(linkedWallets.address, wallet), eq(linkedWallets.owner, a.address)))
          .returning({ address: linkedWallets.address });
        if (rows.length) await tx.delete(builderStats).where(eq(builderStats.address, a.address));
        return rows.length > 0;
      });
      if (!removed) throw new HttpError(404, "not_found");
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
