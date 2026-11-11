import { type Db, workerState } from "@socialonchain/db";
import { type LabelBatch, type LabelItem, signLabelBatch } from "@socialonchain/protocol";
import type { LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { WorkerEnv } from "./env";

/** Anvil account #9: key CÔNG KHAI của Anvil, chỉ dùng cho labeler ở local. */
const DEV_LABELER_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

export function labelerAccount(env: WorkerEnv): LocalAccount | null {
  if (env.LABELER_PRIVATE_KEY) return privateKeyToAccount(env.LABELER_PRIVATE_KEY as `0x${string}`);
  if (env.NETWORK === "local") return privateKeyToAccount(DEV_LABELER_KEY);
  return null;
}

/** Gửi nhãn cho indexer. Mặc định qua HTTP (POST /labels) như mọi labeler bên thứ ba. */
export type LabelSink = (batch: LabelBatch, signature: `0x${string}`) => Promise<void>;

export function httpSink(indexerUrl: string): LabelSink {
  return async (batch, signature) => {
    const res = await fetch(`${indexerUrl.replace(/\/$/, "")}/labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch, signature }),
    });
    if (!res.ok) throw new Error(`POST /labels ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}

export async function submitLabels(
  account: LocalAccount,
  sink: LabelSink,
  items: LabelItem[],
): Promise<number> {
  for (let i = 0; i < items.length; i += 1000) {
    const batch: LabelBatch = {
      v: 1,
      labeler: account.address,
      issuedAt: Math.floor(Date.now() / 1000),
      items: items.slice(i, i + 1000),
    };
    await sink(batch, await signLabelBatch(account, batch));
  }
  return items.length;
}

/** Ghi trạng thái job cho trang /status. Không bao giờ ghi secret. */
export async function recordState(db: Db, key: string, value: Record<string, unknown>): Promise<void> {
  await db
    .insert(workerState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: workerState.key, set: { value, updatedAt: new Date() } });
}

export async function runJob<T extends Record<string, unknown>>(
  db: Db,
  key: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const started = Date.now();
  try {
    const result = await fn();
    await recordState(db, key, {
      ok: true,
      at: new Date().toISOString(),
      ms: Date.now() - started,
      ...result,
    });
    return result;
  } catch (err) {
    await recordState(db, key, {
      ok: false,
      at: new Date().toISOString(),
      error: (err as Error).message.slice(0, 300),
    });
    throw err;
  }
}
