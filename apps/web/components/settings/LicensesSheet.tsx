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
  {
    // CC-BY 4.0: ghi công tác giả + link giấy phép (SVG đóng gói trong public/emoji, không CDN).
    name: "Twemoji 17.0.3",
    note: "© 2019 Twitter, Inc and other contributors",
    license: "CC-BY 4.0",
    url: "https://github.com/jdecked/twemoji",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
] as const satisfies readonly {
  name: string;
  license: string;
  url: string;
  note?: string;
  licenseUrl?: string;
}[];

export function LicensesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  return (
    <Sheet open={open} onClose={onClose} title={t("licenses")}>
      <ul
        className="stagger divide-y divide-[var(--line)] overflow-hidden rounded-[22px] bg-[var(--soft)]"
        data-testid="licenses"
      >
        {OSS.map((o) => {
          const note = "note" in o ? o.note : null;
          const licenseUrl = "licenseUrl" in o ? o.licenseUrl : null;
          const pill =
            "mono shrink-0 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold tracking-[.06em]";
          return (
            <li key={o.name} className="flex min-h-[52px] items-center gap-3 px-4">
              <a
                href={o.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.name}</span>
                  {note && <span className="block text-[12px] text-[var(--muted)]">{note}</span>}
                </span>
                {!licenseUrl && <span className={pill}>{o.license}</span>}
                <Icon name="external" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </a>
              {licenseUrl && (
                <a
                  href={licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${pill} underline-offset-2 hover:underline`}
                >
                  {o.license}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
