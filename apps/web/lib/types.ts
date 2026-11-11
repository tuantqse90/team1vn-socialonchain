import type { Candidate, FeedSpec, Reason } from "@socialonchain/feed-sdk";

/** Kiểu dữ liệu REST (khớp schema OpenAPI của apps/indexer). */
export type Author = {
  address: string | null;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  registered: boolean;
  fid: number | null;
  fcUsername: string | null;
  contractsDeployed: number;
};

export type Post = {
  id: string;
  source: "onchain" | "farcaster";
  author: Author;
  text: string;
  createdAt: number;
  parentId: string | null;
  rootId: string;
  channel: string | null;
  stats: { likes: number; reposts: number; replies: number };
  viewer: { liked: boolean; reposted: boolean } | null;
  txHash: string | null;
  deleted: boolean;
  labels: Record<string, number>;
  /** URL embed (http/https); bài onchain hiện luôn rỗng. */
  embeds?: string[];
};

export type FeedItem = { post: Post; score: number; reasons: Reason[] };
export type FeedPage = {
  items: FeedItem[];
  nextCursor: number | null;
  hidden: number;
  total: number;
  spec: { name: string; explain?: { en: string[]; vi: string[] } };
};

export type User = {
  address: string;
  handle: string | null;
  registered: boolean;
  profileUri: string;
  registeredAt: number | null;
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null; links: string[] };
  counts: { followers: number; following: number; posts: number };
  builder: { contractsDeployed: number; chains: Record<string, number>; checkedAt: string } | null;
  farcaster: { fid: number; username: string } | null;
  authorLabels: Record<string, number>;
  viewer: { following: boolean; followedBy: boolean } | null;
};

export type SavedFeed = {
  id: string;
  owner: string;
  name: string;
  spec: FeedSpec;
  nlText: string | null;
  isPublic: boolean;
  forkedFrom: string | null;
  updatedAt: string;
};

export type Entitlements = {
  plan: "free" | "pro";
  proUntil: number | null;
  limits: { compilesPerDay: number; maxFeeds: number };
  usage: { compilesToday: number; feeds: number };
};

export type Settings = {
  address: string;
  feeds: string[];
  moderation: string[];
  mutedAuthors: string[];
  locale: "en" | "vi";
  analyticsOptOut: boolean;
};

export type Me = {
  address: string;
  key: string;
  admin: boolean;
  settings: Settings | null;
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null } | null;
  farcaster: { fid: number } | null;
  entitlements: Entitlements;
};

export type CompileResult = {
  spec: FeedSpec;
  explain: { en: string[]; vi: string[] };
  unsupported: string[];
  engine: "llm" | "heuristic";
  cached: boolean;
  entitlements: Entitlements;
};

export type Notification = {
  id: number;
  kind: "follow" | "reply" | "like" | "repost" | "mention" | "joined";
  actor: Author;
  post: Post | null;
  createdAt: number;
  read: boolean;
};

export type CandidatesResponse = { candidates: Candidate[]; posts: Post[]; now: number };
