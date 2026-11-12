"use client";

import { Icon } from "@socialonchain/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useDmKeys } from "@/lib/dm";
import { shortAddr } from "@/lib/format";
import { DmIcon } from "./icons";

const head = "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

/** Mục Cài đặt: trạng thái khoá nhắn tin + giấy phép (credit Twemoji theo CC-BY 4.0). */
export function DmSettings() {
  const t = useTranslations("dm");
  const dm = useDmKeys();
  return (
    <>
      {dm.status !== "no-session" && (
        <section id="messages" className="border-b border-[var(--line)] px-4 py-5">
          <h2 className={head}>
            <DmIcon name="mail" className="h-4 w-4" />
            {t("settingsTitle")}
          </h2>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Icon name="lock" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              <span className="truncate">{dm.status === "ready" ? t("keyOn") : t("keyOff")}</span>
              {dm.keys && (
                <span className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                  {shortAddr(dm.keys.publicKey)}
                </span>
              )}
            </span>
            {dm.status === "ready" ? (
              <button
                type="button"
                onClick={dm.forget}
                className="press shrink-0 text-[13px] text-[var(--muted)] hover:text-[var(--accent)]"
              >
                {t("forget")}
              </button>
            ) : (
              <Link
                href="/messages"
                className="press shrink-0 text-[13px] font-semibold text-[var(--accent)]"
              >
                {t("enableBtn")}
              </Link>
            )}
          </div>
        </section>
      )}
      <section id="licenses" className="border-b border-[var(--line)] px-4 py-5">
        <h2 className={head}>
          <Icon name="copy" className="h-4 w-4" />
          {t("licenses")}
        </h2>
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          <a
            href="https://github.com/jdecked/twemoji"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            {t("twemoji")}
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            CC-BY 4.0
          </a>
        </p>
      </section>
    </>
  );
}
