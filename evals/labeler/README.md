# Labeler eval

`golden.jsonl`: 100 fictional posts (EN + VI, 12 without diacritics, some teencode) with expected 0/1 for
`topic:politics`, `quality:engagement_bait`, `quality:shill`, `quality:substantive`. Hard cases: founder updates vs shill,
humble-brags, sarcasm, onchain DAO votes (not politics), genuine questions (not bait).

```bash
pnpm eval:labeler                                   # heuristic (no key)
LABELER_MODE=llm ANTHROPIC_API_KEY=... pnpm eval:labeler   # LLM (LABELER_MODEL, default claude-haiku-5-5)
```

Results are written to `results/<engine>-latest.json` (includes every miss). The script exits 1 when macro F1 falls below
the floor (`heuristic` 0.72, `llm` 0.75), so CI catches regressions when the prompt, model or heuristics change.

## Baseline (2026-11-11)

| Engine | politics F1 | bait F1 | shill F1 | substantive F1 | macro F1 |
|---|---|---|---|---|---|
| heuristic | 0.75 | 0.67 | 0.87 | 0.81 | **0.776** |
| llm (`claude-haiku-5-5`) | not measured yet: needs `ANTHROPIC_API_KEY` | | | | |

Notes: the heuristic misses politics without explicit keywords and bait phrased politely (recall 0.5). The golden set
was written separately from the heuristic keyword lists; one keyword that matched the fictional country name was removed
to avoid overfitting.
