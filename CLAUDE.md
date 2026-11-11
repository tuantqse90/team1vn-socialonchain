# CLAUDE.md: socialonchain

Claude Code tự load file này mỗi session. Chỉ ghi **luật và quyết định ổn định** ở đây, giữ dưới ~200 dòng.
Trạng thái công việc (đang ở đâu, làm gì tiếp) nằm trong `PROGRESS.md`, được import ở cuối file.
Spec đầy đủ (contract, API, FeedSpec, seed, demo) nằm trong `INIT_PROMPT.md`. Đó là nguồn sự thật về phạm vi; đọc mục liên quan khi cần chi tiết.

## Quy trình mỗi session

1. **Đầu session:** xem PROGRESS.md (import bên dưới) để biết phase hiện tại, việc dở và blocker. Nếu đã có test thì chạy `pnpm test` để biết repo đang xanh hay đỏ trước khi sửa.
2. **Trong session:** làm theo phase. Phase trước chạy được thì mới sang phase sau. Ưu tiên walking skeleton end-to-end, polish để sau.
3. **Cuối session hoặc cuối phase:** chạy test/lint rồi cập nhật PROGRESS.md: việc đã xong (ghi rõ **đã verify thật** hay **chưa**), việc dở, bước tiếp theo, blocker. Quyết định mới thì ghi vào Decision log; nếu nó thành luật lâu dài thì chuyển lên mục "Quyết định kiến trúc" bên dưới.

Câu hỏi trước mọi quyết định: *việc này có làm demo 3 phút mạnh hơn không?* (kịch bản demo: INIT_PROMPT.md §13)

## Luận điểm

**"Một danh tính, một graph, hàng nghìn feed."** Không làm "Twitter onchain". Có 3 thứ phải demo được:

1. **Lõi onchain thật mỏng** trên Avalanche: `IdentityRegistry`, `SocialGraph`, `Posts`, `FeedRegistry`.
2. **Chợ feed:** mỗi feed là một plugin. User viết feed bằng tiếng Việt tự nhiên, LLM biên dịch thành `FeedSpec` minh bạch. Dev ship feed và thu phí onchain.
3. **Portability:** 2 client fork từ cùng template, chỉ khác `client.config.ts`, cùng đọc một identity và một graph.

## Tham số (đang dùng mặc định, cần đội xác nhận)

- Chain: Avalanche Fuji C-Chain, chainId `43113`
- Ngôn ngữ UI: tiếng Việt
- Thời gian: 7 ngày. Đội 2–3 người (TypeScript fullstack + 1 người Solidity)

## Stack

- Monorepo: pnpm workspaces + Turborepo, TypeScript strict
- Contracts: Solidity ^0.8.24, Foundry, OpenZeppelin (EIP712, ECDSA, Nonces)
- Indexer: Ponder (nếu vướng thì dùng viem `getLogs` + `watchContractEvent`) → Postgres (dev dùng PGlite) + REST
- Client: Next.js App Router + wagmi + viem + RainbowKit (có Core Wallet) + Tailwind
- Relayer: Hono hoặc Next.js route handler, dùng một ví nóng trả gas
- LLM (Anthropic API): labeler dùng `claude-haiku-5-5`, NL→FeedSpec dùng `claude-sonnet-5-5`

## Cấu trúc repo

```
contracts/                      Foundry: src/, test/, script/Deploy.s.sol
packages/protocol/              ABI, địa chỉ deploy, typed client, helper EIP-712
packages/feed-sdk/              FeedSpec (zod), LABELS, SIGNALS, rank(), compileFeed()
services/indexer/               Ponder + REST API
services/labeler/               worker gán nhãn
services/relayer/               nhận chữ ký, submit tx
services/feed-server-example/   remote feed mẫu, kiểm subscription
apps/client/                    Next.js; mọi thứ mang thương hiệu nằm trong client.config.ts
apps/client-b/                  bản fork demo: chỉ khác config + theme
importers/farcaster/
scripts/seed/
docs/                           ARCHITECTURE.md, FORK.md, PLUGIN.md, DEMO.md
```

## Quyết định kiến trúc (muốn đổi thì hỏi trước)

- Lõi onchain nhỏ và nhàm: **không admin, không phí giao thức, không proxy upgradeable**. Identity chính là `address`.
- Mọi hàm ghi có 2 đường: gọi trực tiếp (user tự trả gas) và bản `...BySig` (chữ ký EIP-712 của owner hoặc delegate còn hạn, có nonce + deadline). Client luôn có chế độ tự trả gas, nên relayer không phải người gác cổng.
- `Posts` chỉ emit event, không lưu text vào storage. `FeedRegistry` chỉ lưu `keccak256(manifest)`, còn manifest nằm trong event.
- `SocialGraph` cho follow cả địa chỉ chưa đăng ký, để importer dựng graph trước.
- **Nguyên tắc vàng của feed:** LLM chỉ chạy lúc *ghi* (labeler) và lúc *biên dịch* feed (`compileFeed`). Lúc *đọc* chỉ chạy `rank()` thuần TypeScript: không I/O, tất định, mỗi phần tử `reasons` trỏ về đúng 1 rule.
- Bộ nhãn là tập đóng trong `packages/feed-sdk/labels.ts`. `compileFeed` không được bịa rule; yêu cầu nào không map được thì trả về trong `unsupported[]`.
- Mọi thứ mang thương hiệu của client nằm trong `client.config.ts`. Client B chỉ được khác config + theme.

## Quy ước code

- TypeScript strict. Dùng zod ở **mọi biên**: API, output LLM (validate, sai schema thì retry), manifest.
- Khi dùng thư viện/API ngoài (Ponder, wagmi, RainbowKit, Neynar, Anthropic SDK, Fuji): đọc docs hiện tại, không đoán version hay API.
- Mỗi tx trên UI (follow, post, publish, subscribe) phải kèm link explorer.
- Báo cáo trung thực: tách rõ phần "đã verify thật" và phần "chưa verify".

## Lệnh (dự kiến, sửa lại sau P0)

```bash
pnpm i && pnpm dev                     # chạy toàn bộ
pnpm test                              # unit test (feed-sdk fixtures, ...)
pnpm lint
cd contracts && forge test --gas-report
pnpm indexer:replay                    # dựng lại state từ block deploy
```

## Secrets

Secrets chỉ nằm trong `.env` (gitignored), mẫu ở `.env.example`: `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, `NEYNAR_API_KEY`, `FUJI_RPC_URL`.
**Không bao giờ** in key ra log/output hay commit key.

## KHÔNG LÀM

Token, DAO/governance, proxy upgradeable, DM, notification phức tạp, đưa media lên chain, mobile app. Thấy cần đổi phạm vi thì hỏi trước.

## Trạng thái hiện tại

@PROGRESS.md
