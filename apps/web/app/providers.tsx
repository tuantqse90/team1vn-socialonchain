"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { ComposeProvider } from "@/components/Compose";
import { TopUpProvider } from "@/components/TopUpSheet";
import { SessionProvider } from "@/lib/session";
import { TxProvider } from "@/lib/tx";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <SessionProvider>
          <TxProvider>
            <TopUpProvider>
              <ComposeProvider>{children}</ComposeProvider>
            </TopUpProvider>
          </TxProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
