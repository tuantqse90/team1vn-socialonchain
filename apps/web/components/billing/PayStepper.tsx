"use client";

import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/Icon";

export type PayPhase = "idle" | "permit" | "tx" | "done";

const STEPS: { key: "stepPermit" | "stepTx" | "stepPro"; icon: IconName }[] = [
  { key: "stepPermit", icon: "key" },
  { key: "stepTx", icon: "send" },
  { key: "stepPro", icon: "check" },
];

/** 3 nút PERMIT → 1 TX → PRO: nút đang chạy phóng to, nút xong tô đỏ, thanh nối chạy theo. */
export function PayStepper({ phase }: { phase: PayPhase }) {
  const t = useTranslations("billing");
  const at = phase === "permit" ? 0 : phase === "tx" ? 1 : phase === "done" ? 3 : -1;
  const prog = at < 0 ? 0 : at >= 3 ? 1 : at / 2;
  const label = STEPS.map((s) => t(s.key)).join(" → ");
  return (
    <div role="img" aria-label={label} className="relative mx-auto h-[66px] w-full max-w-[300px]">
      <span aria-hidden className="absolute left-5 right-5 top-[19px] h-0.5 bg-[var(--line)]" />
      <span
        aria-hidden
        className="absolute left-5 right-5 top-[19px] h-0.5 origin-left bg-[var(--accent)]"
        style={{ transform: `scaleX(${prog})`, transition: "transform .7s var(--spring)" }}
      />
      <div aria-hidden className="relative flex justify-between">
        {STEPS.map((s, i) => {
          const done = at > i;
          const active = at === i;
          return (
            <div key={s.key} className="flex w-10 flex-col items-center gap-[7px]">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  done
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : active
                      ? "bg-[var(--ink)] text-[var(--bg)]"
                      : "bg-[var(--soft)] text-[var(--muted)]"
                }`}
                style={{
                  transform: active ? "scale(1.12)" : "none",
                  transition: "background-color .3s, color .3s, transform .45s var(--bouncy)",
                }}
              >
                <Icon name={s.icon} className="h-[18px] w-[18px]" strokeWidth={2.1} />
              </span>
              <span
                className={`mono whitespace-nowrap text-[10.5px] font-semibold tracking-[.08em] ${
                  done || active ? "text-[var(--ink)]" : "text-[var(--muted)]"
                }`}
              >
                {t(s.key)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
