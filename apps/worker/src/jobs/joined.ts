import type { Db } from "@socialonchain/db";
import { sql } from "drizzle-orm";

/**
 * Notifier: khi một người bạn Farcaster nằm trong pending_follows đã có verified address và đăng ký onchain,
 * báo cho owner để họ follow onchain (1 chạm). Thông báo khác (follow/reply/like/mention) do indexer sinh.
 */
export async function runJoinedNotifier(db: Db, now: number): Promise<{ notified: number }> {
  const r = await db.execute(sql`
    insert into app.notifications (recipient, kind, actor, post_id, created_at)
    select pf.owner, 'joined', u.address, null, ${now}
    from app.pending_follows pf
    join app.fc_users f on f.fid = pf.target_fid
    join chain.users u on u.address = any(f.addresses)
    where not exists (select 1 from chain.follows x where x.follower = pf.owner and x.target = u.address)
    on conflict do nothing`);
  // Đã follow rồi thì dọn pending
  await db.execute(sql`
    delete from app.pending_follows pf using app.fc_users f, chain.follows x
    where f.fid = pf.target_fid and x.follower = pf.owner and x.target = any(f.addresses)`);
  return { notified: r.rowCount ?? 0 };
}
