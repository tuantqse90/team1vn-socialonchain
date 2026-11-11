"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { type Abi, createPublicClient, type Hash, http } from "viem";
import { Icon } from "@/components/Icon";
import { api } from "./api";
import { chain, rpcUrl, txUrl } from "./chain";
import { useSession } from "./session";

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 500 });

type Toast = { id: number; state: "sent" | "ok" | "fail"; hash?: string; label: string; error?: string };
type TxCtx = {
  /** Chạy 1 tx, hiện toast có link explorer, đợi receipt, đợi indexer bắt kịp, rồi làm mới dữ liệu. */
  track: (label: string, send: () => Promise<Hash>) => Promise<boolean>;
};
const Ctx = createContext<TxCtx | null>(null);

async function waitIndexed(block: bigint) {
  for (let i = 0; i < 20; i++) {
    try {
      const s = await api<{ indexer: { lastBlock: number } | null }>("/status");
      if (s.indexer && BigInt(s.indexer.lastBlock) >= block) return;
    } catch {
      // API tạm lỗi: thử lại
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function TxProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const qc = useQueryClient();
  const t = useTranslations("common");

  const update = useCallback(
    (id: number, patch: Partial<Toast>) =>
      setToasts((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    [],
  );

  const track = useCallback(
    async (label: string, send: () => Promise<Hash>) => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all.slice(-3), { id, state: "sent", label }]);
      try {
        const hash = await send();
        update(id, { hash });
        const r = await publicClient.waitForTransactionReceipt({ hash, retryDelay: 150 });
        if (r.status !== "success") throw new Error("reverted");
        update(id, { state: "ok" });
        await waitIndexed(r.blockNumber);
        await qc.invalidateQueries();
        setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 6000);
        return true;
      } catch (err) {
        const msg =
          (err as { shortMessage?: string; message?: string }).shortMessage ?? (err as Error).message;
        update(id, { state: "fail", error: msg.slice(0, 140) });
        setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 9000);
        return false;
      }
    },
    [qc, update],
  );

  return (
    <Ctx.Provider value={{ track }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((x) => {
          const url = x.hash ? txUrl(x.hash) : null;
          return (
            <div
              key={x.id}
              data-testid={`tx-${x.state}`}
              className="toast pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm text-[var(--bg)] shadow-lg"
            >
              {x.state === "sent" && <span className="spinner" aria-hidden />}
              {x.state === "ok" && <Icon name="check" className="h-4 w-4 text-emerald-400" />}
              {x.state === "fail" && <Icon name="alert" className="h-4 w-4 text-[var(--accent)]" />}
              <span className="flex-1 truncate">
                {x.label} ·{" "}
                {x.state === "sent"
                  ? t("txSent")
                  : x.state === "ok"
                    ? t("txConfirmed")
                    : x.error || t("txFailed")}
              </span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 opacity-80 hover:opacity-100"
                >
                  <Icon name="external" className="h-4 w-4" />
                  <span className="sr-only">{t("viewTx")}</span>
                </a>
              )}
              {!url && x.hash && <span className="mono text-xs opacity-60">{x.hash.slice(0, 10)}</span>}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useTx(): TxCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTx outside TxProvider");
  return c;
}

/** Ghi contract bằng session key (không popup ví). */
export function useSessionWrite() {
  const { sessionWallet } = useSession();
  const { track } = useTx();
  return useCallback(
    async (
      label: string,
      call: { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] },
    ) => {
      if (!sessionWallet?.account) throw new Error("no session key");
      const wallet = sessionWallet;
      return track(label, () =>
        wallet.writeContract({ ...call, account: wallet.account!, chain } as Parameters<
          typeof wallet.writeContract
        >[0]),
      );
    },
    [sessionWallet, track],
  );
}
