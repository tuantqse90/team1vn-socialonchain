/**
 * Chạy trước khi app hydrate (Next file convention `instrumentation-client`).
 * Sentry chỉ được nạp khi có `NEXT_PUBLIC_SENTRY_DSN`; không có DSN thì không tải thêm byte nào.
 * Sentry.init tự gắn handler cho `error` và `unhandledrejection` của window.
 * Mặc định Sentry không gửi PII (IP, cookie); session key trong localStorage không bao giờ được đọc ở đây.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("@sentry/browser")
    .then((Sentry) =>
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_NETWORK ?? "local",
        tracesSampleRate: 0,
      }),
    )
    .catch(() => undefined);
}
