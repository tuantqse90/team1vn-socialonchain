"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/billing/time";
import { Avatar } from "@/components/bits";
import { displayName } from "@/lib/format";
import type { Post } from "@/lib/types";

/**
 * Preview của feed: hàng gọn (avatar, tên, 1 dòng), huy hiệu ↑n/↓n so với lần preview trước.
 * Hàng trượt tới vị trí mới (FLIP, chỉ transform) mỗi khi bật/tắt rule.
 */
export function PreviewRows({ posts, prev }: { posts: Post[]; prev: Map<string, number> | null }) {
  const t = useTranslations("builder");
  const ref = useRef<HTMLUListElement>(null);
  const tops = useRef(new Map<string, number>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: đo lại vị trí mỗi khi danh sách đổi
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const had = tops.current.size > 0;
    const next = new Map<string, number>();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.id;
      if (!id) continue;
      const top = child.offsetTop;
      next.set(id, top);
      if (reduce || !had) continue;
      const old = tops.current.get(id);
      if (old === undefined) {
        child.animate([{ transform: "translateX(-28px)" }, { transform: "none" }], {
          duration: 460,
          easing: "cubic-bezier(.2,.9,.25,1)",
        });
      } else if (old !== top) {
        child.animate([{ transform: `translateY(${old - top}px)` }, { transform: "none" }], {
          duration: 620,
          easing: "cubic-bezier(.2,.9,.25,1)",
        });
      }
    }
    tops.current = next;
  }, [posts]);

  return (
    <ul ref={ref} className="relative" data-testid="preview">
      {posts.map((p, i) => {
        const was = prev?.get(p.id);
        const d = prev && was !== undefined ? was - i : null;
        const isNew = prev !== null && was === undefined;
        const badge = isNew ? "+" : d === null || d === 0 ? "·" : d > 0 ? `↑${d}` : `↓${-d}`;
        const up = isNew || (d !== null && d > 0);
        const aria = isNew
          ? t("rankNew")
          : d === null || d === 0
            ? t("rankSame")
            : d > 0
              ? t("rankUp", { n: d })
              : t("rankDown", { n: -d });
        return (
          <li
            key={p.id}
            data-id={p.id}
            className="relative flex h-14 items-center gap-3 bg-[var(--bg)] px-4"
            style={{ zIndex: 40 - Math.min(i, 39) }}
          >
            <Avatar author={p.author} size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold">{displayName(p.author)}</span>
              <span className="truncate text-[13px] text-[var(--muted)]">{p.text}</span>
            </div>
            <span
              role="img"
              aria-label={aria}
              title={aria}
              className={`mono flex h-[26px] min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-[12px] font-semibold transition-colors ${
                up ? "bg-[var(--blush)] text-[var(--red-ink)]" : "bg-[var(--soft)] text-[var(--muted)]"
              }`}
            >
              {badge}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
