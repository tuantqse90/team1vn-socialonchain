"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { orbBackground } from "@/lib/orb";
import { Icon, type IconName } from "../Icon";

/** Feed mặc định: icon + nhãn 1 từ. Feed tự tạo dùng icon layers + tên của nó. */
const DEFAULTS: Record<string, { icon: IconName; key: string }> = {
  "default:chronological": { icon: "clock", key: "fLatest" },
  "default:builders-shipping": { icon: "cube", key: "fBuilders" },
  "default:avalanche-no-shill": { icon: "peak", key: "fAvalanche" },
  "default:grants-hackathons": { icon: "trophy", key: "fGrants" },
  "default:founders": { icon: "briefcase", key: "fFounders" },
  "default:real-conversations": { icon: "chat", key: "fTalk" },
};

/**
 * Dải feed: ô tròn 58px + nhãn. Ô đang chọn tô mực, có badge đỏ "−N" (số bài feed này ẩn).
 * Ô "+" nét đứt ghim bên phải → tạo feed.
 */
export function FeedStrip({
  tabs,
  active,
  names,
  hidden,
  onSelect,
}: {
  tabs: string[];
  active: string;
  names: Map<string, string>;
  /** Số bài bị ẩn ở feed đang chọn (null khi chưa có dữ liệu). */
  hidden: number | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("home");
  const bar = useRef<HTMLDivElement>(null);

  // Ô đang chọn luôn nằm trong khung nhìn (ví dụ feed vừa tạo ở cuối danh sách).
  useEffect(() => {
    bar.current
      ?.querySelector<HTMLElement>(`[data-testid="tab-${CSS.escape(active)}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  return (
    <div className="sticky top-14 z-20 bg-[var(--bg)]">
      {/* biome-ignore lint/a11y/useSemanticElements: dải cuộn ngang flex; fieldset không hợp layout này */}
      <div
        ref={bar}
        role="group"
        aria-label={t("pickFeed")}
        className="no-scrollbar flex gap-1.5 overflow-x-auto pt-2 pb-2.5 pl-3 pr-[100px]"
      >
        {tabs.map((id) => {
          const d = DEFAULTS[id];
          const name = d ? t(d.key) : (names.get(id) ?? id.replace(/^default:/, ""));
          const on = id === active;
          const n = on && hidden ? hidden : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-label={name}
              aria-pressed={on}
              title={n ? `${name} · ${t("hiddenN", { n })}` : name}
              data-testid={`tab-${id}`}
              className="press flex w-[66px] shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={`relative flex h-[58px] w-[58px] items-center justify-center rounded-full ${
                  on
                    ? "text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),0_8px_18px_-10px_rgba(0,0,0,.55)]"
                    : "bg-[var(--soft)] text-[var(--ink)]"
                }`}
                style={{
                  // Đang chọn: cùng orb màu với ô feed ở trang Feeds.
                  background: on ? orbBackground(`feed:${id}`) : undefined,
                  transform: on ? "none" : "scale(.92)",
                  transition: "transform .45s var(--bouncy), background-color .3s, color .3s",
                }}
              >
                <Icon name={d?.icon ?? "layers"} className="h-[26px] w-[26px]" strokeWidth={1.9} />
                {n > 0 && (
                  <span
                    key={`${id}:${n}`}
                    aria-hidden
                    className="anim-pop absolute -top-1 -right-2 flex h-[22px] items-center gap-0.5 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] pr-1.5 pl-1 text-[11px] font-bold text-[var(--accent-ink)] tabular-nums"
                  >
                    <Icon name="eyeoff" className="h-3 w-3" strokeWidth={2.6} />
                    {n}
                  </span>
                )}
              </span>
              <span
                className={`line-clamp-2 w-full text-center text-[11px] leading-tight break-words ${
                  on ? "font-bold" : "font-medium"
                }`}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[100px]">
        <span aria-hidden className="w-7 bg-linear-to-r from-transparent to-[var(--bg)]" />
        <Link
          href="/feeds/new"
          aria-label={t("newFeedAria")}
          title={t("newFeedAria")}
          data-testid="tab-new"
          className="pointer-events-auto flex flex-1 flex-col items-center gap-1.5 bg-[var(--bg)] pt-2"
        >
          <span className="press flex h-[58px] w-[58px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--muted)] text-[var(--ink)]">
            <Icon name="plus" className="h-6 w-6" strokeWidth={2} />
          </span>
          <span className="text-[11px] font-medium">{t("newFeed")}</span>
        </Link>
      </div>
    </div>
  );
}
