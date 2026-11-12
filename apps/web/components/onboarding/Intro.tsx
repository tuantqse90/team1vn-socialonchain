"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { IdCard } from "@/components/IdCard";
import { clientConfig } from "@/configs";
import s from "./onboarding.module.css";
import { Arrow, StepBar, TopBar } from "./parts";
import { ROLES, type Role } from "./picks";
import { blankFields } from "./RoleSteps";

/** Dữ liệu mẫu hư cấu cho splash (không phải người thật). */
const SAMPLE = {
  builder: { handle: "linh_builds", addr: "0x2b9E7d1C4a5F3e8B0c6D2a9F1e4C7b3A8d5e41aa", block: 38109227 },
  student: { handle: "minh_k21", addr: "0x91cA4e7B2d8F6a3C5e1D9b0A7f4E2c8B6d3a07f2", block: 38190551 },
  reader: { handle: "thu_reads", addr: "0x5d0B8e2A7c4F1a9E3b6D0c8A2f5E7b1C9d4e3b61", block: 38201018 },
};

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--fixed-ink)" />
      <path
        d="M8.5 9.5L19.5 9.5L14 19Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="9.5" r="2.4" fill="var(--accent)" />
      <circle cx="19.5" cy="9.5" r="2.4" fill="var(--accent)" />
      <circle cx="14" cy="19" r="2.4" fill="var(--accent)" />
    </svg>
  );
}

/** Splash: nền đỏ, 3 thẻ xoè trôi nhẹ, tagline 3 dòng, nút "Bắt đầu". */
export function Splash({ onStart }: { onStart: () => void }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  const locale = useLocale() as "en" | "vi";
  const lines = clientConfig.tagline[locale].split(/(?<=\.)\s+/).filter(Boolean);
  const fans: {
    role: Role;
    style: CSSProperties;
    floatDelay: string;
    fields: { k: string; v: string }[];
  }[] = [
    {
      role: "student",
      style: { transform: "translate(-4px, -118px) rotate(-12deg) scale(.78)", animationDelay: ".35s" },
      floatDelay: "-1.5s",
      fields: [
        { k: tc("goals"), v: "HACKATHON" },
        { k: tc("rule"), v: "3" },
        { k: tc("feed"), v: "7" },
      ],
    },
    {
      role: "reader",
      style: { transform: "translate(14px, -58px) rotate(6deg) scale(.78)", animationDelay: ".5s" },
      floatDelay: "-4s",
      fields: [
        { k: tc("see"), v: "AI · DEFI" },
        { k: tc("less"), v: t("less_price").toLocaleUpperCase() },
        { k: tc("rule"), v: "4" },
      ],
    },
    {
      role: "builder",
      style: { transform: "rotate(-3deg) scale(.84)" },
      floatDelay: "0s",
      fields: [
        { k: tc("contract"), v: "17" },
        { k: tc("chain"), v: "3" },
        { k: tc("status"), v: tc("verifiedValue") },
      ],
    },
  ];

  return (
    <>
      <svg aria-hidden className={s.bgRings} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <g className={s.bgRot} fill="none" stroke="var(--fixed-ink)" strokeWidth=".7" opacity=".1">
          {Array.from({ length: 8 }, (_, k) => (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: vòng trang trí cố định
              key={k}
              cx="195"
              cy="360"
              r={70 + k * 38}
              strokeDasharray={`${(2 + k * 0.6).toFixed(1)} ${3 + k}`}
            />
          ))}
        </g>
      </svg>

      <TopBar skipClass={s.skipOnRed}>
        <span className="flex items-center gap-2.5">
          <Mark />
          <span className="text-base font-bold tracking-tight">{clientConfig.appName}</span>
        </span>
      </TopBar>

      <div className={`flex flex-1 flex-col justify-center ${s.fanWrap}`} aria-hidden>
        <div className={s.fanBox}>
          {fans.map((f) => (
            <div key={f.role} className={`${s.fanSlot} ${f.role === "builder" ? "" : s.fan}`} style={f.style}>
              <div className={s.float} style={{ animationDelay: f.floatDelay }}>
                <IdCard
                  variant={f.role}
                  handle={SAMPLE[f.role].handle}
                  address={SAMPLE[f.role].addr}
                  fields={f.fields}
                  minted
                  block={SAMPLE[f.role].block}
                  verified={f.role === "builder" ? tc("stampSub", { n: 17 }) : null}
                  shine={f.role === "builder" ? "loop" : "none"}
                  depth="dark"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <h1 className={s.headline}>
        {lines.map((l, i) => (
          <span key={l} className={i === lines.length - 1 && lines.length > 1 ? s.headLast : ""}>
            {l}
          </span>
        ))}
      </h1>

      <button type="button" onClick={onStart} className={`${s.startBtn} mt-8`} data-testid="welcome-start">
        {t("start")}
        <span className={s.startDot}>
          <Arrow />
        </span>
      </button>
    </>
  );
}

const SLOTS = {
  center: "translate(0, -11%) scale(.9)",
  left: "translate(-35.7%, 38.9%) rotate(-15deg) scale(.64)",
  right: "translate(35.7%, 38.9%) rotate(15deg) scale(.64)",
};

/** "Bạn là ai?": 3 thẻ, thẻ được chọn bật vào giữa (spring), tên vai trò lớn bên dưới. */
export function RolePicker({
  role,
  onRole,
  onBack,
  onNext,
}: {
  role: Role;
  onRole: (r: Role) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("idcard");
  const others = ROLES.filter((r) => r !== role);
  const name = (r: Role) => t(`role_${r}`);

  return (
    <>
      <TopBar onBack={onBack} />
      <h1 className="mt-2 text-[clamp(40px,13vw,52px)] font-extrabold leading-[1.05] tracking-[-0.05em]">
        {t("whoAreYou")}
      </h1>
      <div className={s.roleStage}>
        {ROLES.map((r) => {
          const on = r === role;
          const slot = on ? "center" : others.indexOf(r) === 0 ? "left" : "right";
          return (
            <div
              key={r}
              className={s.roleSlot}
              style={{ transform: SLOTS[slot], zIndex: on ? 3 : slot === "left" ? 1 : 2 }}
            >
              <IdCard
                variant={r}
                handle={null}
                fields={blankFields(r, tc)}
                tilt={on}
                shine={on ? "loop" : "none"}
              />
              <button
                type="button"
                className={s.roleHit}
                aria-pressed={on}
                aria-label={name(r)}
                onClick={() => onRole(r)}
                data-testid={`role-${r}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-16 flex h-14 justify-center">
        <span key={role} className={`${s.rise} text-[44px] font-extrabold leading-none tracking-[-0.045em]`}>
          {name(role)}
        </span>
      </div>
      <StepBar at={0} onNext={onNext} testId="role-continue" />
    </>
  );
}
