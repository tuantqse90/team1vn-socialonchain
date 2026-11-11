# COSTS

## Gas per action (from `forge test --gas-report`)

"Exec" is execution gas reported by Foundry. A real transaction also pays 21,000 intrinsic gas plus calldata (16 gas per non-zero byte, 4 per zero byte). "Tx total" below is an estimate for typical input.

| Action | Contract | Exec gas (avg / max) | Tx total (est.) | Who signs |
|---|---|---|---|---|
| `registerWithDelegate` (handle + profile URI + session key, forwards AVAX) | IdentityRegistry | 155k | ~180k | owner wallet (once) |
| `register` | IdentityRegistry | 26k–95k | ~120k | owner |
| `addDelegate` (renew session key) | IdentityRegistry | ~46k | ~70k | owner |
| `removeDelegate` | IdentityRegistry | ~29k | ~50k | owner |
| `setProfile` | IdentityRegistry | ~26k | ~55k | session key |
| `post` (≈200-byte text) | Posts | 58k / 100k | ~85k | session key |
| `react` / `unreact` | Posts | ~28k | ~50k | session key |
| `deletePost` | Posts | ~30k | ~52k | session key |
| `follow` / `unfollow` | SocialGraph | 28k / 52k | ~52k | session key |
| `followMany` (50 targets, import) | SocialGraph | ~1.25M | ~1.3M | session key |
| `faucet` (10 tUSD) | TestUSD | ~67k | ~90k | owner |
| `pay` (after approve) | PlanPayments | ~92k | ~115k | owner |
| `payWithPermit` | PlanPayments | ~125k | ~150k | owner |

## In AVAX

Avalanche C-Chain uses a dynamic base fee. Check the current gas price on https://testnet.snowtrace.io/gastracker before trusting these numbers.

| Action | @ 1 nAVAX/gas | @ 25 nAVAX/gas |
|---|---|---|
| Onboarding (`registerWithDelegate`) | 0.00018 AVAX | 0.0045 AVAX |
| One post | 0.000085 AVAX | 0.0021 AVAX |
| One follow / like | 0.00005 AVAX | 0.0013 AVAX |
| Import 50 follows | 0.0013 AVAX | 0.033 AVAX |

Default session key funding is **0.05 AVAX** (`DEFAULT_SESSION_FUNDING_WEI`): ≈ 500+ posts at 1 nAVAX, ≈ 20 posts at 25 nAVAX. The web app shows the session key balance and a "top up" button.

Test AVAX on Fuji: https://build.avax.network/console/primary-network/faucet (see https://build.avax.network/docs/dapps/smart-contract-dev/get-test-funds).

## Offchain running costs (estimate, Alpha ≤ 200 users)

| Item | Estimate / month | Notes |
|---|---|---|
| Railway (indexer + worker + Postgres) | $10–25 | Hobby plan + usage |
| Vercel (web) | $0 | Hobby plan |
| Anthropic labeler (`claude-haiku-5-5`, batches of 20 posts) | $5–20 | ~10k posts/month incl. Farcaster ingest; heuristic fallback costs $0 |
| Anthropic compiler (`claude-sonnet-5-5`) | $1–5 | Only when users edit feeds in plain language; quota in client |
| Neynar | free tier → paid plan if ingest grows | `FARCASTER_MODE=fixture` costs $0 |
| Avalanche Data API | free tier | Cached 24h per address |
| Sentry | $0 | Developer plan |

The protocol itself collects no fee. The client earns via Pro plan (5 tUSD / 30 days) on testnet; with real USDC on mainnet later.
