import { createConfig, http } from "wagmi";
import { chain, rpcUrl } from "./chain";

/**
 * wagmi chỉ còn dùng để ĐỌC chain (useReadContract, useBalance…). Không có connector:
 * mọi tx/chữ ký của owner đi qua ví nhúng (`lib/embedded.ts`, `lib/wallet.ts`), không popup.
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [],
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});
