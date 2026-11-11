import type { Db } from "@socialonchain/db";
import { heuristicAuthorLabels } from "@socialonchain/feed-sdk";
import type { LabelItem } from "@socialonchain/protocol";
import { sql } from "drizzle-orm";
import type { LocalAccount } from "viem";
import { type LabelSink, submitLabels } from "../shared";

/**
 * Nhãn tác giả (author:founder, author:builder, author:new_account) từ bio + thời điểm xuất hiện + builder_stats.
 * Heuristic (rẻ); chạy lại định kỳ vì new_account hết hiệu lực sau 7 ngày.
 */
export async function runAuthorLabels(
  db: Db,
  account: LocalAccount,
  sink: LabelSink,
  now: number,
): Promise<{ authors: number }> {
  const r = await db.execute<{
    subject: string;
    bio: string | null;
    first_seen: number | null;
    contracts: number | null;
  }>(sql`
    select u.address as subject, coalesce(p.bio, f.bio) as bio, u.registered_at as first_seen, b.contracts_deployed as contracts
    from chain.users u
    left join app.profiles p on p.address = u.address
    left join app.fc_users f on u.address = any(f.addresses)
    left join app.builder_stats b on b.address = u.address
    union all
    select coalesce(f.addresses[1], 'fid:' || f.fid) as subject, f.bio, null as first_seen, b.contracts_deployed
    from app.fc_users f
    left join app.builder_stats b on b.address = f.addresses[1]
    where not exists (select 1 from chain.users u where u.address = any(f.addresses))`);
  const items: LabelItem[] = [];
  const seen = new Set<string>();
  for (const row of r.rows) {
    if (seen.has(row.subject)) continue;
    seen.add(row.subject);
    const labels = heuristicAuthorLabels({
      bio: row.bio,
      firstSeenAt: row.first_seen === null ? null : Number(row.first_seen),
      now,
      contractsDeployed: row.contracts ?? 0,
    });
    // Ghi cả 0 để nhãn cũ (vd new_account) được hạ xuống khi hết hiệu lực.
    for (const label of ["author:founder", "author:builder", "author:new_account"]) {
      items.push({ subject: `author:${row.subject}`, label, score: labels[label] ?? 0 });
    }
  }
  if (items.length) await submitLabels(account, sink, items);
  return { authors: seen.size };
}
