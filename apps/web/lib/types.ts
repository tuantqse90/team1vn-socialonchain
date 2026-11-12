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
  /** Chỉ có trong danh sách người (thông báo, tìm kiếm, gợi ý builder) khi biết người xem. */
  viewerFollows?: boolean;
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

/** origins: nguồn đưa bài vào candidate, vd. `following`, `following:2hop`, `farcaster:channel:avalanche`. */
export type FeedItem = { post: Post; score: number; reasons: Reason[]; origins?: string[] };
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
  /** Block của tx đăng ký (link explorer). */
  registeredBlock: number | null;
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null; links: string[] };
  counts: { followers: number; following: number; posts: number };
  builder: { contractsDeployed: number; chains: Record<string, number>; checkedAt: string } | null;
  farcaster: { fid: number; username: string } | null;
  authorLabels: Record<string, number>;
  /** Tối đa 3 nhãn `topic:*` hay gặp nhất trong bài của user. */
  topTopics: string[];
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
  /** Số người dùng feed này làm tab (offchain). Có ở `GET /feeds`. */
  subscribers?: number;
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
  /** Kênh đã tham gia (offchain). */
  channels: string[];
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
  /** Với reply: bài của mình được trả lời (rút gọn 140 ký tự). */
  parent?: { id: string; text: string; deleted: boolean } | null;
  createdAt: number;
  read: boolean;
};

export type ChannelStats = {
  name: string;
  posts: number;
  posts24h: number;
  /** Số bài/giờ trung bình trong 24h. */
  perHour: number;
  members: number;
  /** null khi chưa đăng nhập. Chỉ có ở `GET /channels/{name}`. */
  joined?: boolean | null;
};

export type CandidatesResponse = { candidates: Candidate[]; posts: Post[]; now: number };
