"use client";

import { useTranslations } from "next-intl";
import { Sheet } from "../bits";
import { Icon } from "../Icon";

/** Phần mềm mã nguồn mở chính mà app dùng (giấy phép gốc ở link). */
const OSS = [
  { name: "Next.js", license: "MIT", url: "https://github.com/vercel/next.js" },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "viem", license: "MIT", url: "https://github.com/wevm/viem" },
  { name: "wagmi", license: "MIT", url: "https://github.com/wevm/wagmi" },
  { name: "RainbowKit", license: "MIT", url: "https://github.com/rainbow-me/rainbowkit" },
  { name: "TanStack Query", license: "MIT", url: "https://github.com/TanStack/query" },
  {
    name: "OpenZeppelin Contracts",
    license: "MIT",
    url: "https://github.com/OpenZeppelin/openzeppelin-contracts",
  },
  { name: "Be Vietnam Pro", license: "OFL-1.1", url: "https://fonts.google.com/specimen/Be+Vietnam+Pro" },
  { name: "Geist Mono", license: "OFL-1.1", url: "https://github.com/vercel/geist-font" },
] as const;

export function LicensesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  return (
    <Sheet open={open} onClose={onClose} title={t("licenses")}>
      <ul
        className="stagger divide-y divide-[var(--line)] overflow-hidden rounded-[22px] bg-[var(--soft)]"
        data-testid="licenses"
      >
        {OSS.map((o) => (
          <li key={o.name}>
            <a
              href={o.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[52px] items-center gap-3 px-4 transition-colors active:bg-[var(--line)]"
            >
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{o.name}</span>
              <span className="mono shrink-0 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold tracking-[.06em]">
                {o.license}
              </span>
              <Icon name="external" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
