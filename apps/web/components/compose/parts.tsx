"use client";

import { DEFAULT_SESSION_FUNDING_WEI, KNOWN_CHANNELS, MAX_POST_BYTES } from "@socialonchain/protocol";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { formatAvax } from "@/lib/format";
import { gasLevel, useSession } from "@/lib/session";
import { Ring } from "../bits";
import { Icon } from "../Icon";
import { useTopUp } from "../TopUpSheet";

/** Ví có gạch chéo: "không popup ví" (chỉ icon, nghĩa nằm ở aria-label). */
export function NoPopupIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M3 3l18 18" />
    </svg>
  );
}

/** Chip gas của session key: vòng (số dư / 0.05) + số dư mono. Chạm → sheet nạp gas. */
export function GasChip({ small = false }: { small?: boolean }) {
  const t = useTranslations("composer");
  const { sessionBalance } = useSession();
  const topUp = useTopUp();
  if (sessionBalance === undefined) return null;
  const level = gasLevel(sessionBalance);
  const warn = level !== "ok";
  const amount = formatAvax(sessionBalance, 4);
  const label = t("gas", { amount });
  return (
    <button
      type="button"
      onClick={() => topUp.open(level === "ok" ? "manual" : level)}
      aria-label={label}
      title={label}
      className="press flex h-11 shrink-0 items-center"
      data-testid="composer-gas"
    >
      <span
        className={`flex items-center gap-2 rounded-full transition-colors ${small ? "h-8 pl-1 pr-2.5" : "h-9 pl-[5px] pr-3"} ${
          warn ? "bg-[var(--blush)] text-[var(--red-ink)]" : "bg-[var(--soft)] text-[var(--ink)]"
        } ${level === "empty" ? "anim-halo" : ""}`}
      >
        <span className="relative inline-flex">
          <Ring
            value={Number(sessionBalance) / Number(DEFAULT_SESSION_FUNDING_WEI)}
            size={small ? 22 : 26}
            stroke={3}
            danger={warn}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <Icon name="key" className={small ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.6} />
          </span>
        </span>
        <span className={`mono font-semibold tabular-nums ${small ? "text-[12px]" : "text-[13px]"}`}>
          {amount}
        </span>
      </span>
    </button>
  );
}

/** Vòng 1024 byte, luôn hiện số byte; đỏ từ 90%; rung mỗi lần gõ thêm khi đã quá giới hạn. */
export function ByteRing({ bytes, size = 40 }: { bytes: number; size?: number }) {
  const t = useTranslations("composer");
  const frac = bytes / MAX_POST_BYTES;
  const danger = frac >= 0.9;
  const over = bytes > MAX_POST_BYTES;
  const stroke = size >= 40 ? 3.5 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const label = t("bytes", { n: bytes, max: MAX_POST_BYTES });
  return (
    <span
      // Đổi key khi đã quá giới hạn để animation rung chạy lại mỗi lần gõ thêm.
      key={over ? `over-${bytes}` : "ok"}
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex shrink-0 ${over ? "anim-shake" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={danger ? "var(--accent)" : "var(--ink)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, frac)} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray .2s var(--spring), stroke .3s" }}
        />
      </svg>
      <span
        aria-hidden
        className={`mono absolute inset-0 flex items-center justify-center font-semibold tabular-nums ${
          size >= 40 ? "text-[10px]" : "text-[9px]"
        } ${danger ? "text-[var(--red-ink)]" : "text-[var(--graphite)]"}`}
      >
        {bytes}
      </span>
    </span>
  );
}

/** Pill chọn kênh "/avalanche ▾" (hoặc "Kênh"). `locked`: kênh do trang kênh truyền vào, không đổi được. */
export function ChannelPill({
  value,
  open,
  locked,
  onToggle,
}: {
  value: string | null;
  open: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("composer");
  const label = value ? `/${value}` : t("channel");
  if (locked) {
    return (
      <span className="mono inline-flex h-[26px] items-center self-start rounded-full bg-[var(--soft)] px-2.5 text-[12.5px] font-semibold">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={t("channelAria", { name: value ? `/${value}` : t("noChannel") })}
      className="press -ml-0.5 flex h-[34px] items-center self-start"
      data-testid="composer-channel"
    >
      <span
        className={`mono inline-flex h-[26px] items-center gap-0.5 rounded-full pl-2.5 pr-1.5 text-[12.5px] font-semibold transition-colors ${
          open ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--ink)]"
        }`}
      >
        {label}
        <span
          className="inline-flex"
          style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: "transform .35s var(--bouncy)" }}
        >
          <Icon name="chevron" className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      </span>
    </button>
  );
}

/** Các chip kênh bật ra lần lượt. */
export function ChannelChips({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (c: string | null) => void;
}) {
  const t = useTranslations("composer");
  const options: (string | null)[] = [...KNOWN_CHANNELS, null];
  return (
    <fieldset aria-label={t("channel")} className="flex min-w-0 flex-wrap gap-2">
      {options.map((c, i) => {
        const on = c === value;
        return (
          <button
            key={c ?? "none"}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(c)}
            className={`press anim-pop mono h-11 rounded-full px-4 text-[13px] font-semibold transition-colors ${
              on ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--ink)]"
            }`}
            style={{ animationDelay: `${i * 30}ms` } as CSSProperties}
          >
            {c ? `/${c}` : t("noChannel")}
          </button>
        );
      })}
    </fieldset>
  );
}
