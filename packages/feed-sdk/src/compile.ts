import { fold } from "./heuristics";
import { isAuthorLabel, LABELS, type LabelId } from "./labels";
import { extractJson, type LlmCall, signalsDoc } from "./llm";
import { type Condition, type FeedSpec, FeedSpecSchema, type Rule } from "./spec";

export type CompileResult = {
  spec: FeedSpec;
  explain: { en: string[]; vi: string[] };
  /** Các yêu cầu không map được vào nhãn/tín hiệu. UI phải nói thật với user. */
  unsupported: string[];
  engine: "llm" | "heuristic";
};

const DEFAULT_SOURCES = [
  "self",
  "following",
  "replies_in_my_threads",
  "farcaster:following",
  "farcaster:channel:avalanche",
];

function baseSpec(current?: FeedSpec): FeedSpec {
  return (
    current ?? {
      v: 1,
      name: "My feed",
      sources: DEFAULT_SOURCES,
      rules: [],
      recencyHalfLifeHours: 24,
      diversity: { maxPerAuthor: 3 },
    }
  );
}

// ---------------- Heuristic compiler (fallback, không cần LLM) ----------------

type Intent = "less" | "hide" | "more";

const LESS = /(bot|it hon|it lai|giam|less|fewer|reduce|tone down|bot lai|han che)/;
const HIDE =
  /(bo qua|bo het|an het|an di|khong muon|khong xem|ko xem|k xem|hide|no more|skip|remove|block|chan|tranh|loai bo|without|^no |\bno\b|bo\b)/;
const MORE =
  /(uu tien|them|nhieu hon|more|prioriti[sz]e|boost|show me|focus|tap trung|muon xem|cho toi xem|highlight)/;

type Concept = { match: RegExp; build: (intent: Intent) => Rule | null; en: string; vi: string };

function labelRule(label: LabelId, intent: Intent, weights = { more: 0.6, less: 0.7 }): Rule {
  const cond: Condition = { label, gte: intent === "hide" ? 0.7 : 0.5 };
  if (intent === "hide") return { when: cond, action: "hide" };
  if (intent === "less") return { when: cond, action: "downrank", weight: weights.less };
  return { when: cond, action: "boost", weight: weights.more };
}

const CONCEPTS: Concept[] = [
  {
    match: /(chinh tri|politic|election|bau cu)/,
    build: (i) => labelRule("topic:politics", i === "more" ? "more" : i, { more: 0.5, less: 0.8 }),
    en: "politics",
    vi: "chính trị",
  },
  {
    match: /(cau tuong tac|cau like|cau view|engagement bait|bait|farm tuong tac|xin like)/,
    build: (i) =>
      labelRule("quality:engagement_bait", i === "more" ? "hide" : i === "less" ? "less" : "hide"),
    en: "engagement bait",
    vi: "câu tương tác",
  },
  {
    match: /(shill|keo|token shilling|lua ga|pump coin)/,
    build: (i) => labelRule("quality:shill", i === "more" ? "hide" : i),
    en: "shilling",
    vi: "shill",
  },
  {
    match: /(gia|price|trading|chart|ban gia|market talk|trade)/,
    build: (i) => labelRule("topic:crypto_market", i),
    en: "price talk",
    vi: "bàn giá",
  },
  {
    match: /(toxic|doc hai|chui bay|chui|cay cu|hate)/,
    build: () => labelRule("tone:toxic", "hide"),
    en: "toxicity",
    vi: "độc hại",
  },
  {
    match: /(founder|nha sang lap|sang lap)s?([a-z ]*?(co noi dung|substan\w*|chat luong))?/,
    build: (i) => {
      if (i === "hide" || i === "less") return labelRule("author:founder", i);
      return {
        when: {
          all: [
            { label: "author:founder", gte: 0.6 },
            { label: "quality:substantive", gte: 0.6 },
          ],
        },
        action: "boost",
        weight: 0.7,
        explain: { en: "Founder writing with substance", vi: "Founder viết có nội dung" },
      };
    },
    en: "founders with substance",
    vi: "founder viết có nội dung",
  },
  {
    match: /(builder|nguoi build|dev\b|developer|ship|verified)/,
    build: (i) =>
      i === "more"
        ? {
            when: { signal: "onchain_builder", gte: 1 },
            action: "boost",
            weight: 0.6,
            explain: {
              en: "Verified builder (deployed contracts)",
              vi: "Builder đã xác minh (có deploy contract)",
            },
          }
        : labelRule("author:builder", i),
    en: "builders",
    vi: "builder",
  },
  {
    match: /(tro chuyen|conversation|thao luan|discussion|hoi thoai|reply qua lai)/,
    build: (i) =>
      i === "more"
        ? {
            when: { signal: "conversation", gte: 1 },
            action: "boost",
            weight: 0.6,
            explain: { en: "Real back-and-forth conversation", vi: "Cuộc trò chuyện qua lại thật" },
          }
        : { when: { signal: "conversation", gte: 1 }, action: "downrank", weight: 0.4 },
    en: "real conversations",
    vi: "cuộc trò chuyện thật",
  },
  {
    match: /(co noi dung|substan|thoughtful|chat luong|deep dive|chuyen sau)/,
    build: (i) => labelRule("quality:substantive", i === "hide" ? "less" : i),
    en: "substantive posts",
    vi: "bài có nội dung",
  },
  {
    match: /(low effort|hoi hot|spam gm|bai ngan|gm gm)/,
    build: (i) => labelRule("quality:low_effort", i === "more" ? "less" : i),
    en: "low-effort posts",
    vi: "bài ít đầu tư",
  },
  {
    match: /(avalanche|avax|c-chain|fuji)/,
    build: (i) => labelRule("topic:avalanche", i),
    en: "Avalanche",
    vi: "Avalanche",
  },
  {
    match: /(infra|ha tang|l1\b|subnet|node|validator|tooling)/,
    build: (i) => labelRule("topic:infra", i),
    en: "infra",
    vi: "hạ tầng",
  },
  { match: /(defi|dex|lending|yield)/, build: (i) => labelRule("topic:defi", i), en: "DeFi", vi: "DeFi" },
  { match: /(gaming|game)/, build: (i) => labelRule("topic:gaming", i), en: "gaming", vi: "gaming" },
  { match: /(\bai\b|llm|agent)/, build: (i) => labelRule("topic:ai", i), en: "AI", vi: "AI" },
  {
    match: /(grant|hackathon|bounty|tai tro|cuoc thi)/,
    build: (i) => labelRule("topic:grants_hackathons", i, { more: 0.8, less: 0.6 }),
    en: "grants & hackathons",
    vi: "grant & hackathon",
  },
  {
    match: /(job|tuyen dung|hiring|viec lam|tuyen)/,
    build: (i) => labelRule("topic:jobs", i),
    en: "jobs",
    vi: "tuyển dụng",
  },
  {
    match: /(tai khoan moi|new account|acc moi|clone)/,
    build: (i) => labelRule("author:new_account", i === "more" ? "more" : "less", { more: 0.3, less: 0.6 }),
    en: "new accounts",
    vi: "tài khoản mới",
  },
  {
    match: /(doi song|personal|ca nhan|an uong|ca phe|coffee)/,
    build: (i) => labelRule("topic:personal_life", i),
    en: "personal life",
    vi: "đời sống cá nhân",
  },
];

function intentOf(clause: string): Intent {
  if (HIDE.test(clause)) return "hide";
  if (LESS.test(clause)) return "less";
  if (MORE.test(clause)) return "more";
  return "more";
}

/** Khoá điều kiện bỏ qua ngưỡng: "bớt chính trị" rồi "ẩn chính trị" thì rule sau thay rule trước. */
function conditionKey(c: Condition): string {
  if ("label" in c) return `label:${c.label}`;
  if ("signal" in c) return `signal:${c.signal}`;
  return JSON.stringify(c);
}

function sameCondition(a: Rule, b: Rule): boolean {
  return conditionKey(a.when) === conditionKey(b.when);
}

function ruleText(rule: Rule): { en: string; vi: string } {
  if (rule.explain) return rule.explain;
  const c = rule.when;
  const label = "label" in c ? LABELS[c.label] : null;
  const name = label ?? { en: "matching posts", vi: "bài phù hợp" };
  if (rule.action === "hide")
    return { en: `Hide ${name.en.toLowerCase()}`, vi: `Ẩn ${name.vi.toLowerCase()}` };
  if (rule.action === "downrank")
    return { en: `Less ${name.en.toLowerCase()}`, vi: `Bớt ${name.vi.toLowerCase()}` };
  return { en: `More ${name.en.toLowerCase()}`, vi: `Ưu tiên ${name.vi.toLowerCase()}` };
}

/** Biên dịch câu EN/VI thành FeedSpec bằng luật từ khoá. Chỉ dùng nhãn trong tập đóng. */
export function compileFeedHeuristic(nlText: string, current?: FeedSpec): CompileResult {
  const spec = structuredClone(baseSpec(current));
  const clauses = fold(nlText)
    .split(/[,;\n.]|\s(?:va|and|nhung|but|con|roi)\s|\+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
  const originalClauses = nlText
    .split(/[,;\n.]|\s(?:và|va|and|nhưng|nhung|but|còn|con|rồi|roi)\s|\+/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
  const unsupported: string[] = [];
  const added: Rule[] = [];

  clauses.forEach((clause, idx) => {
    const intent = intentOf(clause);
    let matched = false;
    let rest = clause;
    for (const concept of CONCEPTS) {
      const m = rest.match(concept.match);
      if (!m) continue;
      // Phần đã khớp bị "tiêu thụ" để concept sau không khớp lại (vd "founder có nội dung").
      rest = rest.replace(m[0], " ");
      matched = true;
      const rule = concept.build(intent);
      if (!rule) continue;
      const withText = { ...rule, explain: rule.explain ?? ruleText(rule) };
      spec.rules = spec.rules.filter((r) => !sameCondition(r, withText));
      spec.rules.push(withText);
      added.push(withText);
    }
    if (!matched) unsupported.push(originalClauses[idx] ?? clause);
  });

  spec.rules = spec.rules.slice(-30);
  const explain = {
    en: spec.rules.map((r) => ruleText(r).en),
    vi: spec.rules.map((r) => ruleText(r).vi),
  };
  spec.explain = explain;
  return { spec: FeedSpecSchema.parse(spec), explain, unsupported, engine: "heuristic" };
}

// ---------------- LLM compiler ----------------

export function compilerSystemPrompt(): string {
  const labels = Object.entries(LABELS)
    .map(([k, v]) => `- ${k}${isAuthorLabel(k) ? " (author label)" : ""}: ${v.en}`)
    .join("\n");
  return [
    "You turn a user's natural-language feed preferences (English or Vietnamese, possibly without diacritics) into a FeedSpec JSON.",
    "You may ONLY use the labels and signals listed below. Never invent labels, signals or sources.",
    "If part of the request cannot be expressed with them, put that part (verbatim) into `unsupported` instead of guessing.",
    "Prefer: 'less/bớt' → downrank (weight 0.5–0.8); 'hide/bỏ/ẩn/no' → hide; 'more/ưu tiên/thêm' → boost (weight 0.4–0.8).",
    "Each rule must include `explain` with short `en` and `vi` text shown to the user.",
    "",
    "Labels:",
    labels,
    "",
    "Signals:",
    signalsDoc(),
    "",
    "Condition forms: {label, gte?, lte?} | {signal, gte?, lte?} | {all:[...]} | {any:[...]} | {not: ...}.",
    "Allowed sources: following, replies_in_my_threads, two_hop, self, all, farcaster:following, channel:<name>, farcaster:channel:<name>.",
    "",
    'Example. Input: "bớt tin chính trị đi, ưu tiên founder viết có nội dung, ưu tiên các cuộc trò chuyện thật, bỏ qua bài câu tương tác"',
    'Rules: [{"when":{"label":"topic:politics","gte":0.5},"action":"downrank","weight":0.8,"explain":{"en":"Less politics","vi":"Bớt tin chính trị"}},',
    '{"when":{"all":[{"label":"author:founder","gte":0.6},{"label":"quality:substantive","gte":0.6}]},"action":"boost","weight":0.7,"explain":{"en":"Founders writing with substance","vi":"Founder viết có nội dung"}},',
    '{"when":{"signal":"conversation","gte":1},"action":"boost","weight":0.6,"explain":{"en":"Real conversations","vi":"Cuộc trò chuyện thật"}},',
    '{"when":{"label":"quality:engagement_bait","gte":0.7},"action":"hide","explain":{"en":"Hide engagement bait","vi":"Bỏ qua bài câu tương tác"}}]',
    "",
    'Answer with JSON only: {"spec": <FeedSpec v1>, "unsupported": [string]}',
  ].join("\n");
}

export async function compileFeed(
  nlText: string,
  opts: { current?: FeedSpec; llm?: LlmCall } = {},
): Promise<CompileResult> {
  if (!opts.llm) return compileFeedHeuristic(nlText, opts.current);
  const base = baseSpec(opts.current);
  let user = `Current spec:\n${JSON.stringify(base)}\n\nUser request:\n${nlText}\n\nReturn the updated full spec (keep existing rules unless the request changes them).`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await opts.llm({ system: compilerSystemPrompt(), user, maxTokens: 2000 });
      const json = extractJson(text) as { spec?: unknown; unsupported?: unknown };
      const spec = FeedSpecSchema.parse(json.spec);
      const unsupported = Array.isArray(json.unsupported)
        ? json.unsupported.filter((x): x is string => typeof x === "string")
        : [];
      const explain = {
        en: spec.rules.map((r) => ruleText(r).en),
        vi: spec.rules.map((r) => ruleText(r).vi),
      };
      return { spec: { ...spec, explain }, explain, unsupported, engine: "llm" };
    } catch (err) {
      user += `\n\nYour previous answer was invalid: ${(err as Error).message.slice(0, 500)}. Return valid JSON only.`;
    }
  }
  return compileFeedHeuristic(nlText, opts.current);
}
