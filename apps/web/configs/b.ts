import type { ClientConfig } from "./types";

/**
 * Client B "Phố Builder": một client KHÁC trên cùng protocol (cùng identity, cùng graph).
 * Chỉ onchain (không Farcaster), mặc định chặn shill + câu tương tác, nền tối, accent vàng.
 */
const config: ClientConfig = {
  id: "b",
  appName: "Phố Builder",
  tagline: { en: "Same identity. Same graph. Onchain only.", vi: "Cùng danh tính. Cùng graph. Chỉ onchain." },
  logo: { mark: "P" },
  theme: {
    accent: "#F5B53D",
    accentInk: "#0B0B0C",
    radius: "18px",
    text: { light: "#8A5A00", dark: "#F5B53D" },
    tint: { light: "#FDF3DF", dark: "#2E2512" },
  },
  defaultTheme: "dark",
  defaultFeeds: ["default:grants-hackathons", "default:builders-shipping", "default:chronological"],
  defaultModeration: ["mod:safety", "mod:no-shill", "mod:no-bait"],
  enabledSources: ["self", "following", "replies_in_my_threads", "two_hop"],
  indexerUrl: "http://localhost:42069",
  chain: "local",
  plans: [{ id: 1, name: "Pro", priceUsd: 5, months: 1, compilesPerDay: 200, maxFeeds: 50 }],
  freeLimits: { compilesPerDay: 10, maxFeeds: 5 },
};

export default config;
