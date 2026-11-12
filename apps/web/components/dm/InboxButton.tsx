"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDmUnread } from "@/lib/dm";
import { useSession } from "@/lib/session";
import styles from "./dm.module.css";
import { DmIcon } from "./icons";

/**
 * Lối vào hộp thư: header (mobile) hoặc rail (desktop). Badge đỏ = số cuộc trò chuyện chưa đọc ở "Chính";
 * chấm nhỏ = có yêu cầu từ người lạ.
 */
export function InboxButton({ variant = "header" }: { variant?: "header" | "rail" }) {
  const t = useTranslations("dm");
  const { status } = useSession();
  const pathname = usePathname() || "/";
  const unread = useDmUnread();
  if (status !== "ready") return null;
  const main = unread.data?.main ?? 0;
  const requests = unread.data?.requests ?? 0;
  const active = pathname.startsWith("/messages");
  const rail = variant === "rail";
  return (
    <Link
      href="/messages"
      aria-label={main ? `${t("title")} (${main})` : t("title")}
      title={t("title")}
      data-testid={rail ? "nav-messages-rail" : "nav-messages"}
      className={`press relative flex items-center justify-center ${
        rail ? "h-14 w-14 rounded-2xl" : "h-11 w-11 md:hidden"
      } ${active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
    >
      <DmIcon name="mail" className={rail ? "h-[26px] w-[26px]" : "h-[23px] w-[23px]"} />
      {main > 0 ? (
        <span
          key={main}
          className={`${styles.pop} mono absolute ${rail ? "right-2 top-2" : "-right-0.5 -top-0.5"} flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-white`}
        >
          {main > 9 ? "9+" : main}
        </span>
      ) : requests > 0 ? (
        <span
          className={`absolute ${rail ? "right-3 top-3" : "right-1 top-1"} h-2 w-2 rounded-full bg-[var(--accent)]`}
        />
      ) : null}
    </Link>
  );
}
