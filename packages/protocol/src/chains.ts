import { anvil, avalancheFuji, type Chain } from "viem/chains";

export type NetworkName = "local" | "fuji";

export type NetworkConfig = {
  name: NetworkName;
  chain: Chain;
  defaultRpcUrl: string;
  explorerUrl: string | null;
};

export const networks: Record<NetworkName, NetworkConfig> = {
  local: { name: "local", chain: anvil, defaultRpcUrl: "http://127.0.0.1:8545", explorerUrl: null },
  fuji: {
    name: "fuji",
    chain: avalancheFuji,
    defaultRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
  },
};

export function getNetwork(name: string | undefined): NetworkConfig {
  if (name === "fuji") return networks.fuji;
  return networks.local;
}

export function explorerTxUrl(network: NetworkConfig, hash: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/tx/${hash}` : null;
}

export function explorerAddressUrl(network: NetworkConfig, address: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/address/${address}` : null;
}
