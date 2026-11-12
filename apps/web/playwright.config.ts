import { defineConfig, devices } from "@playwright/test";

/**
 * E2E hành trình chính trên stack local thật (Anvil + Postgres + indexer + worker).
 * Chạy trước: `pnpm dev:local --seed --no-web`. Web là bản production build (tất định hơn `next dev`)
 * ở cổng 3100, ví nhúng tự mở khoá bằng Anvil account #2 (key công khai của Anvil, chỉ local).
 */
const PORT = Number(process.env.E2E_PORT || 3100);
export const E2E_ACCOUNT = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
/** Private key CÔNG KHAI của Anvil account #2 (mnemonic mặc định "test test … junk"). Chỉ dùng ở local. */
const E2E_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["iPhone 15"],
    browserName: "chromium",
  },
  webServer: {
    // Xoá hẳn .next-e2e: fetch-cache SSR (chain local reset thì id bài lặp lại) và cache Turbopack giữ URL RPC/API cũ.
    command: `rm -rf .next-e2e && pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/brand/icon`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_E2E_PRIVATE_KEY: E2E_PRIVATE_KEY,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:42069",
      NEXT_PUBLIC_NETWORK: "local",
      NEXT_PUBLIC_RPC_URL: process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
