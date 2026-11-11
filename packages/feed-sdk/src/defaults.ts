import type { FeedSpec } from "./spec";

/** Nguồn dùng chung cho feed mặc định. Channel Farcaster "avalanche" giúp feed có nội dung ngay cả khi chưa follow ai. */
const BASE_SOURCES = [
  "self",
  "following",
  "replies_in_my_threads",
  "farcaster:following",
  "farcaster:channel:avalanche",
];

export const DEFAULT_FEEDS: Record<string, FeedSpec> = {
  "default:chronological": {
    v: 1,
    name: "Chronological",
    description: "Newest first from people you follow. No ranking.",
    sources: BASE_SOURCES,
    rules: [],
    recencyHalfLifeHours: 720,
    explain: { en: ["Newest first"], vi: ["Mới nhất lên trước"] },
  },
  "default:builders-shipping": {
    v: 1,
    name: "Builders shipping",
    description: "Verified onchain builders and substantive posts first.",
    sources: [...BASE_SOURCES, "two_hop", "farcaster:channel:avax-builders"],
    rules: [
      {
        when: { signal: "onchain_builder", gte: 1 },
        action: "boost",
        weight: 0.6,
        explain: {
          en: "Verified builder (deployed contracts)",
          vi: "Builder đã xác minh (có deploy contract)",
        },
      },
      {
        when: { label: "quality:substantive", gte: 0.6 },
        action: "boost",
        weight: 0.5,
        explain: { en: "Substantive post", vi: "Bài có nội dung" },
      },
      { when: { label: "author:builder", gte: 0.6 }, action: "boost", weight: 0.2 },
      { when: { label: "quality:shill", gte: 0.7 }, action: "hide" },
      { when: { label: "quality:engagement_bait", gte: 0.7 }, action: "hide" },
      {
        when: { label: "topic:crypto_market", gte: 0.5 },
        action: "downrank",
        weight: 0.6,
        explain: { en: "Less price talk", vi: "Bớt bàn giá" },
      },
    ],
    recencyHalfLifeHours: 48,
    diversity: { maxPerAuthor: 3 },
    explain: {
      en: ["Boost verified builders", "Boost substantive posts", "Hide shilling and bait", "Less price talk"],
      vi: [
        "Ưu tiên builder đã xác minh",
        "Ưu tiên bài có nội dung",
        "Ẩn shill và câu tương tác",
        "Bớt bàn giá",
      ],
    },
  },
  "default:avalanche-no-shill": {
    v: 1,
    name: "Avalanche, no shill",
    description: "Avalanche ecosystem news and infra, without shilling.",
    sources: [...BASE_SOURCES, "two_hop", "channel:avalanche"],
    rules: [
      { when: { label: "topic:avalanche", gte: 0.5 }, action: "boost", weight: 0.6 },
      { when: { label: "topic:infra", gte: 0.5 }, action: "boost", weight: 0.4 },
      { when: { label: "quality:shill", gte: 0.6 }, action: "hide" },
      { when: { label: "topic:crypto_market", gte: 0.5 }, action: "downrank", weight: 0.7 },
    ],
    recencyHalfLifeHours: 24,
    diversity: { maxPerAuthor: 3 },
    explain: {
      en: ["More Avalanche & infra", "Hide shilling", "Less price talk"],
      vi: ["Thêm Avalanche & hạ tầng", "Ẩn shill", "Bớt bàn giá"],
    },
  },
  "default:grants-hackathons": {
    v: 1,
    name: "Grants & hackathons",
    description: "Funding, hackathons and bounties.",
    sources: [...BASE_SOURCES, "two_hop", "channel:grants"],
    rules: [
      { when: { label: "topic:grants_hackathons", gte: 0.5 }, action: "boost", weight: 0.9 },
      { when: { label: "topic:jobs", gte: 0.5 }, action: "boost", weight: 0.2 },
      { when: { not: { label: "topic:grants_hackathons", gte: 0.5 } }, action: "downrank", weight: 0.4 },
      { when: { label: "quality:shill", gte: 0.7 }, action: "hide" },
    ],
    recencyHalfLifeHours: 72,
    explain: { en: ["Grants & hackathons first"], vi: ["Grant & hackathon lên trước"] },
  },
  "default:founders": {
    v: 1,
    name: "Founders with substance",
    description: "Founders writing real content. Less politics, no bait.",
    sources: [...BASE_SOURCES, "two_hop"],
    rules: [
      {
        when: {
          all: [
            { label: "author:founder", gte: 0.6 },
            { label: "quality:substantive", gte: 0.6 },
          ],
        },
        action: "boost",
        weight: 0.7,
        explain: { en: "Founder writing with substance", vi: "Founder viết có nội dung" },
      },
      { when: { label: "topic:politics", gte: 0.5 }, action: "downrank", weight: 0.8 },
      { when: { label: "quality:engagement_bait", gte: 0.7 }, action: "hide" },
    ],
    recencyHalfLifeHours: 48,
    diversity: { maxPerAuthor: 2 },
    explain: {
      en: ["Boost founders writing with substance", "Less politics", "Hide engagement bait"],
      vi: ["Ưu tiên founder viết có nội dung", "Bớt tin chính trị", "Bỏ qua bài câu tương tác"],
    },
  },
  "default:real-conversations": {
    v: 1,
    name: "Real conversations",
    description: "Threads where people actually talk back and forth.",
    sources: [...BASE_SOURCES, "two_hop"],
    rules: [
      {
        when: { signal: "conversation", gte: 1 },
        action: "boost",
        weight: 0.6,
        explain: { en: "Real back-and-forth conversation", vi: "Cuộc trò chuyện qua lại thật" },
      },
      { when: { signal: "distinct_repliers", gte: 3 }, action: "boost", weight: 0.3 },
      { when: { signal: "mutual_follow", gte: 1 }, action: "boost", weight: 0.2 },
      { when: { label: "quality:engagement_bait", gte: 0.7 }, action: "hide" },
      { when: { label: "quality:low_effort", gte: 0.7 }, action: "downrank", weight: 0.4 },
    ],
    recencyHalfLifeHours: 48,
    explain: {
      en: ["Boost real conversations", "Hide engagement bait"],
      vi: ["Ưu tiên cuộc trò chuyện thật", "Bỏ qua bài câu tương tác"],
    },
  },
};

export const DEFAULT_FEED_IDS = Object.keys(DEFAULT_FEEDS);

/** Moderation stack: chỉ có rule hide/downrank, áp lên MỌI feed. */
export const MODERATION_STACKS: Record<string, FeedSpec> = {
  "mod:safety": {
    v: 1,
    name: "Safety",
    sources: ["all"],
    rules: [
      { when: { label: "safety:illegal", gte: 0.5 }, action: "hide" },
      { when: { label: "safety:doxxing", gte: 0.5 }, action: "hide" },
      { when: { label: "safety:nsfw", gte: 0.7 }, action: "hide" },
      { when: { label: "spam:manipulation", gte: 0.7 }, action: "hide" },
    ],
    recencyHalfLifeHours: 24,
  },
  "mod:no-toxic": {
    v: 1,
    name: "No toxicity",
    sources: ["all"],
    rules: [{ when: { label: "tone:toxic", gte: 0.7 }, action: "hide" }],
    recencyHalfLifeHours: 24,
  },
  "mod:no-bait": {
    v: 1,
    name: "No engagement bait",
    sources: ["all"],
    rules: [{ when: { label: "quality:engagement_bait", gte: 0.7 }, action: "hide" }],
    recencyHalfLifeHours: 24,
  },
  "mod:no-shill": {
    v: 1,
    name: "No shilling",
    sources: ["all"],
    rules: [{ when: { label: "quality:shill", gte: 0.7 }, action: "hide" }],
    recencyHalfLifeHours: 24,
  },
  "mod:less-politics": {
    v: 1,
    name: "Less politics",
    sources: ["all"],
    rules: [{ when: { label: "topic:politics", gte: 0.5 }, action: "downrank", weight: 0.8 }],
    recencyHalfLifeHours: 24,
  },
};

export const DEFAULT_MODERATION_IDS = ["mod:safety"];

export function isModerationSpec(spec: FeedSpec): boolean {
  return spec.rules.every((r) => r.action === "hide" || r.action === "downrank");
}
