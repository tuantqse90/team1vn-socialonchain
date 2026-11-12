import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

/**
 * Gắn CSP có nonce cho từng request trang. Next đọc nonce từ header CSP của request và tự gắn vào script của framework;
 * script tự viết (theme ở layout) đọc `x-nonce`. Vì vậy mọi trang render động (layout gọi `headers()`).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      // Bỏ qua file tĩnh/ảnh (không phải HTML) và prefetch của next/link.
      source: "/((?!_next/static|_next/image|emoji/|brand/|favicon.ico|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
