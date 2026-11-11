import { Icon } from "./Icon";

const IMAGE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

function safeUrl(u: string): URL | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Embed cơ bản của bài Farcaster: URL ảnh → ảnh (lazy, không gửi referrer), URL khác → chip link.
 * Chỉ nhận http(s); URL đã được lọc ở worker nhưng vẫn kiểm lại ở đây.
 */
export function Embeds({ urls }: { urls: string[] | undefined }) {
  const list = (urls ?? []).map(safeUrl).filter((u): u is URL => u !== null);
  if (!list.length) return null;
  const images = list.filter((u) => IMAGE.test(u.pathname));
  const links = list.filter((u) => !IMAGE.test(u.pathname));
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="embeds">
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {images.map((u) => (
            <a key={u.href} href={u.href} target="_blank" rel="noreferrer nofollow ugc">
              {/* biome-ignore lint/performance/noImgElement: ảnh từ host tuỳ ý, không qua next/image optimizer */}
              <img
                src={u.href}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-h-80 w-full rounded-2xl border border-[var(--line)] object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {links.map((u) => (
        <a
          key={u.href}
          href={u.href}
          target="_blank"
          rel="noreferrer nofollow ugc"
          className="press flex items-center gap-2 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
        >
          <Icon name="globe" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <span className="truncate font-medium">{u.hostname.replace(/^www\./, "")}</span>
          <span className="mono truncate text-xs text-[var(--muted)]">
            {u.pathname === "/" ? "" : u.pathname}
          </span>
          <Icon name="external" className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
        </a>
      ))}
    </div>
  );
}
