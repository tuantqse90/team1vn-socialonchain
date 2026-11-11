import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** cdp-sdk (qua @base-org/account trong wagmi connectors) import động các gói x402 không cài: trỏ về module rỗng. */
const EMPTY = "./lib/empty-module.cjs";
const OPTIONAL_MISSING = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
];

const config: NextConfig = {
  turbopack: { resolveAlias: Object.fromEntries(OPTIONAL_MISSING.map((m) => [m, EMPTY])) },
  transpilePackages: ["@socialonchain/protocol", "@socialonchain/feed-sdk", "@socialonchain/ui"],
  // E2E chạy song song với `next dev` thường: dùng thư mục build riêng.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(config);
