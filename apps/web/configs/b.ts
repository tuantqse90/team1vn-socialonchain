import type { ClientConfig } from "./types";

/**
 * Client B: một client KHÁC trên cùng protocol (cùng identity, cùng graph).
 * Chỉ onchain (không Farcaster), mặc định chặn shill + câu tương tác, thương hiệu riêng.
 */
const config: ClientConfig = {
  id: "b",
  appName: "Snowfield",
  tagline: { en: "Onchain only. Signal over noise.", vi: "Chỉ onchain. Tín hiệu hơn ồn ào." },
  logo: { mark: "F" },
  theme: { accent: "#1F7A6D", accentInk: "#FFFFFF", radius: "10px" },
  defaultFeeds: ["default:grants-hackathons", "default:builders-shipping", "default:chronological"],
  defaultModeration: ["mod:safety", "mod:no-shill", "mod:no-bait"],
  enabledSources: ["self", "following", "replies_in_my_threads", "two_hop"],
  indexerUrl: "http://localhost:42069",
  chain: "local",
  plans: [{ id: 1, name: "Pro", priceUsd: 5, months: 1, compilesPerDay: 200, maxFeeds: 50 }],
  freeLimits: { compilesPerDay: 10, maxFeeds: 5 },
};

export default config;
