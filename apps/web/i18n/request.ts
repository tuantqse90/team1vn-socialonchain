import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];

/** Không dùng i18n routing: ngôn ngữ lấy từ cookie `locale`, rồi Accept-Language. */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get("locale")?.value;
  const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
  const locale: Locale =
    fromCookie === "vi" || fromCookie === "en" ? fromCookie : accept.startsWith("vi") ? "vi" : "en";
  // TẠM THỜI (phase-15 UI sync): mỗi gói việc ghi chuỗi vào messages/ext/<gói>.<locale>.json; gộp vào file chính trước khi commit.
  const base = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>;
  const merged: Record<string, unknown> = structuredClone(base);
  for (const pkg of ["a", "b", "c1", "c2", "d"]) {
    try {
      const ext = (await import(`../messages/ext/${pkg}.${locale}.json`)).default as Record<string, unknown>;
      for (const [ns, v] of Object.entries(ext)) {
        merged[ns] = {
          ...((merged[ns] as Record<string, unknown>) ?? {}),
          ...(v as Record<string, unknown>),
        };
      }
    } catch {
      // chưa có file
    }
  }
  return { locale, messages: merged };
});
