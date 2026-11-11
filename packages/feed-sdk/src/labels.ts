/** Bộ nhãn v1: TẬP ĐÓNG. compileFeed và labeler chỉ được dùng các nhãn trong danh sách này. */
export const LABELS = {
  "topic:avalanche": { en: "Avalanche", vi: "Avalanche" },
  "topic:infra": { en: "Infra (L1, nodes, tooling)", vi: "Hạ tầng (L1, node, tooling)" },
  "topic:defi": { en: "DeFi", vi: "DeFi" },
  "topic:gaming": { en: "Gaming", vi: "Gaming" },
  "topic:ai": { en: "AI", vi: "AI" },
  "topic:grants_hackathons": { en: "Grants & hackathons", vi: "Grant & hackathon" },
  "topic:jobs": { en: "Jobs", vi: "Tuyển dụng" },
  "topic:crypto_market": { en: "Price talk & trading", vi: "Bàn giá & trading" },
  "topic:politics": { en: "Politics", vi: "Chính trị" },
  "topic:personal_life": { en: "Personal life", vi: "Đời sống cá nhân" },
  "quality:substantive": { en: "Substantive", vi: "Có nội dung" },
  "quality:engagement_bait": { en: "Engagement bait", vi: "Câu tương tác" },
  "quality:shill": { en: "Shilling", vi: "Shill" },
  "quality:low_effort": { en: "Low effort", vi: "Ít đầu tư" },
  "tone:toxic": { en: "Toxic", vi: "Độc hại" },
  "spam:manipulation": { en: "Tries to manipulate ranking", vi: "Cố thao túng xếp hạng" },
  "author:founder": { en: "Founder", vi: "Founder" },
  "author:builder": { en: "Builder", vi: "Builder" },
  "author:new_account": { en: "New account", vi: "Tài khoản mới" },
  "safety:illegal": { en: "Illegal content", vi: "Nội dung bất hợp pháp" },
  "safety:nsfw": { en: "NSFW", vi: "Nhạy cảm (NSFW)" },
  "safety:doxxing": { en: "Doxxing", vi: "Lộ thông tin cá nhân" },
  "lang:vi": { en: "Vietnamese", vi: "Tiếng Việt" },
  "lang:en": { en: "English", vi: "Tiếng Anh" },
} as const;

export type LabelId = keyof typeof LABELS;
export const LABEL_IDS = Object.keys(LABELS) as LabelId[];

/** Nhãn gắn với TÁC GIẢ (author_labels), phần còn lại gắn với bài. */
export function isAuthorLabel(label: string): boolean {
  return label.startsWith("author:");
}

/** Tín hiệu tính từ dữ liệu (không cần LLM). `recency` do rank() tự tính (0..1). */
export const SIGNALS = {
  recency: { en: "Recency (0–1)", vi: "Độ mới (0–1)" },
  reactions: { en: "Reactions", vi: "Lượt tương tác" },
  reply_count: { en: "Replies", vi: "Số trả lời" },
  distinct_repliers: { en: "Distinct repliers", vi: "Số người trả lời" },
  conversation: { en: "Real back-and-forth conversation (0/1)", vi: "Trò chuyện qua lại thật (0/1)" },
  mutual_follow: { en: "Mutual follow with you (0/1)", vi: "Follow qua lại với bạn (0/1)" },
  graph_distance: { en: "Graph distance (1 or 2 hops)", vi: "Khoảng cách graph (1 hoặc 2)" },
  author_post_rate: { en: "Author posts per day", vi: "Số bài/ngày của tác giả" },
  onchain_builder: { en: "Contracts deployed on Avalanche", vi: "Số contract đã deploy trên Avalanche" },
} as const;

export type SignalId = keyof typeof SIGNALS;
export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];
