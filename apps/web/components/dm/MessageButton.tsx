"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/session";
import { DmIcon } from "./icons";

/** Nút "Nhắn tin" trên trang hồ sơ người khác. */
export function MessageButton({ address }: { address: string }) {
  const t = useTranslations("dm");
  const { status, owner } = useSession();
  if (status !== "ready" || owner?.toLowerCase() === address.toLowerCase()) return null;
  return (
    <Link
      href={`/messages/${address.toLowerCase()}`}
      aria-label={t("message")}
      title={t("message")}
      data-testid="message-user"
      className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)]"
    >
      <DmIcon name="mail" className="h-[19px] w-[19px]" />
    </Link>
  );
}
