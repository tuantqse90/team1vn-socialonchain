import type { ClientConfig } from "./types";

/** Client A: client chính cho builder Avalanche (EN/VI). Mọi thứ mang thương hiệu nằm ở đây. */
const config: ClientConfig = {
  id: "a",
  appName: "socialonchain",
  tagline: {
    en: "One identity. One graph. Thousands of feeds.",
    vi: "Một danh tính. Một graph. Hàng nghìn feed.",
  },
  logo: { mark: "S" },
  theme: { accent: "#E84142", accentInk: "#FFFFFF", radius: "18px" },
  defaultFeeds: [
    "default:builders-shipping",
    "default:chronological",
    "default:avalanche-no-shill",
    "default:grants-hackathons",
    "default:founders",
    "default:real-conversations",
  ],
  defaultModeration: ["mod:safety"],
  enabledSources: [
    "self",
    "following",
    "replies_in_my_threads",
    "two_hop",
    "farcaster:following",
    "farcaster:channel:avalanche",
    "farcaster:channel:avax-builders",
  ],
  indexerUrl: "http://localhost:42069",
  chain: "local",
  plans: [{ id: 1, name: "Pro", priceUsd: 5, months: 1, compilesPerDay: 200, maxFeeds: 50 }],
  freeLimits: { compilesPerDay: 10, maxFeeds: 5 },
};

export default config;
