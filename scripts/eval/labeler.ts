/**
 * pnpm eval:labeler — đo precision/recall/F1 của labeler trên evals/labeler/golden.jsonl.
 * LABELER_MODE=llm + ANTHROPIC_API_KEY → đo LLM; mặc định đo heuristic (CI không cần key).
 * Thoát mã 1 nếu F1 thấp hơn ngưỡng tối thiểu (chống tụt chất lượng khi đổi prompt/model).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  heuristicPostLabels,
  labelerSystemPrompt,
  labelerUserPrompt,
  parseLabelerOutput,
} from "@socialonchain/feed-sdk";
import { createAnthropicLlm } from "@socialonchain/llm";

type Golden = { id: string; text: string; lang: string; expected: Record<string, 0 | 1>; note?: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const golden = readFileSync(join(root, "evals/labeler/golden.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Golden);
const LABELS = ["topic:politics", "quality:engagement_bait", "quality:shill", "quality:substantive"] as const;
const THRESHOLD = 0.5;
// Ngưỡng tối thiểu theo engine (đặt theo lần đo đầu, xem evals/labeler/README.md)
const MIN_F1: Record<string, number> = { heuristic: 0.72, llm: 0.75 };

const useLlm = process.env.LABELER_MODE === "llm" && Boolean(process.env.ANTHROPIC_API_KEY);
const engine = useLlm ? "llm" : "heuristic";
const predictions = new Map<string, Record<string, number>>();

if (useLlm) {
  const llm = createAnthropicLlm({ model: process.env.LABELER_MODEL ?? "claude-haiku-5-5", effort: "low" });
  for (let i = 0; i < golden.length; i += 20) {
    const batch = golden.slice(i, i + 20).map((g) => ({ id: g.id, text: g.text }));
    const text = await llm({
      system: labelerSystemPrompt(),
      user: labelerUserPrompt(batch),
      maxTokens: 8000,
    });
    for (const [id, l] of parseLabelerOutput(
      text,
      batch.map((b) => b.id),
    ))
      predictions.set(id, l);
  }
} else {
  for (const g of golden) predictions.set(g.id, heuristicPostLabels(g.text));
}

const rows: {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}[] = [];
const errors: { id: string; label: string; expected: number; got: number; text: string }[] = [];
for (const label of LABELS) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const g of golden) {
    const got = (predictions.get(g.id)?.[label] ?? 0) >= THRESHOLD ? 1 : 0;
    const exp = g.expected[label] ?? 0;
    if (got && exp) tp++;
    else if (got && !exp) fp++;
    else if (!got && exp) fn++;
    if (got !== exp)
      errors.push({
        id: g.id,
        label,
        expected: exp,
        got: predictions.get(g.id)?.[label] ?? 0,
        text: g.text.slice(0, 90),
      });
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  rows.push({ label, tp, fp, fn, precision, recall, f1 });
}
const macroF1 = rows.reduce((s, r) => s + r.f1, 0) / rows.length;

console.log(`\nLabeler eval · engine=${engine} · ${golden.length} posts · threshold ${THRESHOLD}\n`);
console.log("label                      P      R      F1    (tp/fp/fn)");
for (const r of rows) {
  console.log(
    `${r.label.padEnd(26)} ${r.precision.toFixed(2)}   ${r.recall.toFixed(2)}   ${r.f1.toFixed(2)}  (${r.tp}/${r.fp}/${r.fn})`,
  );
}
console.log(`\nmacro F1 = ${macroF1.toFixed(3)} (min ${MIN_F1[engine]})`);

const outDir = join(root, "evals/labeler/results");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, `${engine}-latest.json`),
  `${JSON.stringify({ engine, at: new Date().toISOString(), macroF1, rows, errors }, null, 2)}\n`,
);
if (macroF1 < (MIN_F1[engine] ?? 0)) {
  console.error("F1 dưới ngưỡng tối thiểu");
  process.exit(1);
}
