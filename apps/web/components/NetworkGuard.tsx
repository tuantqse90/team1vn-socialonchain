"use client";

import { useTranslations } from "next-intl";
import { network } from "@/lib/chain";
import { useMainWallet } from "@/lib/wallet";
import { Icon } from "./Icon";

/** Ví đang ở mạng khác (vd. C-Chain mainnet): chip cảnh báo + nút chuyển về mạng của app. */
export function NetworkGuard() {
  const t = useTranslations("network");
  const { wrongNetwork, switching, switchToApp } = useMainWallet();
  if (!wrongNetwork) return null;
  const name = network.name === "fuji" ? "Fuji" : "Local";
  return (
    <button
      type="button"
      onClick={() => void switchToApp().catch(() => undefined)}
      disabled={switching}
      data-testid="wrong-network"
      className="press anim-shake inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--warn-tint)] px-3 text-[13px] font-semibold text-[var(--warn-ink)]"
      aria-label={`${t("wrong")} · ${t("switch", { name })}`}
    >
      {switching ? <span className="spinner" /> : <Icon name="alert" className="h-4 w-4" />}
      <span className="mono uppercase">{name}</span>
    </button>
  );
}
