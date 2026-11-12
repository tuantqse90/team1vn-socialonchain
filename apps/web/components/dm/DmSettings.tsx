"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { Group, Row } from "@/components/settings/rows";
import { useDmKeys } from "@/lib/dm";

/**
 * Mục Cài đặt › Tin nhắn: khoá nhắn tin trên thiết bị này (bật / gỡ khỏi máy).
 * Credit Twemoji (CC-BY 4.0) nằm trong sheet Giấy phép (`components/settings/LicensesSheet.tsx`).
 */
export function DmSettings() {
  const t = useTranslations("dm");
  const dm = useDmKeys();
  if (dm.status === "no-session") return null;
  const on = dm.status === "ready";
  return (
    <Group id="messages" label={t("settingsTitle")} testId="settings-dm">
      <Row icon="lock" label={on ? t("keyOn") : t("keyOff")}>
        {on ? (
          <button
            type="button"
            onClick={dm.forget}
            aria-label={t("forget")}
            title={t("forget")}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--err-ink)]"
          >
            <Icon name="trash" className="h-5 w-5" />
          </button>
        ) : (
          <Link
            href="/messages"
            className="press flex h-9 shrink-0 items-center rounded-full bg-[var(--ink)] px-3.5 text-[13px] font-semibold text-[var(--bg)]"
          >
            {t("enableBtn")}
          </Link>
        )}
      </Row>
    </Group>
  );
}
