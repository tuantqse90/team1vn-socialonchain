import { isAuthorLabel, LABELS, type LabelId, SIGNALS, type SignalId } from "./labels";
import type { Condition, FeedSpec, Rule } from "./spec";

/** Một bài ứng viên đã kèm nhãn và tín hiệu. Dữ liệu thuần, không I/O. */
export type Candidate = {
  id: string;
  author: string;
  createdAt: number; // unix giây
  /** Các nguồn mà bài khớp, ví dụ ["following", "farcaster:channel:avalanche"]. */
  origins: string[];
  labels: Partial<Record<string, number>>;
  authorLabels: Partial<Record<string, number>>;
  signals: Partial<Record<SignalId, number>>;
};

export type Localized = { en: string; vi: string };

export type Reason = {
  origin: "feed" | "moderation";
  specName: string;
  ruleIndex: number;
  action: Rule["action"];
  weight: number;
  text: Localized;
};

export type RankedItem = { id: string; score: number; reasons: Reason[] };

export type RankOptions = {
  /** Thời điểm hiện tại (unix giây). Truyền vào để rank() tất định. */
  now: number;
  /** Các moderation stack của viewer, áp lên mọi feed trước rule của feed. */
  moderation?: FeedSpec[];
  limit?: number;
};

export type RankResult = { items: RankedItem[]; hidden: number; filteredBySource: number };

const DEFAULT_WEIGHT = 0.5;

function conditionValue(
  c: Extract<Condition, { label: string }> | Extract<Condition, { signal: string }>,
  cand: Candidate,
  recency: number,
): number {
  if ("label" in c) {
    const bag = isAuthorLabel(c.label) ? cand.authorLabels : cand.labels;
    return bag[c.label] ?? 0;
  }
  if (c.signal === "recency") return recency;
  return cand.signals[c.signal] ?? 0;
}

export function matches(c: Condition, cand: Candidate, recency: number): boolean {
  if ("all" in c) return c.all.every((x) => matches(x, cand, recency));
  if ("any" in c) return c.any.some((x) => matches(x, cand, recency));
  if ("not" in c) return !matches(c.not, cand, recency);
  const v = conditionValue(c, cand, recency);
  const hasBound = c.gte !== undefined || c.lte !== undefined;
  const gte = hasBound ? c.gte : "label" in c ? 0.5 : 1;
  if (gte !== undefined && v < gte) return false;
  if (c.lte !== undefined && v > c.lte) return false;
  return true;
}

/** Mô tả điều kiện bằng lời (EN/VI), dùng khi rule không có `explain`. */
export function describeCondition(c: Condition): Localized {
  if ("all" in c) {
    const parts = c.all.map(describeCondition);
    return { en: parts.map((p) => p.en).join(" + "), vi: parts.map((p) => p.vi).join(" + ") };
  }
  if ("any" in c) {
    const parts = c.any.map(describeCondition);
    return { en: parts.map((p) => p.en).join(" or "), vi: parts.map((p) => p.vi).join(" hoặc ") };
  }
  if ("not" in c) {
    const inner = describeCondition(c.not);
    return { en: `not ${inner.en}`, vi: `không phải ${inner.vi}` };
  }
  const name = "label" in c ? LABELS[c.label as LabelId] : SIGNALS[c.signal as SignalId];
  return { en: name.en, vi: name.vi };
}

function describeRule(rule: Rule): Localized {
  if (rule.explain) return rule.explain;
  const cond = describeCondition(rule.when);
  const verb = {
    boost: { en: "Boosted", vi: "Ưu tiên" },
    downrank: { en: "Less of", vi: "Giảm" },
    hide: { en: "Hidden", vi: "Ẩn" },
  }[rule.action];
  return { en: `${verb.en}: ${cond.en}`, vi: `${verb.vi}: ${cond.vi}` };
}

function sourceMatches(spec: FeedSpec, cand: Candidate): boolean {
  if (spec.sources.includes("all")) return true;
  return cand.origins.some((o) => spec.sources.includes(o));
}

/**
 * Xếp hạng thuần: không I/O, tất định, chạy được cả trên server lẫn trong trình duyệt.
 * Pipeline: sources → moderation stack → rules của feed → diversity.
 */
export function rank(spec: FeedSpec, candidates: Candidate[], opts: RankOptions): RankResult {
  const halfLifeSec = spec.recencyHalfLifeHours * 3600;
  const stages: { origin: Reason["origin"]; spec: FeedSpec }[] = [
    ...(opts.moderation ?? []).map((m) => ({ origin: "moderation" as const, spec: m })),
    { origin: "feed" as const, spec },
  ];

  let hidden = 0;
  let filteredBySource = 0;
  const scored: (RankedItem & { createdAt: number; author: string })[] = [];

  for (const cand of candidates) {
    if (!sourceMatches(spec, cand)) {
      filteredBySource++;
      continue;
    }
    const age = Math.max(0, opts.now - cand.createdAt);
    const recency = 2 ** (-age / halfLifeSec);
    let score = recency;
    const reasons: Reason[] = [];
    let isHidden = false;

    for (const stage of stages) {
      stage.spec.rules.forEach((rule, ruleIndex) => {
        if (isHidden || !matches(rule.when, cand, recency)) return;
        const weight = rule.weight ?? DEFAULT_WEIGHT;
        const reason: Reason = {
          origin: stage.origin,
          specName: stage.spec.name,
          ruleIndex,
          action: rule.action,
          weight,
          text: describeRule(rule),
        };
        if (rule.action === "hide") {
          isHidden = true;
          return;
        }
        score += rule.action === "boost" ? weight : -weight;
        reasons.push(reason);
      });
      if (isHidden) break;
    }

    if (isHidden) {
      hidden++;
      continue;
    }
    scored.push({
      id: cand.id,
      score: Math.round(score * 1e6) / 1e6,
      reasons,
      createdAt: cand.createdAt,
      author: cand.author,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt || a.id.localeCompare(b.id));

  const maxPerAuthor = spec.diversity?.maxPerAuthor;
  const perAuthor = new Map<string, number>();
  const items: RankedItem[] = [];
  for (const s of scored) {
    if (maxPerAuthor !== undefined) {
      const n = perAuthor.get(s.author) ?? 0;
      if (n >= maxPerAuthor) continue;
      perAuthor.set(s.author, n + 1);
    }
    items.push({ id: s.id, score: s.score, reasons: s.reasons });
    if (opts.limit !== undefined && items.length >= opts.limit) break;
  }
  return { items, hidden, filteredBySource };
}
