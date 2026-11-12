"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { QuotaRing } from "@/components/billing/QuotaRing";
import { prefersReducedMotion } from "@/components/billing/time";
import { Icon } from "@/components/Icon";

/**
 * Trạng thái hết quota (biên dịch/ngày hoặc số feed): vòng đầy, 1 dòng, giờ reset, lối tắt lên Pro.
 * Đây là giới hạn của gói, không phải lỗi. Tăng `shake` để rung thẻ (bấm biên dịch khi đã hết lượt).
 */
export function LimitCard({
  kind,
  used,
  limit,
  reset,
  shake = 0,
}: {
  kind: "compile" | "feeds";
  used: number;
  limit: number;
  reset?: string;
  shake?: number;
}) {
  const t = useTranslations("builder");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shake || !ref.current || prefersReducedMotion()) return;
    ref.current.animate(
      [
        { transform: "none" },
        { transform: "translateX(-7px)", offset: 0.2 },
        { transform: "translateX(7px)", offset: 0.4 },
        { transform: "translateX(-5px)", offset: 0.6 },
        { transform: "translateX(4px)", offset: 0.8 },
        { transform: "none" },
      ],
      { duration: 500, easing: "cubic-bezier(.3,.7,.2,1)" },
    );
  }, [shake]);
  const title = kind === "compile" ? t("outToday") : t("feedsFull", { n: limit });
  return (
    <div
      ref={ref}
      role="status"
      data-testid={kind === "compile" ? "quota-hit" : "feeds-full"}
      className="anim-pop flex items-center gap-4 rounded-3xl bg-[var(--soft)] px-4 py-4"
    >
      <QuotaRing
        used={used}
        limit={limit}
        label={kind === "compile" ? t("compilesAria") : t("feedsAria")}
        color="var(--ink)"
        size={88}
        stroke={10}
        numberClass="text-[26px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[16px] font-bold tracking-[-0.01em]">{title}</span>
        <div className="flex flex-wrap items-center gap-2.5">
          {reset && (
            <span
              role="img"
              aria-label={`${t("resetsIn")} ${reset}`}
              title={`${t("resetsIn")} ${reset}`}
              className="mono flex items-center gap-1 text-[13px] font-semibold text-[var(--graphite)]"
            >
              <Icon name="refresh" className="h-[15px] w-[15px]" strokeWidth={2.4} />
              {reset}
            </span>
          )}
          <Link
            href="/billing"
            aria-label={t("toPro")}
            className="press flex h-11 items-center gap-2 rounded-full bg-[var(--ink)] pl-4 pr-2 text-[15px] font-bold text-[var(--bg)]"
          >
            Pro
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <Icon name="chevronr" className="h-[15px] w-[15px]" strokeWidth={2.6} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
