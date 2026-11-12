"use client";

import { Avatar } from "@/components/bits";
import type { Author } from "@/lib/types";
import { plain } from "./text";

/**
 * Chồng avatar chồng lên nhau, có viền màu nền. Đổi `step` (khoảng cách) là các avatar trượt ra/vào bằng spring
 * (chỉ transform). Trang trí: luôn aria-hidden, nhãn đặt ở phần tử cha.
 */
export function AvatarStack({
  authors,
  size = 32,
  step = 18,
  width,
  ring = "var(--bg)",
  stagger = 30,
}: {
  authors: Author[];
  size?: number;
  step?: number;
  /** Bề rộng cố định (khi stack có thể xoè ra, đặt bằng bề rộng lúc xoè để không nhảy layout). */
  width?: number;
  ring?: string;
  /** Độ trễ giữa các avatar khi trượt (ms). */
  stagger?: number;
}) {
  const n = authors.length;
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0"
      style={{ width: width ?? size + step * Math.max(0, n - 1), height: size }}
    >
      {authors.map((a, i) => (
        <span
          key={a.address ?? `fid:${a.fid}`}
          className="absolute left-0 top-0 inline-flex rounded-full"
          style={{
            zIndex: n - i,
            boxShadow: `0 0 0 2px ${ring}`,
            transform: `translateX(${i * step}px)`,
            transition: `transform .55s var(--bouncy) ${i * stagger}ms`,
          }}
        >
          <Avatar author={plain(a)} size={size} />
        </span>
      ))}
    </span>
  );
}
