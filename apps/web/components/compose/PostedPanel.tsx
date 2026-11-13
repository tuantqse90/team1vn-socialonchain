"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { txUrl } from "@/lib/chain";
import { formatAvax } from "@/lib/format";
import type { Author } from "@/lib/types";
import { Avatar } from "../bits";
import { Icon } from "../Icon";
import { NoPopupIcon } from "./parts";

export type Posted = {
  text: string;
  channel: string | null;
  block: bigint;
  hash: string;
  fee: bigint;
  /** Thời gian từ lúc bấm đăng tới khi có receipt. */
  ms?: number;
};

/** Góc 10 hạt bung quanh dấu check. */
const BURST = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

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
  const tf = useTranslations("fx");
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
          className="anim-pop compose-glow absolute -right-2.5 -top-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border-4 border-[var(--bg)]"
          style={{ animationDelay: "150ms" }}
        >
          <Icon name="check" className="h-6 w-6" strokeWidth={3} />
          <span className="burst">
            {BURST.map((a, i) => (
              <i
                key={a}
                style={
                  {
                    "--a": `${a}deg`,
                    "--d": `${i % 2 ? 34 : 46}px`,
                    background: i % 3 === 1 ? "var(--warn)" : "var(--accent)",
                  } as CSSProperties
                }
              />
            ))}
          </span>
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

      {posted.ms !== undefined && (
        <span
          className="anim-rise -mt-3 flex items-center gap-1.5 rounded-full bg-[var(--ok-tint)] px-3 py-1 text-[13px] font-bold text-[var(--ok-ink)]"
          style={{ animationDelay: "250ms" }}
          data-testid="posted-time"
        >
          <span className="live-dot" style={{ width: 6, height: 6 }} aria-hidden />
          {tf("confirmedIn", { s: (posted.ms / 1000).toFixed(1) })}
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
