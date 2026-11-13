import { type Db, indexerState } from "@socialonchain/db";
import {
  type Deployment,
  identityRegistryAbi,
  planPaymentsAbi,
  postsAbi,
  socialGraphAbi,
} from "@socialonchain/protocol";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { type Abi, decodeEventLog, type Log, type PublicClient } from "viem";
import { applyEvent } from "./handlers";

const ABI = [...identityRegistryAbi, ...socialGraphAbi, ...postsAbi, ...planPaymentsAbi] as Abi;

/** RPC công khai (Cloudflare 1015, HTTP 429) từ chối vì gọi quá nhanh, không phải vì range quá lớn. */
export function isRateLimited(err: unknown): boolean {
  let e = err as { status?: number; message?: string; details?: string; cause?: unknown } | undefined;
  for (let i = 0; e && i < 5; i++) {
    if (e.status === 429) return true;
    if (/\b(429|1015)\b|rate.?limit|too many requests/i.test(`${e.message ?? ""} ${e.details ?? ""}`))
      return true;
    e = e.cause as typeof e;
  }
  return false;
}

/** Chờ sau lỗi liên tiếp thứ n (1, 2, …): poll × 2^(n-1), tối đa 60 s. */
export function backoffMs(pollMs: number, failures: number): number {
  return Math.min(60_000, pollMs * 2 ** Math.max(0, failures - 1));
}

/**
 * Indexer tự viết trên viem `getLogs` (không dùng Ponder, xem Decision log):
 * Avalanche có finality tức thì nên không cần xử lý reorg; mỗi chunk được áp trong 1 transaction.
 */
export class ChainIndexer {
  private chunk: number;
  private readonly maxChunk: number;
  readonly stateId: string;
  lastError: string | null = null;

  constructor(
    private db: Db,
    private client: PublicClient,
    private deployment: Deployment,
    private log: Logger,
    chunk?: number,
  ) {
    this.chunk = chunk ?? (deployment.chainId === 31337 ? 5000 : 2000);
    this.maxChunk = this.chunk;
    this.stateId = `${deployment.chainId}:${deployment.version}`;
  }

  async lastBlock(): Promise<number> {
    const [row] = await this.db.select().from(indexerState).where(eq(indexerState.id, this.stateId));
    return row?.lastBlock ?? this.deployment.startBlock - 1;
  }

  /** Xử lý tối đa 1 chunk. Trả về số block còn lại phía sau head đã biết. */
  async step(): Promise<{ processed: number; behind: number }> {
    // cacheTime 0: viem cache số block (mặc định = pollingInterval, và watcher chờ receipt cũng ghi vào cache này).
    // Head cũ làm catchUp() dừng sớm, bỏ sót event của các block vừa mine.
    const head = Number(await this.client.getBlockNumber({ cacheTime: 0 }));
    const last = await this.lastBlock();
    if (last >= head) {
      await this.saveState(last, head);
      return { processed: 0, behind: 0 };
    }
    const from = last + 1;
    const to = Math.min(head, last + this.chunk);
    let logs: Log[];
    try {
      logs = await this.client.getLogs({
        address: [
          this.deployment.IdentityRegistry,
          this.deployment.SocialGraph,
          this.deployment.Posts,
          this.deployment.PlanPayments,
        ],
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      });
    } catch (err) {
      // RPC công khai giới hạn range/kết quả: chia đôi chunk rồi thử lại ở vòng sau.
      // Bị rate limit thì giữ chunk (chia nhỏ chỉ làm gọi nhiều hơn); vòng `run` tự chờ lâu dần.
      if (!isRateLimited(err) && this.chunk > 10) this.chunk = Math.max(10, Math.floor(this.chunk / 2));
      throw err;
    }
    // Thành công thì nới chunk dần về mức ban đầu (lỗi tạm thời không kéo chậm cả quá trình bắt kịp).
    if (this.chunk < this.maxChunk) this.chunk = Math.min(this.maxChunk, this.chunk * 2);

    const blockNumbers = [...new Set(logs.map((l) => Number(l.blockNumber)))];
    const timestamps = new Map<number, number>();
    await Promise.all(
      blockNumbers.map(async (n) => {
        const b = await this.client.getBlock({ blockNumber: BigInt(n) });
        timestamps.set(n, Number(b.timestamp));
      }),
    );

    await this.db.transaction(async (tx) => {
      for (const l of logs) {
        let decoded: { eventName: string; args: unknown };
        try {
          decoded = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) as {
            eventName: string;
            args: unknown;
          };
        } catch {
          continue;
        }
        await applyEvent(
          tx,
          { eventName: decoded.eventName, args: (decoded.args ?? {}) as Record<string, unknown> },
          {
            blockNumber: Number(l.blockNumber),
            txHash: String(l.transactionHash).toLowerCase(),
            logIndex: Number(l.logIndex),
            timestamp: timestamps.get(Number(l.blockNumber)) ?? Math.floor(Date.now() / 1000),
          },
        );
      }
      await tx
        .insert(indexerState)
        .values({ id: this.stateId, chainId: this.deployment.chainId, lastBlock: to, headBlock: head })
        .onConflictDoUpdate({
          target: indexerState.id,
          set: { lastBlock: to, headBlock: head, updatedAt: new Date() },
        });
    });
    if (logs.length) this.log.debug({ from, to, logs: logs.length }, "indexed");
    return { processed: logs.length, behind: head - to };
  }

  private async saveState(last: number, head: number) {
    await this.db
      .insert(indexerState)
      .values({ id: this.stateId, chainId: this.deployment.chainId, lastBlock: last, headBlock: head })
      .onConflictDoUpdate({ target: indexerState.id, set: { headBlock: head, updatedAt: new Date() } });
  }

  /** Chạy tới khi bắt kịp head. Dùng cho replay và test. */
  async catchUp(): Promise<void> {
    for (;;) {
      const r = await this.step();
      if (r.behind === 0) return;
    }
  }

  async run(pollMs: number, signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const r = await this.step();
        this.lastError = null;
        failures = 0;
        if (r.behind > 0) continue;
      } catch (err) {
        failures++;
        this.lastError = (err as Error).message.slice(0, 300);
        this.log.warn(
          { err: this.lastError, failures, chunk: this.chunk, rateLimited: isRateLimited(err) },
          "indexer step failed",
        );
      }
      await new Promise((res) => setTimeout(res, failures ? backoffMs(pollMs, failures) : pollMs));
    }
  }
}
