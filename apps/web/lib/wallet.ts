"use client";

import { useCallback, useMemo } from "react";
import type { Abi, Hash, Hex, SignableMessage, TypedDataDefinition } from "viem";
import { chain } from "./chain";
import { useEmbeddedWallet, walletClientFor } from "./embedded";

/** Lỗi do người dùng huỷ (giữ cho code cũ; ví nhúng không có popup nên hầu như không xảy ra). */
export function isUserRejection(err: unknown): boolean {
  let e = err as { name?: string; code?: number; message?: string; cause?: unknown } | undefined;
  for (let i = 0; e && i < 6; i++) {
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
    if (/user (rejected|denied)|rejected the request/i.test(e.message ?? "")) return true;
    e = e.cause as typeof e;
  }
  return false;
}

class NoWalletError extends Error {
  constructor() {
    super("Chưa đăng nhập");
    this.name = "NoWalletError";
  }
}

/**
 * Ví chính (owner) = ví nhúng trong app: ký ngầm, không popup, luôn đúng chain của client (Fuji hoặc Anvil).
 * Giữ nguyên hình dạng API cũ (wrongNetwork/switchToApp…) để các màn không phải đổi.
 */
export function useMainWallet() {
  const { account, address } = useEmbeddedWallet();
  const client = useMemo(() => (account ? walletClientFor(account) : null), [account]);

  const need = useCallback(() => {
    if (!client || !account) throw new NoWalletError();
    return { client, account };
  }, [client, account]);

  const writeContract = useCallback(
    async (args: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }): Promise<Hash> => {
      const { client, account } = need();
      return client.writeContract({ ...args, account, chain } as Parameters<typeof client.writeContract>[0]);
    },
    [need],
  );

  const sendTransaction = useCallback(
    async (args: { to: `0x${string}`; value: bigint }): Promise<Hash> => {
      const { client, account } = need();
      return client.sendTransaction({ ...args, account, chain });
    },
    [need],
  );

  const signTypedData = useCallback(
    async (args: TypedDataDefinition): Promise<Hex> => need().account.signTypedData(args),
    [need],
  );

  const signMessage = useCallback(
    async (args: { message: SignableMessage }): Promise<Hex> => need().account.signMessage(args),
    [need],
  );

  const noop = useCallback(async () => undefined, []);

  return {
    address,
    ready: Boolean(account),
    wrongNetwork: false,
    walletChainId: chain.id as number,
    switching: false,
    switchToApp: noop,
    ensureChain: noop,
    writeContract,
    sendTransaction,
    signTypedData,
    signMessage,
  };
}
