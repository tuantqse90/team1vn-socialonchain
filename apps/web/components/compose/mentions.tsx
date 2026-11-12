"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import type { Author } from "@/lib/types";
import { Avatar } from "../bits";
import { Verified } from "../kit";

/** `@prefix` ngay trước con trỏ (đầu dòng hoặc sau khoảng trắng). Handle onchain: [a-z0-9_], tối đa 20 ký tự. */
const TOKEN = /(^|\s)@([a-z0-9_]{0,20})$/i;

export type MentionToken = { start: number; end: number; prefix: string };

export function mentionAt(text: string, caret: number): MentionToken | null {
  const m = TOKEN.exec(text.slice(0, caret));
  if (!m) return null;
  const prefix = m[2] ?? "";
  return { start: caret - prefix.length - 1, end: caret, prefix };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export type MentionUser = Author & { handle: string; address: string };

/** Gợi ý người để nhắc tên: `GET /search?q=` (debounce), chỉ người có handle onchain, khớp đầu handle lên trước. */
export function useMentionResults(prefix: string | null, viewer?: string): MentionUser[] {
  const q = useDebounced((prefix ?? "").toLowerCase(), 180);
  const enabled = q.length >= 1;
  const r = useQuery({
    queryKey: ["mention", q, viewer],
    queryFn: () => api<{ users: Author[] }>(`/search${qs({ q, viewer })}`),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const p = (prefix ?? "").toLowerCase();
  if (!enabled || !p) return [];
  // Dữ liệu cũ (placeholderData) có thể là của prefix trước: lọc lại theo prefix hiện tại.
  const byAddr = new Map<string, MentionUser>();
  for (const u of r.data?.users ?? []) {
    if (u.handle && u.address && u.handle.includes(p) && !byAddr.has(u.address))
      byAddr.set(u.address, u as MentionUser);
  }
  return [...byAddr.values()]
    .sort((a, b) => Number(b.handle.startsWith(p)) - Number(a.handle.startsWith(p)))
    .slice(0, 5);
}

/**
 * Danh sách gợi ý (role=listbox). Bàn phím do textarea xử lý qua `aria-activedescendant`
 * (mũi tên, Enter/Tab chọn, Esc đóng); chuột/chạm thì bấm thẳng vào dòng.
 */
export function MentionList({
  id,
  users,
  active,
  onPick,
  onHover,
}: {
  id: string;
  users: MentionUser[];
  active: number;
  onPick: (u: MentionUser) => void;
  onHover: (i: number) => void;
}) {
  const t = useTranslations("composer");
  return (
    <div
      id={id}
      role="listbox"
      aria-label={t("mention")}
      className="anim-drop flex flex-col rounded-[22px] bg-[var(--bg)] p-1.5 shadow-xl ring-1 ring-[var(--line)]"
      data-testid="mention-list"
    >
      {users.map((u, i) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: bàn phím đi qua textarea (aria-activedescendant), không qua từng dòng
        <div
          key={u.address}
          id={`${id}-${i}`}
          role="option"
          tabIndex={-1}
          aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(u)}
          className={`flex h-[52px] cursor-pointer items-center gap-2.5 rounded-2xl px-2.5 transition-colors ${
            i === active ? "bg-[var(--soft)]" : ""
          }`}
        >
          <Avatar author={{ ...u, contractsDeployed: 0 }} size={34} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">@{u.handle}</span>
          <Verified count={u.contractsDeployed} />
        </div>
      ))}
    </div>
  );
}
