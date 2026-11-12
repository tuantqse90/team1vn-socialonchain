"use client";

import { Icon } from "@socialonchain/ui";
import { useTranslations } from "next-intl";
import { Button, Spinner } from "@/components/bits";
import type { useDmKeys } from "@/lib/dm";

/** Thẻ bật tin nhắn: 1 chữ ký ví (lần đầu thêm 1 chữ ký xác nhận khoá). */
export function EnableDm({ dm }: { dm: ReturnType<typeof useDmKeys> }) {
  const t = useTranslations("dm");
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-14 text-center" data-testid="dm-enable-card">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
        <Icon name="lock" className="h-7 w-7" />
      </span>
      <h2 className="text-[19px] font-bold tracking-tight">{t("enableTitle")}</h2>
      <p className="max-w-[320px] text-[14px] leading-relaxed text-[var(--muted)]">
        {dm.status === "stale" ? t("staleBody") : t("enableBody")}
      </p>
      <Button variant="accent" onClick={() => void dm.enable()} disabled={dm.enabling} testId="dm-enable">
        {dm.enabling ? <Spinner /> : <Icon name="key" className="h-4 w-4" />}
        {dm.enabling ? t("enabling") : t("enableBtn")}
      </Button>
      {dm.error && <p className="max-w-[320px] text-[12px] text-[var(--accent)]">{dm.error}</p>}
    </div>
  );
}
