import {
  type FeedSpec,
  FeedSpecSchema,
  LABELS,
  type LabelId,
  type Rule,
  SourceSchema,
} from "@socialonchain/feed-sdk";
import type { IconName } from "@/components/Icon";
import { clientConfig } from "@/configs";

/**
 * Lựa chọn lúc onboarding → FeedSpec dựng ngay trên client (không tốn quota biên dịch).
 * Chỉ dùng nhãn trong tập đóng LABELS. Không hỏi/lưu thông tin cá nhân (trường học, tuổi…).
 */
export type Role = "builder" | "student" | "reader";
export const ROLES: Role[] = ["builder", "student", "reader"];

export type GoalId = "learn" | "hack" | "jobs" | "ask";
export type TopicId = "avalanche" | "ai" | "defi" | "gaming" | "hack" | "life";
export type LessId = "price" | "shill" | "politics";

export const GOALS: { id: GoalId; icon: IconName; label: LabelId }[] = [
  // Học build / Hỏi đáp chưa có nhãn riêng: ưu tiên bài có nội dung.
  { id: "learn", icon: "book", label: "quality:substantive" },
  { id: "hack", icon: "trophy", label: "topic:grants_hackathons" },
  { id: "jobs", icon: "briefcase", label: "topic:jobs" },
  { id: "ask", icon: "chat", label: "quality:substantive" },
];

export const TOPICS: { id: TopicId; label: LabelId }[] = [
  { id: "avalanche", label: "topic:avalanche" },
  { id: "ai", label: "topic:ai" },
  { id: "defi", label: "topic:defi" },
  { id: "gaming", label: "topic:gaming" },
  { id: "hack", label: "topic:grants_hackathons" },
  { id: "life", label: "topic:personal_life" },
];

export const LESS: { id: LessId; label: LabelId }[] = [
  { id: "price", label: "topic:crypto_market" },
  { id: "shill", label: "quality:shill" },
  { id: "politics", label: "topic:politics" },
];

export type Picks = { goals: GoalId[]; topics: TopicId[]; less: LessId[] };
export const DEFAULT_PICKS: Picks = {
  goals: ["learn", "hack"],
  topics: ["avalanche", "ai"],
  less: ["price", "shill"],
};

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

type L = "en" | "vi";
const short = (s: string) => s.replace(/\s*\(.*\)\s*$/, "");
const more = (l: LabelId): Rule["explain"] => ({
  en: `More ${short(LABELS[l].en)}`,
  vi: `Thêm ${short(LABELS[l].vi)}`,
});
const fewer = (l: LabelId): Rule["explain"] => ({
  en: `Less ${short(LABELS[l].en).toLowerCase()}`,
  vi: `Bớt ${short(LABELS[l].vi).toLowerCase()}`,
});

/** Rule sinh từ lựa chọn (mỗi rule trỏ về đúng 1 nhãn, có giải thích EN/VI). */
export function rulesFor(role: Role, p: Picks): Rule[] {
  const rules: Rule[] = [];
  if (role === "student") {
    if (p.goals.includes("hack"))
      rules.push({
        when: { label: "topic:grants_hackathons", gte: 0.5 },
        action: "boost",
        weight: 0.7,
        explain: more("topic:grants_hackathons"),
      });
    if (p.goals.includes("jobs"))
      rules.push({
        when: { label: "topic:jobs", gte: 0.5 },
        action: "boost",
        weight: 0.6,
        explain: more("topic:jobs"),
      });
    if (p.goals.includes("learn") || p.goals.includes("ask"))
      rules.push({
        when: { label: "quality:substantive", gte: 0.6 },
        action: "boost",
        weight: 0.5,
        explain: { en: "Substantive posts first", vi: "Ưu tiên bài có nội dung" },
      });
  }
  if (role === "reader") {
    for (const t of TOPICS)
      if (p.topics.includes(t.id))
        rules.push({
          when: { label: t.label, gte: 0.5 },
          action: "boost",
          weight: 0.6,
          explain: more(t.label),
        });
    if (p.less.includes("price"))
      rules.push({
        when: { label: "topic:crypto_market", gte: 0.5 },
        action: "downrank",
        weight: 0.7,
        explain: fewer("topic:crypto_market"),
      });
    if (p.less.includes("shill"))
      rules.push({
        when: { label: "quality:shill", gte: 0.7 },
        action: "hide",
        explain: { en: "Hide shilling", vi: "Ẩn shill" },
      });
    if (p.less.includes("politics"))
      rules.push({
        when: { label: "topic:politics", gte: 0.5 },
        action: "downrank",
        weight: 0.8,
        explain: fewer("topic:politics"),
      });
  }
  return rules;
}

/** FeedSpec hợp lệ (đã qua FeedSpecSchema) hoặc null nếu không có rule nào. */
export function buildSpec(role: Role, p: Picks, name: string): FeedSpec | null {
  const rules = rulesFor(role, p);
  if (rules.length === 0) return null;
  const sources = clientConfig.enabledSources.filter((s) => SourceSchema.safeParse(s).success);
  const pick = (k: L) => rules.map((r) => r.explain?.[k] ?? "").filter(Boolean);
  const r = FeedSpecSchema.safeParse({
    v: 1,
    name,
    sources: sources.length ? sources : ["following"],
    rules,
    recencyHalfLifeHours: 48,
    diversity: { maxPerAuthor: 3 },
    explain: { en: pick("en"), vi: pick("vi") },
  });
  return r.success ? r.data : null;
}

// ---------- Lưu tạm trong localStorage cho tới khi có JWT ----------

export type Pending = {
  role?: Role;
  picks?: Picks;
  /** Feed sẽ lưu (POST /feeds) khi đã đăng nhập bằng session key. */
  spec?: FeedSpec | null;
  /** Tên hiển thị (offchain), chỉ áp cho đúng owner đã đăng ký. */
  name?: string;
  owner?: string;
};

const KEY = "soc:onb";

export function readPending(): Pending | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Pending) : null;
  } catch {
    return null;
  }
}

export function writePending(p: Pending | null) {
  try {
    if (!p) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage bị chặn: bỏ qua, onboarding vẫn chạy
  }
}

export function patchPending(patch: Partial<Pending>) {
  writePending({ ...(readPending() ?? {}), ...patch });
}
