/**
 * Labeler heuristic (keyword/regex). Dùng khi chưa có ANTHROPIC_API_KEY, khi API lỗi, và trong test.
 * So khớp trên văn bản đã bỏ dấu (fold) nên bắt được cả tiếng Việt có dấu lẫn không dấu.
 */

/** Chữ thường + bỏ dấu tiếng Việt. "Bớt tin chính trị" → "bot tin chinh tri". */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const VI_WORDS = new Set(
  "khong ko k duoc dc minh nhung cua nay voi thi nhe ae roi lam mot nguoi chung toi hay vay sao nao neu ban oi day nhu cho tu den gi j tren duoi vi nen rat qua lai moi".split(
    " ",
  ),
);

function countMatches(folded: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(folded)) n++;
  return n;
}

function score(hits: number, perHit = 0.45, base = 0.25): number {
  if (hits <= 0) return 0;
  return Math.min(1, base + hits * perHit);
}

const w = (s: string) => new RegExp(`(^|[^a-z0-9])(${s})([^a-z0-9]|$)`);

const P = {
  politics: [
    w(
      "election|elections|vote|voters|voting|ballot|parliament|senate|congress|minister|president|government|govt|policy|policies|tax|taxes|taxation|budget deficit|left[- ]wing|right[- ]wing|referendum|campaign trail|northland",
    ),
    w(
      "bau cu|chinh sach|chinh phu|quoc hoi|bo truong|thue|ngan sach|dang phai|ung cu vien|bieu tinh|luat moi|chinh tri",
    ),
  ],
  bait: [
    w(
      'comment yes|comment "yes"|type yes|like if|like neu|like nếu|rt to win|retweet to win|tag \\d|tag ba|tag 3|tag a friend|drop your|follow me|follow for|who agrees|ai dong y|ai thay dung|ai cung vay|share ngay|share de|giveaway|comment ngay|nhan qua|tha tim',
    ),
    /(👇|🔥{3,}|!!!{2,})/,
    /\b(agree\?|right\?)\s*$/,
  ],
  shill: [
    /\$[a-z]{2,10}\b/,
    w(
      "100x|1000x|10x|x100|x1000|to the moon|moon soon|mooning|gem|hidden gem|don't miss|dont miss|presale|pre-sale|pump|lambo|wagmi|ape in|aping|next big|ngon|keo thom|keo ngon|dung bo lo|len san|x10|bay mau|lai khung",
    ),
  ],
  market: [
    w(
      "price|chart|ath|bullish|bearish|pump|dump|long|short|leverage|liquidat\\w*|resistance|support level|candle|trading|trader|gia len|gia xuong|gia avax|gia coin|cat lo|chot loi|xa hang|gom hang|trade",
    ),
  ],
  avalanche: [
    w(
      "avalanche|avax|c-chain|cchain|fuji|subnet|subnets|avalanche l1|core wallet|team1|snowtrace|avacloud|teleporter|icm",
    ),
  ],
  infra: [
    w(
      "rpc|node|nodes|validator|validators|indexer|indexing|l1|l1s|evm|precompile|gas|solidity|smart contract|contracts?|sdk|devnet|testnet|tooling|foundry|hardhat|viem|ethers|deploy|deployed|deployment|latency|throughput|tps|benchmark|audit|bug|debug",
    ),
  ],
  defi: [w("defi|dex|amm|lending|liquidity|yield|swap|tvl|stablecoin|perp|perps|vault|farming")],
  gaming: [w("game|games|gaming|gamer|player|players|guild|esports|gamefi")],
  ai: [w("ai|llm|llms|agent|agents|model|models|gpt|claude|machine learning|ml|inference")],
  grants: [
    w(
      "grant|grants|hackathon|hackathons|bounty|bounties|builders cup|prize|prize pool|demo day|accelerator|retro9000|giai thuong|tai tro|cuoc thi|vong loai|nop bai",
    ),
  ],
  jobs: [
    w(
      "hiring|we're hiring|job|jobs|position|role|salary|remote|apply|resume|cv|tuyen|tuyen dung|luong|jd|ung tuyen|full-time|part-time|intern|internship",
    ),
  ],
  personal: [
    w(
      "coffee|ca phe|cafe|family|weekend|cuoi tuan|vacation|holiday|lunch|dinner|bua sang|an sang|pho|bun cha|football|bong da|gym|chay bo|my kid|con toi|vo toi|chong toi|birthday|sinh nhat|movie|phim",
    ),
  ],
  toxic: [
    w("idiot|idiots|stupid|moron|dumb|trash|clown|shut up|loser|do ngu|ngu nhu|oc cho|vo hoc|im di|rac ruoi"),
  ],
  manipulation: [
    w(
      "ignore previous|ignore all previous|system prompt|as an ai|label this|rate this post|substantive=1|substantive: 1|cham bai nay|cham diem cao|danh gia bai nay la",
    ),
    /<\/?(system|instructions?)>/,
  ],
  doxxing: [/\b0\d{9}\b/, w("home address|dia chi nha|so dien thoai cua|cccd|cmnd|passport number")],
  nsfw: [w("nsfw|18\\+|porn|nude")],
  lowEffort: [/^\s*(gm|gn|wagmi|lfg|this|same|nice|ok|\+1|👍|🔥|🚀)[\s!.🔥🚀👍]*$/u],
} satisfies Record<string, RegExp[]>;

export type LabelScores = Record<string, number>;

function detectLang(text: string, folded: string): "vi" | "en" {
  if (VI_CHARS.test(text)) return "vi";
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  let viHits = 0;
  const seen = new Set<string>();
  for (const word of words) {
    if (VI_WORDS.has(word) && !seen.has(word)) {
      seen.add(word);
      viHits++;
    }
  }
  return viHits >= 2 ? "vi" : "en";
}

/** Nhãn bài theo heuristic. Trả về điểm 0..1 cho các nhãn có tín hiệu (nhãn vắng mặt = 0). */
export function heuristicPostLabels(text: string): LabelScores {
  const folded = fold(text);
  const out: LabelScores = {};
  const set = (label: string, value: number) => {
    if (value > 0) out[label] = Math.round(Math.min(1, value) * 100) / 100;
  };

  out[`lang:${detectLang(text, folded)}`] = 1;

  const bait = countMatches(folded, P.bait);
  const shill = countMatches(folded, P.shill);
  set("topic:politics", score(countMatches(folded, P.politics)));
  set("quality:engagement_bait", score(bait, 0.5, 0.3));
  set("quality:shill", score(shill, 0.45, 0.3));
  set("topic:crypto_market", score(countMatches(folded, P.market), 0.4, 0.2));
  set("topic:avalanche", score(countMatches(folded, P.avalanche)));
  set("topic:infra", score(countMatches(folded, P.infra), 0.35, 0.2));
  set("topic:defi", score(countMatches(folded, P.defi)));
  set("topic:gaming", score(countMatches(folded, P.gaming)));
  set("topic:ai", score(countMatches(folded, P.ai)));
  set("topic:grants_hackathons", score(countMatches(folded, P.grants), 0.5, 0.3));
  set("topic:jobs", score(countMatches(folded, P.jobs), 0.4, 0.2));
  set("topic:personal_life", score(countMatches(folded, P.personal)));
  set("tone:toxic", score(countMatches(folded, P.toxic), 0.5, 0.3));
  set("spam:manipulation", score(countMatches(folded, P.manipulation), 0.5, 0.4));
  set("safety:doxxing", score(countMatches(folded, P.doxxing), 0.3, 0.3));
  set("safety:nsfw", score(countMatches(folded, P.nsfw), 0.5, 0.3));

  // Có nội dung: đủ dài, nhiều câu, có chi tiết cụ thể (số, thuật ngữ), không phải bait/shill.
  const chars = text.trim().length;
  const words = text.trim().split(/\s+/).length;
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 12).length;
  const hasDetail = /\d/.test(text) || countMatches(folded, P.infra) + countMatches(folded, P.defi) > 0;
  let substantive = 0;
  if (chars >= 120 && words >= 18) substantive = 0.45 + Math.min(0.3, (chars - 120) / 600);
  if (sentences >= 2) substantive += 0.1;
  if (hasDetail) substantive += 0.15;
  if (bait > 0 || shill > 0) substantive -= 0.4;
  set("quality:substantive", Math.max(0, substantive));

  const lowEffort = countMatches(folded, P.lowEffort) > 0 || chars < 20 ? 0.9 : 0;
  set("quality:low_effort", lowEffort);
  return out;
}

const FOUNDER = [
  w("founder|co-founder|cofounder|ceo|founded|sang lap|nha sang lap|dong sang lap|startup cua toi"),
];
const BUILDER = [
  w(
    "dev|developer|engineer|builder|building|solidity|smart contracts?|rust|typescript|full-?stack|backend|frontend|l1|protocol|ky su|lap trinh|code|coder|hacker",
  ),
];

export type AuthorStats = {
  bio?: string | null;
  firstSeenAt?: number | null;
  now: number;
  contractsDeployed?: number;
};

/** Nhãn tác giả theo heuristic: founder/builder từ bio, new_account từ thời điểm xuất hiện đầu tiên. */
export function heuristicAuthorLabels(stats: AuthorStats): LabelScores {
  const out: LabelScores = {};
  const bio = fold(stats.bio ?? "");
  if (countMatches(bio, FOUNDER) > 0) out["author:founder"] = 0.8;
  let builder = countMatches(bio, BUILDER) > 0 ? 0.7 : 0;
  if ((stats.contractsDeployed ?? 0) > 0) builder = Math.max(builder, 0.9);
  if (builder > 0) out["author:builder"] = builder;
  if (stats.firstSeenAt && stats.now - stats.firstSeenAt < 7 * 86400) out["author:new_account"] = 1;
  return out;
}
