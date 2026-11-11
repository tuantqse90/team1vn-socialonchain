# socialonchain

**One identity, one graph, thousands of feeds.** A social protocol on Avalanche (Fuji): your wallet is your identity, the social graph lives onchain and any app can read it, and you choose your own feed algorithm, written in plain English or Vietnamese.

**Một danh tính, một graph, hàng nghìn feed.** Mạng xã hội onchain trên Avalanche (Fuji): ví là danh tính, graph nằm onchain cho mọi app cùng đọc, và bạn tự chọn thuật toán feed bằng lời (EN/VI).

## Quick start (local, no API keys)

Requirements: Node ≥ 22.12 (see `.nvmrc`), pnpm 11, Docker, Foundry.

```bash
pnpm i
pnpm dev:local --seed     # Postgres + Anvil + deploy + migrate + seed + indexer + worker + web
```

- Web: http://localhost:3000
- API + OpenAPI: http://localhost:42069/openapi.json

Everything external (Anthropic, Neynar, Avalanche Data API) has a mock/fixture mode, selected in `.env` (`LABELER_MODE`, `FARCASTER_MODE`, `BUILDER_MODE`).

## Repo

| Path | What |
|---|---|
| `contracts/` | Foundry. Core: IdentityRegistry, SocialGraph, Posts (no admin, not upgradeable). Client: TestUSD, PlanPayments |
| `packages/protocol` | ABIs, addresses per chain, post/channel ids, session-key auth, signed label batches |
| `packages/feed-sdk` | FeedSpec (zod + JSON Schema), closed label set, signals, pure `rank()`, `compileFeed()` |
| `packages/db` | Drizzle schemas: `chain` (replayable from events) and `app` (offchain, back it up) |
| `apps/indexer` | Event indexer + REST API (Hono + zod-openapi) |
| `apps/worker` | pg-boss jobs: labeler, ingest-farcaster, onchain-builder, notifier |
| `apps/web` | Next.js PWA. Client B = same app with `NEXT_PUBLIC_CLIENT_CONFIG=b` |
| `docs/` | ARCHITECTURE, COSTS, LIMITATIONS, MODERATION, FORK |

## Commands

```bash
pnpm test                 # vitest in every package
pnpm lint && pnpm typecheck
pnpm contracts:test       # forge test
pnpm indexer:replay       # rebuild chain state from the deploy block
pnpm eval:labeler         # precision/recall on evals/labeler/golden.jsonl
pnpm snapshot:export      # dump graph + onchain posts to JSON
pnpm e2e                  # Playwright (needs dev:local running)
```

## Build your own client

See [`docs/FORK.md`](docs/FORK.md). The graph, posts and feed specs are public; a new client only needs the ABIs in `packages/protocol` and the REST API.

## Status

Testnet only (Avalanche Fuji, chainId 43113). See [`PROGRESS.md`](PROGRESS.md) and [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).
