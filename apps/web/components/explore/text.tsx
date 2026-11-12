"use client";

/**
 * Tiện ích chữ/số cho Khám phá, Thông báo, Kênh: so khớp không dấu (tiếng Việt), tô đậm chỗ khớp,
 * @mention màu đỏ, thời gian ngắn theo ngôn ngữ, số rút gọn.
 */
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useMemo } from "react";
import { displayName } from "@/lib/format";
import type { Author, Post } from "@/lib/types";

/** Gập 1 ký tự về chữ thường không dấu; luôn trả đúng 1 code unit để chỉ số khớp với chuỗi gốc. */
function foldChar(ch: string): string {
  let b = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (b === "đ" || b === "Đ") b = "d";
  b = b.toLowerCase();
  return b.length === 1 ? b : ch.toLowerCase().charAt(0) || " ";
}

export function fold(s: string): string {
  return Array.from(s).map(foldChar).join("");
}

/** Chuẩn hoá truy vấn: gọn khoảng trắng + gập dấu. */
export function foldQuery(q: string | undefined): string {
  return fold((q ?? "").trim().replace(/\s+/g, " "));
}

type Part = { start: number; text: string; hit: boolean };

function splitHits(text: string, q: string | undefined): Part[] {
  const needle = foldQuery(q);
  if (!needle) return [{ start: 0, text, hit: false }];
  const chars = Array.from(text);
  const hay = chars.map(foldChar).join("");
  const out: Part[] = [];
  let i = 0;
  let k = hay.indexOf(needle);
  while (k >= 0) {
    if (k > i) out.push({ start: i, text: chars.slice(i, k).join(""), hit: false });
    out.push({ start: k, text: chars.slice(k, k + needle.length).join(""), hit: true });
    i = k + needle.length;
    k = hay.indexOf(needle, i);
  }
  if (i < chars.length) out.push({ start: i, text: chars.slice(i).join(""), hit: false });
  return out;
}

/** Tô chỗ khớp truy vấn (không phân biệt dấu): nền blush + chữ đỏ. */
export function Highlight({ text, q }: { text: string; q?: string }) {
  const parts = useMemo(() => splitHits(text, q), [text, q]);
  return (
    <>
      {parts.map((p) =>
        p.hit ? (
          <mark
            key={p.start}
            className="rounded-[4px] bg-[var(--blush)] font-semibold text-[var(--red-ink)] [box-decoration-break:clone]"
          >
            {p.text}
          </mark>
        ) : (
          <Fragment key={p.start}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Văn bản có @mention màu đỏ (không phải link: thường nằm trong một hàng đã là link). */
export function Mentions({ text }: { text: string }) {
  const parts = useMemo(() => {
    let at = 0;
    return text
      .split(/(@[a-z0-9_]+)/i)
      .filter(Boolean)
      .map((t) => {
        const p = { start: at, text: t, mention: t.startsWith("@") };
        at += t.length;
        return p;
      });
  }, [text]);
  return (
    <>
      {parts.map((p) =>
        p.mention ? (
          <span key={p.start} className="font-semibold text-[var(--red-ink)]">
            {p.text}
          </span>
        ) : (
          <Fragment key={p.start}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Tên ngắn trong danh sách: handle trước (giống design), rồi tên hiển thị. */
export function nameOf(a: Author): string {
  return a.handle ?? a.fcUsername ?? displayName(a);
}

/** Bỏ badge Verified trên avatar khi seal + số đã nằm cạnh tên (tránh đè badge loại thông báo). */
export function plain(a: Author): Author {
  return a.contractsDeployed > 0 ? { ...a, contractsDeployed: 0 } : a;
}

/** Link mở cast trên Farcaster (hash rút gọn 10 ký tự, gồm `0x`). */
export function fcUrl(post: Post): string | null {
  if (post.source !== "farcaster" || !post.author.fcUsername) return null;
  return `https://farcaster.xyz/${post.author.fcUsername}/${post.id.slice(3, 13)}`;
}

/** Thời gian ngắn: "vừa xong", "5 ph", "3 giờ", "2 ngày" / "now", "5m", "3h", "2d". */
export function useAgo() {
  const t = useTranslations("explore");
  const locale = useLocale();
  return (unix: number) => {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
    if (s < 60) return t("now");
    if (s < 3600) return t("agoMin", { n: String(Math.floor(s / 60)) });
    if (s < 86400) return t("agoHr", { n: String(Math.floor(s / 3600)) });
    if (s < 86400 * 30) return t("agoDay", { n: String(Math.floor(s / 86400)) });
    return new Date(unix * 1000).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US");
  };
}

/** Định dạng số theo ngôn ngữ: `num(1284)` → "1.284" (vi) / "1,284" (en); `compact(2400)` → "2,4k" / "2.4k". */
export function useNum() {
  const locale = useLocale() === "vi" ? "vi-VN" : "en-US";
  return useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const num = (n: number) => nf.format(n);
    const compact = (n: number) => {
      if (n < 1000) return nf.format(n);
      if (n < 1_000_000) return `${nf.format(n < 10_000 ? Math.round(n / 100) / 10 : Math.round(n / 1000))}k`;
      return `${nf.format(Math.round(n / 100_000) / 10)}M`;
    };
    return { num, compact };
  }, [locale]);
}
