import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import s from "@/components/onboarding/idcard.module.css";
import { clientConfig } from "@/configs";
import { chain, network } from "@/lib/chain";

export type IdCardVariant = "builder" | "student" | "reader";
export type IdField = { k: string; v: string };

/** Vòng đồng tâm mờ quay chậm quanh (296, 92), nét đứt khác nhau để thấy chuyển động. */
const RINGS = Array.from({ length: 6 }, (_, k) => ({
  r: 26 + k * 21,
  dash: `${(1.2 + k * 0.5).toFixed(1)} ${(2.4 + k * 0.9).toFixed(1)}`,
}));

/** 5 đường sóng ở chân thẻ (xấp xỉ sin bằng Q/T: rất ít điểm). */
const WAVES = (() => {
  const half = 8 * Math.PI; // nửa chu kỳ ≈ 25px
  let d = "";
  for (let j = 0; j < 5; j++) {
    const y = 162 + j * 2.6;
    let x = -((j * 0.9 * 8) % (2 * half)) - half;
    d += `M${x.toFixed(1)} ${y}Q${(x + half / 2).toFixed(1)} ${(y - 5.2).toFixed(1)} ${(x + half).toFixed(1)} ${y}`;
    for (x += half; x < 342 + half; x += half) d += `T${(x + half).toFixed(1)} ${y}`;
  }
  return d;
})();

const fill44 = (v: string) => `${v}${"<".repeat(44)}`.slice(0, 44);
const isAddr = (a: string | null | undefined): a is string => Boolean(a && /^0x[0-9a-fA-F]{40}$/.test(a));

/**
 * Thẻ danh tính: builder (đỏ), sinh viên (trắng), người dùng (đen). Handle, địa chỉ rút gọn, 3 trường, 2 dòng MRZ,
 * dấu NHÁP/ONCHAIN, dấu VERIFIED cho builder. Co giãn theo bề rộng cha (tối đa 342px).
 */
export function IdCard({
  variant,
  handle,
  address,
  fields,
  minted = false,
  block,
  verified,
  scanning = false,
  printing = false,
  shine = "none",
  depth = "light",
  tilt = false,
  stampDelay,
  className = "",
}: {
  variant: IdCardVariant;
  handle: string | null;
  address?: string | null;
  fields: IdField[];
  minted?: boolean;
  block?: number | bigint | string | null;
  /** Hiện dấu VERIFIED kèm dòng phụ (vd. "17 CONTRACT", "" = không có dòng phụ); null/undefined thì không. */
  verified?: string | null;
  scanning?: boolean;
  printing?: boolean;
  shine?: "none" | "once" | "loop";
  depth?: "light" | "dark" | "flat";
  tilt?: boolean;
  stampDelay?: number;
  className?: string;
}) {
  const t = useTranslations("idcard");
  const valid = isAddr(address);
  const shownHandle = handle
    ? `@${handle}`
    : valid
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : `@${t("placeholder")}`;
  const initial =
    (handle ?? "")
      .replace(/[^a-zA-Z]/g, "")
      .charAt(0)
      .toUpperCase() || "?";
  const roleCode = { builder: t("mrzBuilder"), student: t("mrzStudent"), reader: t("mrzReader") }[variant];
  const H = (handle ?? t("placeholder")).toUpperCase().replace(/[^A-Z0-9]/g, "<");
  const A = valid ? address.slice(2).toUpperCase().slice(0, 20) : "<".repeat(20);
  const net = network.name === "fuji" ? "FUJI" : "LOCAL";
  const blockNo = block !== null && block !== undefined ? String(block).replace(/\D/g, "") : "";
  const tail = (minted || printing) && blockNo ? `B${blockNo}` : minted || printing ? "B" : t("mrzDraft");
  const mrz1 = fill44(`ID<AVAX<${H}<<${roleCode}`);
  const mrz2 = fill44(`${A}<<${net}<${chain.id}<<${tail}`);
  const depthCls = depth === "dark" ? s.dark : depth === "flat" ? s.flat : s.light;
  const stamped = verified !== null && verified !== undefined;

  return (
    <div className={`${s.card} ${className}`}>
      <div className={`${s.face} ${s[variant]} ${depthCls} ${tilt ? s.tilt : ""}`}>
        <svg aria-hidden className={s.pattern} viewBox="0 0 342 216" preserveAspectRatio="none">
          <g
            className={s.rings}
            fill="none"
            stroke="var(--c-pat)"
            strokeWidth=".6"
            style={{ opacity: "var(--c-pat-op)" } as CSSProperties}
          >
            {RINGS.map((r) => (
              <circle key={r.r} cx="296" cy="92" r={r.r} strokeDasharray={r.dash} />
            ))}
          </g>
          <path
            d={WAVES}
            fill="none"
            stroke="var(--c-pat)"
            strokeWidth=".55"
            style={{ opacity: "var(--c-wave-op)" } as CSSProperties}
          />
        </svg>

        <div className={s.head}>
          <svg aria-hidden className={s.mark} viewBox="0 0 28 28">
            <rect width="28" height="28" rx="8" fill="var(--c-ink)" />
            <path
              d="M8.5 9.5L19.5 9.5L14 19Z"
              fill="none"
              stroke="var(--c-bg)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="8.5" cy="9.5" r="2.6" fill="var(--c-bg)" />
            <circle cx="19.5" cy="9.5" r="2.6" fill="var(--c-bg)" />
            <circle cx="14" cy="19" r="2.6" fill="var(--c-bg)" />
          </svg>
          <span className={`${s.mono} ${s.brand}`}>{clientConfig.appName.toUpperCase()}</span>
          <span className={`${s.mono} ${s.state} ${minted ? s.minted : ""}`}>
            {minted ? t("onchain") : t("draft")}
          </span>
          <span className={`${s.mono} ${s.role}`}>{t(variant)}</span>
        </div>

        <div className={s.photo} aria-hidden>
          {initial}
        </div>

        <div className={`${s.who} ${stamped ? s.withStamp : ""}`}>
          <span className={s.handle}>{shownHandle}</span>
          <span className={`${s.mono} ${s.addr}`}>
            {valid ? `${address.slice(0, 6)}…${address.slice(-4)}` : "0x…"}
          </span>
        </div>

        <div className={s.fields}>
          {fields.slice(0, 3).map((f) => (
            <div key={f.k} className={s.field}>
              <span className={`${s.mono} ${s.fk}`}>{f.k}</span>
              <span className={`${s.mono} ${s.fv}`}>{f.v}</span>
            </div>
          ))}
        </div>

        <div className={`${s.mono} ${s.mrz}`} aria-hidden>
          <div>{mrz1}</div>
          <div className={printing ? s.typing : ""}>{mrz2}</div>
        </div>

        {stamped && (
          <div
            className={`${s.mono} ${s.stamp}`}
            style={stampDelay ? ({ "--stamp-delay": `${stampDelay}ms` } as CSSProperties) : undefined}
          >
            <span className={s.stampMain}>{t("verified")}</span>
            {verified && <span className={s.stampSub}>{verified}</span>}
          </div>
        )}

        {scanning && <div className={s.scan} aria-hidden />}
        {shine !== "none" && (
          <div aria-hidden className={`${s.shine} ${shine === "loop" ? s.shineLoop : s.shineOnce}`} />
        )}
      </div>
    </div>
  );
}
