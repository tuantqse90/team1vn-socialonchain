"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import s from "./onboarding.module.css";

/** Hàng trên: nút quay lại (tuỳ chọn) + "Bỏ qua" (luôn có, về bảng tin đọc trước). */
export function TopBar({
  onBack,
  skip = true,
  skipClass = "text-[var(--muted)]",
  children,
}: {
  onBack?: () => void;
  skip?: boolean;
  skipClass?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("onboarding");
  return (
    <div className="relative z-10 -mx-4 flex h-11 items-center">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="press flex h-11 w-11 items-center justify-center"
        >
          <Icon name="left" className="h-6 w-6" strokeWidth={2} />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {skip && (
        <Link
          href="/"
          className={`press flex h-11 items-center px-4 text-[15px] font-semibold ${skipClass}`}
          data-testid="welcome-skip"
        >
          {t("skip")}
        </Link>
      )}
    </div>
  );
}

/** Chấm tiến độ: chấm đang ở là viên dài màu accent. */
export function Dots({ total = 3, at }: { total?: number; at: number }) {
  return (
    <div aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: chấm cố định
          key={i}
          className={`${s.dot} ${i === at ? s.dotOn : i < at ? s.dotDone : ""}`}
        />
      ))}
    </div>
  );
}

/** Thanh dưới: chấm tiến độ + nút tròn "Tiếp tục". */
export function StepBar({
  at,
  onNext,
  disabled,
  testId,
}: {
  at: number;
  onNext: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <div className={`mt-auto flex h-16 items-center justify-between pt-6 ${s.stepBar}`}>
      <Dots at={at} />
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label={t("continue")}
        className={s.nextBtn}
        data-testid={testId}
      >
        <Arrow className="h-6 w-6" />
      </button>
    </div>
  );
}

/** Mũi tên → (dùng trong nút lớn), nhích nhẹ để mời bấm. */
export function Arrow({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span className={s.nudge} style={{ display: "inline-flex" }}>
      <Icon name="up" className={`${className} rotate-90`} strokeWidth={2.4} />
    </span>
  );
}
