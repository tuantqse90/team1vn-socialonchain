/**
 * Twemoji (github.com/jdecked/twemoji v17.0.3). Đồ hoạ CC-BY 4.0: credit nằm ở Cài đặt › Giấy phép
 * và public/emoji/NOTICE.md. Chỉ đóng gói một bộ chọn lọc; emoji khác hiển thị bằng font hệ thống.
 */
const CODES = [
  // mặt
  "1f602",
  "1f923",
  "1f60d",
  "1f60e",
  "1f62e",
  "1f914",
  "1f605",
  "1f600",
  "1f60a",
  "1f643",
  "1f622",
  "1f62d",
  "1f624",
  "1f621",
  "1f973",
  "1f92f",
  "1f634",
  "1fae1",
  "1fae0",
  // tay
  "1f44d",
  "1f44e",
  "1f44f",
  "1f64f",
  "1f64c",
  "1f4aa",
  "1f440",
  "1f91d",
  "270c",
  "1f44b",
  "1f90c",
  // builder
  "2764",
  "1f525",
  "2728",
  "1f4af",
  "2705",
  "274c",
  "26a0",
  "1f389",
  "1f680",
  "26a1",
  "1f4a1",
  "1f41b",
  "1f527",
  "1f6e0",
  "1f4bb",
  "1f4e6",
  "1f9e0",
  "1f3ae",
  "1f3d4",
  "1f53a",
  "26d3",
  "2615",
  "1f35c",
  "1f4b8",
  "1f4c8",
  "1f4c9",
] as const;

/** Ký tự có mặc định dạng chữ: thêm U+FE0F khi chèn để font hệ thống cũng vẽ dạng emoji. */
const NEEDS_VS = new Set(["2764", "270c", "26a0", "26d3", "1f6e0", "1f3d4"]);

const BUNDLED = new Set<string>(CODES);

export const EMOJI_PICKER = CODES.map((code) => ({
  code,
  char: String.fromCodePoint(Number.parseInt(code, 16)) + (NEEDS_VS.has(code) ? "️" : ""),
}));

/** Tên file Twemoji của một emoji: code point hex nối bằng "-", bỏ FE0F nếu không có ZWJ. */
export function twemojiCode(emoji: string): string {
  let cps = [...emoji].map((c) => (c.codePointAt(0) ?? 0).toString(16));
  if (!cps.includes("200d")) cps = cps.filter((c) => c !== "fe0f");
  return cps.join("-");
}

export function twemojiSrc(emoji: string): string | null {
  const code = twemojiCode(emoji);
  return BUNDLED.has(code) ? `/emoji/${code}.svg` : null;
}

const EMOJI_RE =
  /\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/gu;

export type Segment = { t: "text"; v: string } | { t: "emoji"; v: string; src: string | null };

export function splitEmoji(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: "text", v: text.slice(last, i) });
    out.push({ t: "emoji", v: m[0], src: twemojiSrc(m[0]) });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

/** 1–3 emoji, không có chữ: hiển thị to, không bong bóng. */
export function isEmojiOnly(text: string): boolean {
  const segs = splitEmoji(text);
  const emojis = segs.filter((s) => s.t === "emoji").length;
  return emojis >= 1 && emojis <= 3 && segs.every((s) => s.t === "emoji" || s.v.trim() === "");
}
