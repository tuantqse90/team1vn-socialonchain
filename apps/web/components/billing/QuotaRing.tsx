"use client";

import { useEffect, useState } from "react";
import { BigRing } from "@/components/kit";

/**
 * Vòng quota lớn: số đã dùng ở giữa, "/giới hạn" bên dưới. Vòng chạy từ 0 lên khi mount
 * (đổi `key` để chạy lại, vd. sau khi lên Pro).
 */
export function QuotaRing({
  used,
  limit,
  label,
  color = "var(--accent)",
  size = 148,
  stroke = 14,
  numberClass = "text-[46px]",
  pop = false,
}: {
  used: number;
  limit: number;
  label: string;
  color?: string;
  size?: number;
  stroke?: number;
  numberClass?: string;
  pop?: boolean;
}) {
  const target = Math.min(1, used / Math.max(1, limit));
  const [value, setValue] = useState(0);
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setValue(target));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [target]);
  return (
    <BigRing value={value} size={size} stroke={stroke} color={color} label={`${label}: ${used}/${limit}`}>
      <span
        aria-hidden
        className={`${numberClass} font-extrabold leading-none tracking-[-0.05em] tabular-nums ${pop ? "anim-pop" : ""}`}
      >
        {used}
      </span>
      <span aria-hidden className="mono mt-1 text-[12px] font-semibold text-[var(--muted)]">
        /{limit}
      </span>
    </BigRing>
  );
}
