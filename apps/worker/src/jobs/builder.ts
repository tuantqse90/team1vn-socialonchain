import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builderStats, type Db, linkedWallets } from "@socialonchain/db";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Tín hiệu `onchain_builder`: số contract tác giả đã deploy trên Avalanche (kiểm chứng được).
 * - data-api: Avalanche Data API `GET /v1/chains/{chainId}/contracts/{address}/deployments`
 *   (https://developers.avacloud.io/data-api/evm-contracts/list-deployed-contracts), header x-glacier-api-key.
 * - fixture: đọc fixtures/onchain-builder/fixture.json (local, không cần key).
 */
export type BuilderCounter = {
  readonly mode: "fixture" | "data-api";
  count(address: string): Promise<Record<string, number>>;
};

export class FixtureBuilderCounter implements BuilderCounter {
  readonly mode = "fixture" as const;
  private data: Record<string, Record<string, number>>;
  constructor(data?: Record<string, Record<string, number>>) {
    this.data =
      data ??
      (JSON.parse(
        readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/onchain-builder/fixture.json"),
          "utf8",
        ),
      ) as Record<string, Record<string, number>>);
  }
  async count(address: string) {
    return this.data[address.toLowerCase()] ?? {};
  }
}

const DeploymentsPage = z.looseObject({
  contracts: z.array(z.unknown()).optional(),
  nextPageToken: z.string().nullish(),
});

export class DataApiBuilderCounter implements BuilderCounter {
  readonly mode = "data-api" as const;
  constructor(
    private chainIds: string[],
    private apiKey?: string,
    private base = "https://glacier-api.avax.network",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async count(address: string) {
    const out: Record<string, number> = {};
    for (const chainId of this.chainIds) {
      let n = 0;
      let pageToken: string | undefined;
      for (let page = 0; page < 5; page++) {
        const url = new URL(`/v1/chains/${chainId}/contracts/${address}/deployments`, this.base);
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const res = await this.fetchImpl(url, {
          headers: {
            accept: "application/json",
            ...(this.apiKey ? { "x-glacier-api-key": this.apiKey } : {}),
          },
        });
        if (res.status === 404) break;
        if (res.status === 429) throw new Error("data-api rate limited");
        if (!res.ok) throw new Error(`data-api ${res.status}`);
        const body = DeploymentsPage.parse(await res.json());
        n += body.contracts?.length ?? 0;
        pageToken = body.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
      if (n > 0) out[chainId] = n;
    }
    return out;
  }
}

/**
 * Cập nhật builder_stats cho tác giả chưa có hoặc đã cũ hơn 24h. Contract của ví ngoài đã liên kết
 * (app.linked_wallets) được cộng vào owner theo từng chainId; ví liên kết không có dòng riêng.
 */
export async function runBuilder(
  db: Db,
  counter: BuilderCounter,
  limit = 50,
): Promise<{ checked: number; builders: number }> {
  const r = await db.execute<{ address: string }>(sql`
    with authors as (
      select address, 0 as pri from chain.users
      union all select distinct author, 1 from chain.posts
      union all select distinct author_address, 2 from app.fc_posts where author_address is not null
    ), uniq as (select address, min(pri) as pri from authors group by address)
    select a.address from uniq a
    left join app.builder_stats b on b.address = a.address
    where b.address is null or b.checked_at < now() - interval '24 hours'
    -- Ưu tiên user đã đăng ký (gợi ý builder, badge trên hồ sơ), rồi tác giả onchain, rồi Farcaster; chưa quét trước.
    order by a.pri, b.checked_at nulls first
    limit ${limit}`);
  const owners = r.rows.map((x) => x.address);
  const links = owners.length
    ? await db
        .select({ address: linkedWallets.address, owner: linkedWallets.owner })
        .from(linkedWallets)
        .where(inArray(linkedWallets.owner, owners))
    : [];
  const walletsOf = new Map<string, string[]>();
  for (const l of links) walletsOf.set(l.owner, [...(walletsOf.get(l.owner) ?? []), l.address]);

  let builders = 0;
  for (const address of owners) {
    // Chép ra object mới: counter (fixture) có thể trả về chính object nó giữ.
    const chains = { ...(await counter.count(address)) };
    for (const wallet of walletsOf.get(address) ?? []) {
      for (const [chainId, n] of Object.entries(await counter.count(wallet)))
        chains[chainId] = (chains[chainId] ?? 0) + n;
    }
    const total = Object.values(chains).reduce((s, n) => s + n, 0);
    if (total > 0) builders++;
    await db
      .insert(builderStats)
      .values({ address, contractsDeployed: total, chains, source: counter.mode })
      .onConflictDoUpdate({
        target: builderStats.address,
        set: { contractsDeployed: total, chains, source: counter.mode, checkedAt: new Date() },
      });
  }
  return { checked: r.rows.length, builders };
}
