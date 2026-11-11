import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coreWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { Address } from "viem";
import { createConfig, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { clientConfig } from "@/configs";
import { chain, rpcUrl } from "./chain";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";
/** E2E (Playwright): connector giả dùng account đã unlock của Anvil, không cần extension. */
export const E2E_ACCOUNT = (process.env.NEXT_PUBLIC_E2E_ACCOUNT || "") as Address | "";

const connectors = E2E_ACCOUNT
  ? [mock({ accounts: [E2E_ACCOUNT], features: { reconnect: true } })]
  : connectorsForWallets(
      [
        {
          groupName: "Wallets",
          // Không có WalletConnect projectId thì chỉ dùng ví đã cài (Core, MetaMask, Rabby… qua EIP-6963).
          wallets: projectId
            ? [coreWallet, metaMaskWallet, rabbyWallet, walletConnectWallet]
            : [injectedWallet],
        },
      ],
      { appName: clientConfig.appName, projectId: projectId || "socialonchain-no-walletconnect" },
    );

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});
