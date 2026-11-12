"use client";

import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useAccount, useConnect, WagmiProvider } from "wagmi";
import { ComposeProvider } from "@/components/Compose";
import { TopUpProvider } from "@/components/TopUpSheet";
import { clientConfig } from "@/configs";
import { SessionProvider } from "@/lib/session";
import { TxProvider } from "@/lib/tx";
import { E2E_ACCOUNT, wagmiConfig } from "@/lib/wagmi";

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.dataset.theme === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Chỉ trong E2E: tự kết nối connector giả (account Anvil đã unlock), không cần extension ví. */
function E2EAutoConnect() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  useEffect(() => {
    const c = connectors[0];
    if (!isConnected && c) connect({ connector: c });
  }, [isConnected, connect, connectors]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  const dark = useIsDark();
  const rk = {
    accentColor: clientConfig.theme.accent,
    accentColorForeground: clientConfig.theme.accentInk,
    borderRadius: "large" as const,
  };
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={dark ? darkTheme(rk) : lightTheme(rk)} modalSize="compact">
          {E2E_ACCOUNT && <E2EAutoConnect />}
          <SessionProvider>
            <TxProvider>
              <TopUpProvider>
                <ComposeProvider>{children}</ComposeProvider>
              </TopUpProvider>
            </TxProvider>
          </SessionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
