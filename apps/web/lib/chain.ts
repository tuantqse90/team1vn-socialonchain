import { getDeployment, getNetwork, hasDeployment } from "@socialonchain/protocol";
import { clientConfig } from "@/configs";

export const network = getNetwork(clientConfig.chain);
export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (clientConfig.chain === "fuji" ? network.defaultRpcUrl : "http://127.0.0.1:8545");
/** Chain với RPC đã cấu hình (connector/ví đọc `rpcUrls.default`, không chỉ transport của wagmi). */
export const chain = {
  ...network.chain,
  rpcUrls: { ...network.chain.rpcUrls, default: { http: [rpcUrl] } },
} as typeof network.chain;
export const deployed = hasDeployment(chain.id);
export const contracts = deployed ? getDeployment(chain.id) : null;

export function txUrl(hash: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/tx/${hash}` : null;
}
export function addressUrl(address: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/address/${address}` : null;
}

export const FAUCET_URL = "https://build.avax.network/console/primary-network/faucet";
