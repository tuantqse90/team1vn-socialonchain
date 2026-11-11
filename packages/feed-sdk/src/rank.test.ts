import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDS, MODERATION_STACKS } from "./defaults";
import { type Candidate, rank } from "./rank";
import { type FeedSpec, FeedSpecSchema, feedSpecJsonSchema, resolveSpec } from "./spec";

const NOW = 1_800_000_000;
const H = 3600;

function cand(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    author: `0x${id.padStart(40, "0")}`,
    createdAt: NOW - H,
    origins: ["following"],
    labels: {},
    authorLabels: {},
    signals: {},
    ...over,
  };
}

const base: FeedSpec = { v: 1, name: "t", sources: ["following"], rules: [], recencyHalfLifeHours: 24 };

describe("rank()", () => {
  it("chronological when no rules: newer first", () => {
    const r = rank(base, [cand("a", { createdAt: NOW - 5 * H }), cand("b", { createdAt: NOW - H })], {
      now: NOW,
    });
    expect(r.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(r.items[0]?.reasons).toEqual([]);
  });

  it("filters by source", () => {
    const r = rank(base, [cand("a"), cand("b", { origins: ["two_hop"] })], { now: NOW });
    expect(r.items.map((i) => i.id)).toEqual(["a"]);
    expect(r.filteredBySource).toBe(1);
  });

  it("boost lifts an older post above a newer one, with exactly one reason per rule", () => {
    const spec: FeedSpec = {
      ...base,
      rules: [{ when: { label: "quality:substantive", gte: 0.6 }, action: "boost", weight: 0.5 }],
    };
    const r = rank(
      spec,
      [cand("new"), cand("old", { createdAt: NOW - 10 * H, labels: { "quality:substantive": 0.9 } })],
      { now: NOW },
    );
    expect(r.items.map((i) => i.id)).toEqual(["old", "new"]);
    expect(r.items[0]?.reasons).toHaveLength(1);
    expect(r.items[0]?.reasons[0]).toMatchObject({
      origin: "feed",
      ruleIndex: 0,
      action: "boost",
      weight: 0.5,
    });
  });

  it("downrank pushes a post below", () => {
    const spec: FeedSpec = {
      ...base,
      rules: [{ when: { label: "topic:politics" }, action: "downrank", weight: 0.8 }],
    };
    const r = rank(
      spec,
      [cand("pol", { labels: { "topic:politics": 0.9 } }), cand("ok", { createdAt: NOW - 20 * H })],
      { now: NOW },
    );
    expect(r.items.map((i) => i.id)).toEqual(["ok", "pol"]);
    expect(r.items[1]?.reasons[0]?.text.vi).toContain("Chính trị");
  });

  it("hide removes and counts", () => {
    const spec: FeedSpec = {
      ...base,
      rules: [{ when: { label: "quality:engagement_bait", gte: 0.7 }, action: "hide" }],
    };
    const r = rank(spec, [cand("bait", { labels: { "quality:engagement_bait": 0.9 } }), cand("ok")], {
      now: NOW,
    });
    expect(r.items.map((i) => i.id)).toEqual(["ok"]);
    expect(r.hidden).toBe(1);
  });

  it("author labels and all/any/not conditions", () => {
    const spec: FeedSpec = {
      ...base,
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
        },
        {
          when: { not: { any: [{ label: "topic:avalanche" }, { label: "topic:infra" }] } },
          action: "downrank",
          weight: 0.1,
        },
      ],
    };
    const founderGood = cand("fg", {
      authorLabels: { "author:founder": 0.8 },
      labels: { "quality:substantive": 0.8, "topic:infra": 0.9 },
    });
    const founderFluff = cand("ff", {
      authorLabels: { "author:founder": 0.8 },
      labels: { "quality:substantive": 0.2 },
    });
    const r = rank(spec, [founderFluff, founderGood], { now: NOW });
    expect(r.items[0]?.id).toBe("fg");
    expect(r.items[0]?.reasons.map((x) => x.ruleIndex)).toEqual([0]);
    expect(r.items[1]?.reasons.map((x) => x.ruleIndex)).toEqual([1]);
  });

  it("signals: default threshold 1 for signals, onchain_builder", () => {
    const spec: FeedSpec = {
      ...base,
      rules: [{ when: { signal: "onchain_builder" }, action: "boost", weight: 0.6 }],
    };
    const r = rank(
      spec,
      [cand("a"), cand("b", { createdAt: NOW - 30 * H, signals: { onchain_builder: 3 } })],
      { now: NOW },
    );
    expect(r.items[0]?.id).toBe("b");
  });

  it("moderation stack runs first and can hide in every feed", () => {
    const r = rank(
      DEFAULT_FEEDS["default:chronological"] as FeedSpec,
      [cand("dox", { labels: { "safety:doxxing": 0.9 } }), cand("ok")],
      {
        now: NOW,
        moderation: [MODERATION_STACKS["mod:safety"] as FeedSpec],
      },
    );
    expect(r.items.map((i) => i.id)).toEqual(["ok"]);
    expect(r.hidden).toBe(1);
  });

  it("moderation downrank reasons are tagged origin=moderation", () => {
    const r = rank(base, [cand("pol", { labels: { "topic:politics": 0.9 } })], {
      now: NOW,
      moderation: [MODERATION_STACKS["mod:less-politics"] as FeedSpec],
    });
    expect(r.items[0]?.reasons[0]?.origin).toBe("moderation");
  });

  it("diversity caps posts per author", () => {
    const spec: FeedSpec = { ...base, diversity: { maxPerAuthor: 2 } };
    const same = "0xaaaa";
    const cands = [1, 2, 3, 4].map((i) => cand(`p${i}`, { author: same, createdAt: NOW - i * H }));
    const r = rank(spec, [...cands, cand("other", { createdAt: NOW - 10 * H })], { now: NOW });
    expect(r.items.map((i) => i.id)).toEqual(["p1", "p2", "other"]);
  });

  it("is deterministic and respects limit", () => {
    const cands = Array.from({ length: 50 }, (_, i) =>
      cand(`c${i}`, { createdAt: NOW - (i % 7) * H, author: `0x${i % 9}` }),
    );
    const a = rank(DEFAULT_FEEDS["default:builders-shipping"] as FeedSpec, cands, { now: NOW, limit: 10 });
    const b = rank(DEFAULT_FEEDS["default:builders-shipping"] as FeedSpec, [...cands].reverse(), {
      now: NOW,
      limit: 10,
    });
    expect(a).toEqual(b);
    expect(a.items).toHaveLength(10);
  });
});

describe("FeedSpec", () => {
  it("all default feeds and moderation stacks are valid", () => {
    for (const s of [...Object.values(DEFAULT_FEEDS), ...Object.values(MODERATION_STACKS)]) {
      expect(() => FeedSpecSchema.parse(s)).not.toThrow();
    }
  });

  it("rejects labels outside the closed set", () => {
    const bad = { ...base, rules: [{ when: { label: "topic:made_up" }, action: "boost" }] };
    expect(FeedSpecSchema.safeParse(bad).success).toBe(false);
  });

  it("exports a JSON schema", () => {
    const js = feedSpecJsonSchema();
    expect(js.type).toBe("object");
  });

  it("resolveSpec puts parent rules first", () => {
    const parent: FeedSpec = { ...base, rules: [{ when: { label: "quality:shill" }, action: "hide" }] };
    const child: FeedSpec = {
      ...base,
      extends: "p",
      rules: [{ when: { label: "topic:ai" }, action: "boost" }],
    };
    const r = resolveSpec(child, (id) => (id === "p" ? parent : undefined));
    expect(r.rules.map((x) => x.action)).toEqual(["hide", "boost"]);
  });
});
