"use client";

import { useEffect, useState } from "react";

/** Giây unix hiện tại, cập nhật mỗi `everyMs` (đồng hồ đếm ngược faucet, giờ reset quota). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Số giây tới nửa đêm UTC kế tiếp: quota biên dịch reset theo ngày UTC (indexer `utcDay`). */
export function untilUtcMidnight(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) / 1000;
  return Math.max(0, next - nowSec);
}

/** Thời lượng ngắn gọn: 6d / 5h / 12m (không cần dịch). */
export function shortDuration(sec: number): string {
  if (sec >= 86_400) return `${Math.ceil(sec / 86_400)}d`;
  if (sec >= 3_600) return `${Math.ceil(sec / 3_600)}h`;
  return `${Math.max(1, Math.ceil(sec / 60))}m`;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}
