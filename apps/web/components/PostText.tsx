import Link from "next/link";
import type { ReactNode } from "react";

const TOKEN =
  /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])|(^|[^\w@])@(0x[0-9a-fA-F]{40}|[a-z0-9_]{3,20})\b|(^|[^\w#])#([\p{L}\p{N}_-]{2,40})/gu;

/** Hiển thị text bài: link hoá URL, @mention và #hashtag. Không render HTML từ nội dung (chống XSS). */
export function PostText({ text, className = "" }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (m[1]) {
      out.push(text.slice(last, idx));
      const href = m[1];
      out.push(
        <a
          key={k++}
          href={href}
          target="_blank"
          rel="noreferrer nofollow ugc"
          className="text-[var(--accent)] hover:underline"
        >
          {href.replace(/^https?:\/\//, "").slice(0, 48)}
          {href.replace(/^https?:\/\//, "").length > 48 ? "…" : ""}
        </a>,
      );
      last = idx + m[0].length;
    } else if (m[3]) {
      const pre = m[2] ?? "";
      out.push(text.slice(last, idx) + pre);
      out.push(
        <Link key={k++} href={`/u/${m[3].toLowerCase()}`} className="text-[var(--accent)] hover:underline">
          @{m[3].startsWith("0x") ? `${m[3].slice(0, 6)}…${m[3].slice(-4)}` : m[3]}
        </Link>,
      );
      last = idx + m[0].length;
    } else if (m[5]) {
      const pre = m[4] ?? "";
      out.push(text.slice(last, idx) + pre);
      out.push(
        <Link
          key={k++}
          href={`/search?q=${encodeURIComponent(`#${m[5]}`)}`}
          className="text-[var(--accent)] hover:underline"
        >
          #{m[5]}
        </Link>,
      );
      last = idx + m[0].length;
    }
  }
  out.push(text.slice(last));
  return (
    <div className={`whitespace-pre-wrap break-words text-[15px] leading-[1.45] ${className}`}>{out}</div>
  );
}
