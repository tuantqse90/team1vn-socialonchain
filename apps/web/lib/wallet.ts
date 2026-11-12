"use client";

import { useCallback } from "react";
import type { Abi, Hash } from "viem";
import { useAccount, useSendTransaction, useSignTypedData, useSwitchChain, useWriteContract } from "wagmi";
import { chain } from "./chain";

/** Lỗi do người dùng bấm huỷ trong ví (EIP-1193 code 4001 / viem UserRejectedRequestError). */
export function isUserRejection(err: unknown): boolean {
  let e = err as { name?: string; code?: number; message?: string; cause?: unknown } | undefined;
  for (let i = 0; e && i < 6; i++) {
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
    if (/user (rejected|denied)|rejected the request/i.test(e.message ?? "")) return true;
    e = e.cause as typeof e;
  }
  return false;
}

/**
 * Ví chính (owner): mọi tx/chữ ký đều ép `chainId` của client (Fuji hoặc Anvil local).
 * Ví đang ở mạng khác (vd. C-Chain mainnet 43114) thì xin chuyển mạng trước; không bao giờ gửi tx sang mạng khác.
 */
export function useMainWallet() {
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();
  const wrongNetwork = isConnected && chainId !== undefined && chainId !== chain.id;

  const ensureChain = useCallback(async () => {
    if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
  }, [chainId, switchChainAsync]);

  const writeContract = useCallback(
    async (args: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }): Promise<Hash> => {
      await ensureChain();
      return writeContractAsync({ ...args, chainId: chain.id } as Parameters<typeof writeContractAsync>[0]);
    },
    [ensureChain, writeContractAsync],
  );

  const sendTransaction = useCallback(
    async (args: { to: `0x${string}`; value: bigint }): Promise<Hash> => {
      await ensureChain();
      return sendTransactionAsync({ ...args, chainId: chain.id });
    },
    [ensureChain, sendTransactionAsync],
  );

  const signTypedData = useCallback(
    async (args: Parameters<typeof signTypedDataAsync>[0]) => {
      await ensureChain();
      return signTypedDataAsync(args);
    },
    [ensureChain, signTypedDataAsync],
  );

  return {
    wrongNetwork,
    walletChainId: chainId,
    switching,
    switchToApp: () => switchChainAsync({ chainId: chain.id }),
    ensureChain,
    writeContract,
    sendTransaction,
    signTypedData,
  };
}
