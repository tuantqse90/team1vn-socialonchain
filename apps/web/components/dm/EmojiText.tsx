import { splitEmoji } from "@/lib/emoji";

/** Text có emoji: emoji trong bộ Twemoji đóng gói thì vẽ bằng SVG, còn lại để font hệ thống. */
export function EmojiText({ text, size = "1.2em" }: { text: string; size?: string }) {
  return (
    <>
      {splitEmoji(text).map((s, i) =>
        s.t === "emoji" && s.src ? (
          // biome-ignore lint/performance/noImgElement: SVG tĩnh cỡ chữ, next/image không có lợi gì ở đây
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: danh sách tĩnh theo text
            key={i}
            src={s.src}
            alt={s.v}
            draggable={false}
            className="inline-block"
            style={{ width: size, height: size, verticalAlign: "-0.2em", margin: "0 0.04em" }}
          />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: danh sách tĩnh theo text
          <span key={i}>{s.v}</span>
        ),
      )}
    </>
  );
}
