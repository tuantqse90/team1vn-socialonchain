"use client";

import { useTranslations } from "next-intl";
import { txUrl } from "@/lib/chain";
import { formatAvax } from "@/lib/format";
import type { Author } from "@/lib/types";
import { Avatar } from "../bits";
import { Icon } from "../Icon";
import { NoPopupIcon } from "./parts";

export type Posted = { text: string; channel: string | null; block: bigint; hash: string; fee: bigint };

/** Trạng thái đã đăng (trong sheet, ~1.5 s): thẻ bài + dấu check, block #N → explorer, gas đã trả từ session key. */
export function PostedPanel({
  posted,
  author,
  name,
}: {
  posted: Posted;
  author: Pick<
    Author,
    "avatarUrl" | "address" | "handle" | "fcUsername" | "displayName" | "fid" | "contractsDeployed"
  >;
  name: string;
}) {
  const t = useTranslations("composer");
  const tc = useTranslations("common");
  const url = txUrl(posted.hash);
  const fee = formatAvax(posted.fee, 4);
  const paid = t("paid", { amount: fee });
  const block = `#${posted.block.toLocaleString("en-US")}`;
  return (
    <div role="status" className="flex flex-col items-center gap-5 pb-2 pt-3" data-testid="composer-posted">
      <span className="sr-only">{t("posted")}</span>
      <div className="anim-rise relative w-full rounded-[26px] border border-[var(--line)] bg-[var(--bg)] p-4 shadow-xl">
        <div className="flex items-center gap-2.5">
          <Avatar author={author} size={32} />
          <span className="min-w-0 truncate text-sm font-bold">{name}</span>
          {posted.channel && (
            <span className="mono shrink-0 rounded-full bg-[var(--soft)] px-2 py-0.5 text-[11.5px] font-semibold">
              /{posted.channel}
            </span>
          )}
        </div>
        <p className="mt-2.5 line-clamp-6 whitespace-pre-wrap break-words text-base leading-[1.45]">
          {posted.text}
        </p>
        <span
          aria-hidden
          className="anim-pop absolute -right-2.5 -top-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border-4 border-[var(--bg)] bg-[var(--ink)] text-[var(--bg)]"
          style={{ animationDelay: "150ms" }}
        >
          <Icon name="check" className="h-6 w-6" strokeWidth={3} />
        </span>
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${tc("viewTx")} ${block}`}
          className="anim-rise mono text-[30px] font-semibold tracking-[-0.02em] tabular-nums"
          style={{ animationDelay: "200ms" }}
        >
          {block}
        </a>
      ) : (
        <span
          className="anim-rise mono text-[30px] font-semibold tracking-[-0.02em] tabular-nums"
          style={{ animationDelay: "200ms" }}
        >
          {block}
        </span>
      )}

      <div className="anim-rise flex items-center gap-2" style={{ animationDelay: "300ms" }}>
        <span
          role="img"
          aria-label={paid}
          title={paid}
          className="mono flex h-11 items-center gap-2 rounded-full bg-[var(--soft)] pl-3 pr-4 text-[13px] font-semibold tabular-nums"
        >
          <Icon name="key" className="h-4 w-4" strokeWidth={2.4} />−{fee} AVAX
        </span>
        <span
          role="img"
          aria-label={t("noPopup")}
          title={t("noPopup")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--soft)]"
        >
          <NoPopupIcon className="h-5 w-5" />
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={tc("viewTx")}
            title={tc("viewTx")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--bg)]"
          >
            <Icon name="external" className="h-4 w-4" strokeWidth={2.2} />
          </a>
        )}
      </div>
    </div>
  );
}
