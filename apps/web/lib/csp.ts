import { clientConfig } from "@/configs";
import { rpcUrl } from "./chain";

/**
 * Content-Security-Policy cho mọi trang HTML (gắn ở `proxy.ts`, nonce mới mỗi request).
 * Session key nằm trong localStorage, nên chặn script lạ là lớp bảo vệ chính khi có lỗi XSS:
 * - script: chỉ script mang nonce + script do chúng nạp ('strict-dynamic'); không 'unsafe-inline', không eval (trừ dev).
 * - connect: chỉ API indexer + RPC của chain đang dùng (+ WalletConnect/Sentry khi có cấu hình).
 * - style vẫn 'unsafe-inline': style attribute do SSR render và <style> của RainbowKit; rủi ro thấp hơn script nhiều.
 * - ảnh https bất kỳ: embed/avatar Farcaster nằm trên nhiều host.
 */
const WALLETCONNECT_CONNECT = [
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "https://*.web3modal.org",
  "https://*.reown.com",
];
const WALLETCONNECT_FRAME = ["https://verify.walletconnect.com", "https://verify.walletconnect.org"];

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const o = new URL(url).origin;
    return o === "null" ? null : o;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(
  nonce: string,
  {
    dev = process.env.NODE_ENV === "development",
    walletConnect = Boolean(process.env.NEXT_PUBLIC_WC_PROJECT_ID),
    sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN,
  }: { dev?: boolean; walletConnect?: boolean; sentryDsn?: string } = {},
): string {
  const api = originOf(clientConfig.indexerUrl);
  const rpc = originOf(rpcUrl);
  const sentry = originOf(sentryDsn);
  const connect = new Set(
    ["'self'", api, rpc, sentry, ...(walletConnect ? WALLETCONNECT_CONNECT : [])].filter((x): x is string =>
      Boolean(x),
    ),
  );
  const httpApi = api?.startsWith("http:") ? ` ${api}` : "";
  // Chỉ ép https khi mọi backend đã là https (bản deploy); ở localhost API/RPC còn chạy http.
  const allHttps = [api, rpc].every((o) => o?.startsWith("https:"));
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${httpApi}`,
    `media-src 'self' https:${httpApi}`,
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `frame-src ${walletConnect ? WALLETCONNECT_FRAME.join(" ") : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(allHttps && !dev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
