import type { Condition, FeedSpec, Rule } from "@socialonchain/feed-sdk";
import type { IconName } from "@/components/Icon";

/** Icon cho từng nhãn/tín hiệu trong bộ nhãn v1 (tập đóng trong feed-sdk/labels.ts). */
const ICONS: Record<string, IconName> = {
  "topic:avalanche": "peak",
  "topic:infra": "network",
  "topic:defi": "swap",
  "topic:gaming": "gamepad",
  "topic:ai": "nodes",
  "topic:grants_hackathons": "trophy",
  "topic:jobs": "idcard",
  "topic:crypto_market": "pulse",
  "topic:politics": "megaphone",
  "topic:personal_life": "user",
  "quality:substantive": "book",
  "quality:engagement_bait": "flame",
  "quality:shill": "coin",
  "quality:low_effort": "minus",
  "tone:toxic": "toxic",
  "spam:manipulation": "alert",
  "author:founder": "briefcase",
  "author:builder": "cube",
  "author:new_account": "userplus",
  "safety:illegal": "shield",
  "safety:nsfw": "shield",
  "safety:doxxing": "shield",
  "lang:vi": "globe",
  "lang:en": "globe",
  recency: "clock",
  reactions: "heart",
  reply_count: "reply",
  distinct_repliers: "reply",
  conversation: "chat",
  mutual_follow: "repost",
  graph_distance: "nodes",
  author_post_rate: "bars",
  onchain_builder: "verified",
};

const DEFAULT_FEED_ICONS: Record<string, IconName> = {
  "default:builders-shipping": "cube",
  "default:chronological": "clock",
  "default:avalanche-no-shill": "peak",
  "default:grants-hackathons": "trophy",
  "default:founders": "briefcase",
  "default:real-conversations": "chat",
};

function firstKey(c: Condition): string | null {
  if ("label" in c) return c.label;
  if ("signal" in c) return c.signal;
  if ("not" in c) return firstKey(c.not);
  const list = "all" in c ? c.all : c.any;
  for (const x of list) {
    const k = firstKey(x);
    if (k) return k;
  }
  return null;
}

export function ruleIcon(rule: Rule): IconName {
  const k = firstKey(rule.when);
  if (k && ICONS[k]) return ICONS[k];
  return rule.action === "boost" ? "up" : rule.action === "hide" ? "eyeoff" : "down";
}

/** Icon đại diện cho một feed: feed mặc định có icon riêng, còn lại lấy từ rule boost đầu tiên. */
export function feedIcon(id: string, spec: FeedSpec): IconName {
  if (DEFAULT_FEED_ICONS[id]) return DEFAULT_FEED_ICONS[id];
  const r = spec.rules.find((x) => x.action === "boost") ?? spec.rules[0];
  return r ? ruleIcon(r) : "layers";
}
