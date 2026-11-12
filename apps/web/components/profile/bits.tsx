"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { CountUp } from "@/components/kit";
import { compact } from "@/lib/format";

/** Số chạy từ 0 lên khi vừa hiện, rồi chạy tiếp khi giá trị đổi (vd. +1 follower). */
export function RollUp({ value, className = "" }: { value: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <CountUp value={v} duration={900} className={className} format={(x) => compact(Math.round(x))} />;
}

/** Dấu Verified builder (seal đỏ, check). */
export function Seal({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5l2.4 1.8 3-.1.9 2.8 2.4 1.8-.9 2.8.9 2.8-2.4 1.8-.9 2.8-3-.1L12 21.5l-2.4-1.8-3 .1-.9-2.8-2.4-1.8.9-2.8-.9-2.8 2.4-1.8.9-2.8 3 .1z"
        fill="var(--accent)"
      />
      <path
        d="M8.5 12.2l2.4 2.4 4.6-4.8"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Nút chia sẻ profile: Web Share nếu có, không thì chép link (check bật lên). */
export function ShareButton({ title, path, wide = false }: { title: string; path: string; wide?: boolean }) {
  const t = useTranslations("profile");
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard bị chặn
    }
  }

  const icon = copied ? (
    <Icon name="check" className="anim-pop h-5 w-5 text-[var(--ok-ink)]" strokeWidth={2.4} />
  ) : (
    <Icon name="share" className="h-5 w-5" strokeWidth={2} />
  );
  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? t("linkCopied") : t("share")}
      title={t("share")}
      className={`press flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border-[1.5px] border-[var(--line)] text-[15px] font-bold ${
        wide ? "flex-1" : "w-12"
      }`}
      data-testid="share"
    >
      {icon}
      {wide && <span>{copied ? t("linkCopied") : t("share")}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? t("linkCopied") : ""}
      </span>
    </button>
  );
}
