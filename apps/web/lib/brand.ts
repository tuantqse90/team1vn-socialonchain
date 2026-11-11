import { clientConfig } from "@/configs";

/** Logo mark: 3 node nối nhau (một graph) trên nền màu accent. Màu lấy từ config client. */
export function logoSvg(
  size = 512,
  accent = clientConfig.theme.accent,
  ink = clientConfig.theme.accentInk,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${accent}"/><g stroke="${ink}" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M21 42 32 21l11 21z" opacity=".55"/></g><g fill="${ink}"><circle cx="32" cy="21" r="5.5"/><circle cx="21" cy="42" r="5.5"/><circle cx="43" cy="42" r="5.5"/></g></svg>`;
}
