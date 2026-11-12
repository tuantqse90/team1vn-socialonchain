"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/session";
import { DmIcon } from "./icons";

/** Nút "Nhắn tin" trên trang hồ sơ người khác. */
export function MessageButton({ address, size = "md" }: { address: string; size?: "md" | "lg" }) {
  const t = useTranslations("dm");
  const { status, owner } = useSession();
  if (status !== "ready" || owner?.toLowerCase() === address.toLowerCase()) return null;
  return (
    <Link
      href={`/messages/${address.toLowerCase()}`}
      aria-label={t("message")}
      title={t("message")}
      data-testid="message-user"
      className={`press flex shrink-0 items-center justify-center rounded-full border-[var(--line)] text-[var(--ink)] ${
        size === "lg" ? "h-12 w-12 border-[1.5px]" : "h-10 w-10 border"
      }`}
    >
      <DmIcon name="mail" className={size === "lg" ? "h-5 w-5" : "h-[19px] w-[19px]"} />
    </Link>
  );
}
