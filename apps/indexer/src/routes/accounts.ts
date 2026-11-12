import { timingSafeEqual } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { accounts, users } from "@socialonchain/db";
import { accountMessage, authKeyHash, getNetwork, HANDLE_RE, MIN_SCRYPT_N } from "@socialonchain/protocol";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import type { Context } from "hono";
import { type Address, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppVars } from "../auth";
import type { AppContext } from "../context";
import { ErrorSchema } from "../schemas";
import { HttpError } from "./write";

/**
 * Tài khoản trong app (ví nhúng): tên + mật khẩu, không cần ví ngoài, không popup.
 *
 * - Client tự sinh private key, mã hoá bằng khoá dẫn xuất từ mật khẩu (scrypt) rồi mới gửi keystore lên.
 *   Server chỉ lưu keystore + sha256(authKey) nên KHÔNG giải mã được ví. Quên mật khẩu = mất tài khoản.
 * - Tài khoản mới được tặng gas 1 lần từ vòi của app (FAUCET_PRIVATE_KEY) để tự đăng ký onchain.
 * - TUYỆT ĐỐI không log authKey / auth_hash / keystore / key của vòi.
 */

const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const AuthKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const Handle = z.string().regex(HANDLE_RE).openapi({ description: "a-z, 0-9, _ (3–20 ký tự, chữ thường)" });
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

const KdfSchema = z
  .object({
    name: z.literal("scrypt"),
    N: z
      .number()
      .int()
      .min(MIN_SCRYPT_N)
      .max(2 ** 20)
      .refine(isPow2, "N must be a power of two"),
    r: z.number().int().min(8).max(16),
    p: z.number().int().min(1).max(4),
    dkLen: z.literal(64),
    salt: z.string().regex(/^0x[0-9a-fA-F]{32}$/, "salt must be 16 bytes hex"),
  })
  .openapi("KdfParams");

const KeystoreSchema = z
  .object({
    v: z.literal(1),
    iv: z.string().regex(/^0x[0-9a-fA-F]{24}$/, "iv must be 12 bytes hex"),
    // AES-256-GCM: 32 byte private key + 16 byte tag = 48 byte; chặn trên 100 byte (200 ký tự hex).
    ct: z.string().regex(/^0x(?:[0-9a-fA-F]{2}){17,100}$/, "ct must be 17–100 bytes hex"),
  })
  .openapi("Keystore");

const SignupBody = z.object({
  handle: Handle,
  address: Addr,
  kdf: KdfSchema,
  authKey: AuthKey,
  keystore: KeystoreSchema,
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(2 + 2 * 4096),
});

const DRIP_SKIPPED = ["faucet_off", "cap", "funded", "error"] as const;
type DripSkipped = (typeof DRIP_SKIPPED)[number];
type DripResult = { drip: { hash: Hex } | null; dripSkipped?: DripSkipped };

const SignupResponse = z.object({
  handle: z.string(),
  address: z.string().openapi({ description: "chữ thường" }),
  drip: z.object({ hash: z.string() }).nullable(),
  dripSkipped: z.enum(DRIP_SKIPPED).optional(),
});

const LoginBody = z.object({ handle: z.string().min(1).max(64), authKey: AuthKey });
const LoginResponse = z.object({
  handle: z.string(),
  address: z.string(),
  kdf: KdfSchema,
  keystore: KeystoreSchema,
});

/** Cửa sổ trượt trong bộ nhớ (1 process). Chạy nhiều instance indexer thì cần chuyển sang Redis/DB. */
class SlidingWindow {
  private readonly hits = new Map<string, number[]>();
  private ops = 0;
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private live(key: string, now: number): number[] {
    const arr = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (arr.length) this.hits.set(key, arr);
    else this.hits.delete(key);
    return arr;
  }

  /** Lấy 1 lượt; false nếu đã hết lượt trong cửa sổ. */
  take(key: string): boolean {
    const now = Date.now();
    if (++this.ops % 1000 === 0) for (const k of [...this.hits.keys()]) this.live(k, now);
    const arr = this.live(key, now);
    if (arr.length >= this.limit) return false;
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  /** Trả lại lượt vừa lấy (yêu cầu thất bại vì lý do hợp lệ, vd. tên đã có người dùng). */
  release(key: string) {
    this.hits.get(key)?.pop();
  }
}

/** IP client: hop đầu của x-forwarded-for (sau proxy Railway), không có thì địa chỉ socket. Chỉ giữ trong RAM. */
function clientIp(c: Context): string {
  const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() trong test: không có socket
  }
}

/** Vòi gas: 1 ví, gửi tuần tự (1 tx đang bay) để nonce không bao giờ trùng. */
function createFaucet(ctx: AppContext) {
  const key = ctx.env.FAUCET_PRIVATE_KEY;
  if (!key) return null;
  const chain = getNetwork(ctx.env.NETWORK).chain;
  const wallet = createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain,
    transport: http(ctx.env.rpcUrl),
  });
  const amount = ctx.env.GAS_DRIP_WEI;
  let queue: Promise<unknown> = Promise.resolve();

  async function dripNow(to: Address): Promise<DripResult> {
    const balance = await ctx.client.getBalance({ address: to });
    if (balance >= amount / 2n) return { drip: null, dripSkipped: "funded" };
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [today] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(isNotNull(accounts.dripTx), gte(accounts.createdAt, dayStart)));
    if (Number(today?.n ?? 0) >= ctx.env.GAS_DRIP_DAILY_CAP) return { drip: null, dripSkipped: "cap" };

    const hash = await wallet.sendTransaction({ to, value: amount });
    const row = eq(accounts.address, to.toLowerCase());
    // Ghi ngay khi tx đã phát lên mạng: tính vào hạn mức ngày kể cả khi chờ receipt bị timeout.
    await ctx.db.update(accounts).set({ dripTx: hash, updatedAt: new Date() }).where(row);
    const receipt = await ctx.client.waitForTransactionReceipt({
      hash,
      pollingInterval: 250,
      timeout: 30_000,
    });
    if (receipt.status !== "success") {
      await ctx.db.update(accounts).set({ dripTx: null, updatedAt: new Date() }).where(row);
      throw new Error(`drip tx reverted: ${hash}`);
    }
    return { drip: { hash } };
  }

  return {
    drip(to: Address): Promise<DripResult> {
      const run = queue.then(() => dripNow(to));
      queue = run.catch(() => undefined);
      return run.catch((err: unknown) => {
        // Chỉ log thông điệp ngắn: không bao giờ in key của vòi.
        const e = err as { shortMessage?: string; message?: string };
        ctx.log.error({ err: e.shortMessage ?? e.message, to }, "gas drip failed");
        return { drip: null, dripSkipped: "error" as const };
      });
    },
  };
}

export function accountRoutes(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: "bad_request", message: result.error.message.slice(0, 500) }, 400);
    },
  });
  const db = ctx.db;
  const faucet = createFaucet(ctx);
  const signupsPerIp = new SlidingWindow(ctx.env.SIGNUPS_PER_IP_PER_HOUR, 3_600_000);
  const loginsPerIp = new SlidingWindow(10, 60_000);
  const loginsPerHandle = new SlidingWindow(10, 60_000);
  // So sánh với hash giả khi không có tài khoản: thời gian phản hồi như nhau với tên không tồn tại.
  const DUMMY_HASH = Buffer.alloc(32);

  // ---------- Tham số KDF (để client dẫn xuất khoá trước khi đăng nhập) ----------
  app.openapi(
    createRoute({
      method: "get",
      path: "/accounts/kdf/{handle}",
      tags: ["accounts"],
      description: "Tham số scrypt (gồm salt) của tài khoản trong app. Salt không phải bí mật.",
      request: { params: z.object({ handle: z.string().min(1).max(64) }) },
      responses: {
        200: json(z.object({ handle: z.string(), kdf: KdfSchema })),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const handle = c.req.valid("param").handle.toLowerCase();
      if (!HANDLE_RE.test(handle)) return c.json({ error: "not_found" }, 404);
      const [row] = await db
        .select({ handle: accounts.handle, kdf: accounts.kdf })
        .from(accounts)
        .where(eq(accounts.handle, handle));
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json({ handle: row.handle, kdf: row.kdf }, 200);
    },
  );

  // ---------- Tạo tài khoản ----------
  app.openapi(
    createRoute({
      method: "post",
      path: "/accounts",
      tags: ["accounts"],
      description:
        "Tạo tài khoản trong app: keystore đã mã hoá ở client + authKey (server chỉ lưu sha256). " +
        "`signature` = personal_sign của `address` trên accountMessage({handle, address, chainId}). " +
        "Tài khoản mới được tặng gas 1 lần nếu vòi đang bật.",
      request: { body: { content: { "application/json": { schema: SignupBody } } } },
      responses: {
        201: json(SignupResponse, "Created"),
        400: json(ErrorSchema, "Bad request"),
        401: json(ErrorSchema, "bad_signature"),
        409: json(ErrorSchema, "handle_taken | address_exists"),
        429: json(ErrorSchema, "rate_limited"),
      },
    }),
    async (c) => {
      const b = c.req.valid("json");
      const ip = clientIp(c);
      if (!signupsPerIp.take(ip)) throw new HttpError(429, "rate_limited");
      const handle = b.handle;
      const address = b.address.toLowerCase();
      try {
        // mode "eoa": ecrecover cục bộ trước (ví nhúng luôn là EOA), không khớp mới thử ERC-1271/6492 qua RPC.
        const ok = await ctx.client
          .verifyMessage({
            address: b.address as Address,
            message: accountMessage({
              handle,
              address: b.address as Address,
              chainId: ctx.deployment.chainId,
            }),
            signature: b.signature as Hex,
            mode: "eoa",
          })
          .catch(() => false);
        if (!ok) throw new HttpError(401, "bad_signature");

        const [byAddress] = await db
          .select({ a: accounts.address })
          .from(accounts)
          .where(eq(accounts.address, address));
        if (byAddress) throw new HttpError(409, "address_exists");
        const [byHandle] = await db
          .select({ a: accounts.address })
          .from(accounts)
          .where(eq(accounts.handle, handle));
        if (byHandle) throw new HttpError(409, "handle_taken");
        const [onchain] = await db
          .select({ a: users.address })
          .from(users)
          .where(and(eq(users.handle, handle), ne(users.address, address)));
        if (onchain) throw new HttpError(409, "handle_taken");

        const [created] = await db
          .insert(accounts)
          .values({
            address,
            handle,
            kdf: b.kdf,
            authHash: authKeyHash(b.authKey as Hex),
            keystore: b.keystore,
          })
          .onConflictDoNothing()
          .returning({ a: accounts.address });
        if (!created) {
          // Hai yêu cầu cùng lúc: unique constraint chặn, báo đúng lý do.
          const [again] = await db
            .select({ a: accounts.address })
            .from(accounts)
            .where(eq(accounts.address, address));
          throw new HttpError(409, again ? "address_exists" : "handle_taken");
        }
      } catch (err) {
        // Trùng tên/địa chỉ: trả lại lượt để người dùng thử tên khác. Chữ ký sai vẫn tính lượt.
        if (err instanceof HttpError && err.status === 409) signupsPerIp.release(ip);
        throw err;
      }

      const drip: DripResult = faucet
        ? await faucet.drip(address as Address)
        : { drip: null, dripSkipped: "faucet_off" };
      return c.json({ handle, address, ...drip }, 201);
    },
  );

  // ---------- Đăng nhập ----------
  app.openapi(
    createRoute({
      method: "post",
      path: "/accounts/login",
      tags: ["accounts"],
      description:
        "authKey đúng → trả keystore đã mã hoá (client tự giải mã bằng mật khẩu). " +
        "Tên không tồn tại và authKey sai trả cùng một lỗi.",
      request: { body: { content: { "application/json": { schema: LoginBody } } } },
      responses: {
        200: json(LoginResponse),
        400: json(ErrorSchema, "Bad request"),
        401: json(ErrorSchema, "bad_credentials"),
        429: json(ErrorSchema, "rate_limited"),
      },
    }),
    async (c) => {
      const b = c.req.valid("json");
      const handle = b.handle.trim().toLowerCase();
      if (!loginsPerIp.take(clientIp(c)) || !loginsPerHandle.take(handle))
        throw new HttpError(429, "rate_limited");
      const [row] = HANDLE_RE.test(handle)
        ? await db.select().from(accounts).where(eq(accounts.handle, handle))
        : [];
      const given = Buffer.from(authKeyHash(b.authKey as Hex).slice(2), "hex");
      const stored = row ? Buffer.from(row.authHash.slice(2), "hex") : DUMMY_HASH;
      const match = given.length === stored.length && timingSafeEqual(given, stored);
      if (!row || !match) throw new HttpError(401, "bad_credentials");
      return c.json({ handle: row.handle, address: row.address, kdf: row.kdf, keystore: row.keystore }, 200);
    },
  );

  return app;
}
