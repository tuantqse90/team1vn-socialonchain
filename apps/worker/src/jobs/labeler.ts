import { type Db, fcPosts, posts } from "@socialonchain/db";
import {
  heuristicPostLabels,
  type LlmCall,
  labelerSystemPrompt,
  labelerUserPrompt,
  parseLabelerOutput,
} from "@socialonchain/feed-sdk";
import type { LabelItem } from "@socialonchain/protocol";
import { sql } from "drizzle-orm";
import type { LocalAccount } from "viem";
import { type LabelSink, submitLabels } from "../shared";

export type PostText = { id: string; text: string };

/**
 * Gán nhãn 1 lô bài. LLM: system prompt cố định (cache được) + nội dung bài trong delimiter;
 * output validate bằng zod, sai schema thì retry 1 lần, vẫn sai thì rơi về heuristic.
 * Nhãn ngôn ngữ luôn lấy từ heuristic (rẻ, ổn định).
 */
export async function labelBatch(
  items: PostText[],
  llm?: LlmCall,
): Promise<{ labels: Map<string, Record<string, number>>; engine: string }> {
  const heur = new Map(items.map((p) => [p.id, heuristicPostLabels(p.text)]));
  if (!llm || !items.length) return { labels: heur, engine: "heuristic" };
  const system = labelerSystemPrompt();
  let user = labelerUserPrompt(items);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await llm({ system, user, maxTokens: 8000 });
      const parsed = parseLabelerOutput(
        text,
        items.map((p) => p.id),
      );
      const out = new Map<string, Record<string, number>>();
      for (const p of items) {
        const h = heur.get(p.id) ?? {};
        const lang = Object.fromEntries(Object.entries(h).filter(([k]) => k.startsWith("lang:")));
        out.set(p.id, { ...(parsed.get(p.id) ?? h), ...lang });
      }
      return { labels: out, engine: "llm" };
    } catch (err) {
      user += `\n\n(Previous answer was invalid: ${(err as Error).message.slice(0, 200)}. Answer with valid JSON only.)`;
    }
  }
  return { labels: heur, engine: "heuristic-fallback" };
}

/** Bài chưa có nhãn của labeler này (onchain + Farcaster đã ingest), mới nhất trước. */
/**
 * Bài cần gán nhãn: chỉ những bài còn trong cửa sổ candidate (có khả năng lên feed xếp hạng),
 * mới nhất trước. Bài cũ hơn vẫn xem được ở profile/thread nhưng không tốn lượt labeler.
 */
export async function unlabeledPosts(
  db: Db,
  labeler: string,
  limit: number,
  windowDays = 14,
): Promise<PostText[]> {
  const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
  const r = await db.execute<{ id: string; text: string }>(sql`
    select id, text from (
      select p.id, p.text, p.created_at from ${posts} p
      where not p.deleted and p.created_at >= ${since}
        and not exists (select 1 from app.labels l where l.post_id = p.id and l.labeler = ${labeler})
      union all
      select f.id, f.text, f.created_at from ${fcPosts} f
      where f.created_at >= ${since}
        and not exists (select 1 from app.labels l where l.post_id = f.id and l.labeler = ${labeler})
    ) t order by created_at desc limit ${limit}`);
  return r.rows;
}

export async function runLabeler(
  db: Db,
  account: LocalAccount,
  sink: LabelSink,
  opts: { llm?: LlmCall; batchSize: number; maxBatches?: number; windowDays?: number },
): Promise<{ labeled: number; engine: string }> {
  let labeled = 0;
  let engine = opts.llm ? "llm" : "heuristic";
  for (let i = 0; i < (opts.maxBatches ?? 10); i++) {
    const batch = await unlabeledPosts(db, account.address.toLowerCase(), opts.batchSize, opts.windowDays);
    if (!batch.length) break;
    const res = await labelBatch(batch, opts.llm);
    engine = res.engine;
    const items: LabelItem[] = [];
    for (const p of batch) {
      const l = res.labels.get(p.id) ?? {};
      // Luôn có ít nhất 1 nhãn để đánh dấu "đã xử lý".
      if (!Object.keys(l).length) l["lang:en"] = 1;
      for (const [label, score] of Object.entries(l)) items.push({ subject: p.id, label, score });
    }
    await submitLabels(account, sink, items);
    labeled += batch.length;
    if (batch.length < opts.batchSize) break;
  }
  return { labeled, engine };
}
