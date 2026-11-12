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
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
