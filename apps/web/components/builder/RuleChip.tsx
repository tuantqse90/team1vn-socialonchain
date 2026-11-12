"use client";

import type { Rule } from "@socialonchain/feed-sdk";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ruleIcon } from "./ruleIcon";

/** Rule của FeedSpec dạng chip: bấm để bật/tắt, preview rank() chạy lại ngay. */
export function RuleChip({
  rule,
  text,
  on,
  onToggle,
  delay = 0,
}: {
  rule: Rule;
  text: string;
  on: boolean;
  onToggle: () => void;
  delay?: number;
}) {
  const t = useTranslations("builder");
  const boost = rule.action === "boost";
  const hide = rule.action === "hide";
  const weight = hide ? t("hideShort") : `${boost ? "+" : "−"}${(rule.weight ?? 0.5).toFixed(1)}`;
  const act = boost ? t("actBoost") : hide ? t("actHide") : t("actDown");
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="rule"
      aria-pressed={on}
      title={`${act}: ${text}`}
      className={`press anim-pop flex min-h-11 max-w-full items-center gap-[7px] rounded-[22px] py-1 pl-1 pr-3 text-left text-[13px] font-semibold transition-colors ${
        on ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--muted)]"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          on
            ? boost
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--graphite)] text-[var(--bg)]"
            : "bg-[var(--line)] text-[var(--muted)]"
        }`}
      >
        <Icon name={ruleIcon(rule)} className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      <span className="sr-only">{act}: </span>
      <span className={`min-w-0 ${on ? "" : "line-through"}`}>{text}</span>
      <span className="mono shrink-0 text-[11px] font-medium opacity-80">{weight}</span>
    </button>
  );
}
