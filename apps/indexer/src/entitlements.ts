import { type Db, payments, savedFeeds, usage } from "@socialonchain/db";
import { and, eq, sql } from "drizzle-orm";
import type { Env } from "./env";

/**
 * Module entitlements: CHỈ đọc "user X có Pro tới ngày Y" từ event `Paid` (bảng chain.payments),
 * không phụ thuộc token cụ thể. Đổi tUSD → USDC thật thì module này giữ nguyên.
 */
export type Entitlements = {
  plan: "free" | "pro";
  proUntil: number | null;
  limits: { compilesPerDay: number; maxFeeds: number };
  usage: { compilesToday: number; feeds: number };
};

export function utcDay(nowSec: number): string {
  return new Date(nowSec * 1000).toISOString().slice(0, 10);
}

export async function getEntitlements(db: Db, env: Env, address: string, now: number): Promise<Entitlements> {
  const [paid] = await db
    .select({ until: sql<number | null>`max(${payments.paidUntil})` })
    .from(payments)
    .where(and(eq(payments.user, address), eq(payments.planId, env.PRO_PLAN_ID)));
  const proUntil = paid?.until ? Number(paid.until) : null;
  const pro = proUntil !== null && proUntil > now;
  const [u] = await db
    .select({ count: usage.count })
    .from(usage)
    .where(and(eq(usage.address, address), eq(usage.day, utcDay(now)), eq(usage.kind, "compile")));
  const [f] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedFeeds)
    .where(eq(savedFeeds.owner, address));
  return {
    plan: pro ? "pro" : "free",
    proUntil,
    limits: pro
      ? { compilesPerDay: env.PRO_COMPILES_PER_DAY, maxFeeds: env.PRO_MAX_FEEDS }
      : { compilesPerDay: env.FREE_COMPILES_PER_DAY, maxFeeds: env.FREE_MAX_FEEDS },
    usage: { compilesToday: u?.count ?? 0, feeds: Number(f?.n ?? 0) },
  };
}

export async function incrementUsage(db: Db, address: string, kind: string, now: number): Promise<void> {
  await db
    .insert(usage)
    .values({ address, day: utcDay(now), kind, count: 1 })
    .onConflictDoUpdate({
      target: [usage.address, usage.day, usage.kind],
      set: { count: sql`${usage.count} + 1` },
    });
}
