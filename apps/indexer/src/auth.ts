import { type Db, delegates } from "@socialonchain/db";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { jwtVerify, SignJWT } from "jose";

export type AuthInfo = { address: string; key: string };
export type AppVars = { auth: AuthInfo | null };

const enc = (s: string) => new TextEncoder().encode(s);

export async function issueJwt(secret: string, info: AuthInfo, expiresAt: number): Promise<string> {
  return new SignJWT({ key: info.key })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(info.address)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(enc(secret));
}

/**
 * Đọc Bearer JWT (không bắt buộc). Với session key (key ≠ owner): nếu sau 2 phút kể từ lúc cấp JWT
 * mà delegate không còn trong DB (đã thu hồi/hết hạn) thì coi như chưa đăng nhập.
 */
export function authMiddleware(db: Db, secret: string): MiddlewareHandler<{ Variables: AppVars }> {
  return async (c, next) => {
    c.set("auth", null);
    const h = c.req.header("authorization");
    if (h?.startsWith("Bearer ")) {
      try {
        const { payload } = await jwtVerify(h.slice(7), enc(secret), { algorithms: ["HS256"] });
        const address = String(payload.sub ?? "").toLowerCase();
        const key = String(payload.key ?? "").toLowerCase();
        let ok = Boolean(address);
        if (ok && key !== address) {
          const now = Math.floor(Date.now() / 1000);
          const [d] = await db
            .select({ expiresAt: delegates.expiresAt })
            .from(delegates)
            .where(and(eq(delegates.owner, address), eq(delegates.key, key)));
          const age = now - Number(payload.iat ?? now);
          if (d ? d.expiresAt <= now : age > 120) ok = false;
        }
        if (ok) c.set("auth", { address, key });
      } catch {
        // token sai/hết hạn: coi như ẩn danh
      }
    }
    await next();
  };
}
