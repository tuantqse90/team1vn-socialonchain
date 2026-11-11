# CLAUDE.md: socialonchain

Claude Code tự load file này mỗi session. Chỉ ghi **luật và quyết định ổn định** ở đây, giữ dưới ~200 dòng.
- Trạng thái công việc (đang ở phase nào, việc dở, blocker) nằm trong `PROGRESS.md`, được import ở cuối file.
- Kế hoạch chi tiết từng phase (sub-task, ước lượng, rủi ro) nằm trong `PLAN.md`.
- Spec đầy đủ nằm trong `INIT_PROMPT.md` (v6). Đó là nguồn sự thật về phạm vi; cần chi tiết thì đọc mục liên quan.

## Quy trình mỗi session

1. **Đầu session:** xem PROGRESS.md (import bên dưới). Nếu đã có test thì chạy `pnpm test` để biết repo đang xanh hay đỏ.
2. **Làm đúng phase hiện tại** theo PLAN.md. Phase trước chưa đạt "Xong khi" thì không sang phase sau.
   - **P1, P8, P13 là phase [REVIEW]:** bắt buộc dừng chờ duyệt.
   - Các phase khác: báo cáo xong thì chờ người dùng nói "tiếp".
3. Mỗi phase làm trên nhánh `phase-N-<tên>`, commit nhỏ.
4. **Cuối session hoặc cuối phase:** chạy test/lint, cập nhật PROGRESS.md, tick checkbox trong PLAN.md. Báo cáo gồm: đã làm gì; verify bằng lệnh nào, kèm kết quả; còn nợ gì; đề xuất cho phase sau.

Câu hỏi trước mọi quyết định: *việc này có làm người dùng quay lại vào ngày mai không? Có làm dev bên ngoài muốn build plugin trên nền này không?*

## Sản phẩm

- **"Một danh tính, một graph, hàng nghìn feed."** Đây là sản phẩm cho người dùng thật, không phải bài thi.
- Cộng đồng đầu tiên: builder Avalanche (Team1) trong và ngoài nước. UI song ngữ EN/VI.
- Cold start theo hướng "đọc trước, viết sau": feed xếp hạng cả nội dung Farcaster (chỉ đọc), còn bài mới thì đăng native onchain.
- Hai tính năng chủ lực:
  - Feed Builder bằng lời (EN/VI).
  - Tín hiệu `onchain_builder`: đếm số contract tác giả đã deploy trên Avalanche, kiểm chứng được onchain.

## Quyết định đã chốt (muốn đổi thì hỏi trước)

| Mục | Quyết định |
|---|---|
| Đội | 1 người + Claude Code |
| Chain | Avalanche Fuji (chainId 43113) cho cả dev lẫn bản chạy thật |
| Gas | User tự trả, qua session key do chính họ nạp. Không relayer, không meta-tx |
| Thanh toán | tUSD: TestUSD tự deploy, 6 decimals, có permit. Khi lên mainnet thì thay bằng USDC thật |
| Thu phí | Freemium ở client. Protocol không thu phí. Spec feed luôn miễn phí |
| Ngôn ngữ | TypeScript end-to-end + Solidity |

## Kiến trúc: 4 thứ cần deploy

| Thành phần | Nội dung | Host |
|---|---|---|
| `contracts` | Lõi: IdentityRegistry, SocialGraph, Posts, FeedRegistry (GĐ2). Của client: TestUSD, PlanPayments (P13) | Fuji |
| `apps/indexer` | Ponder: index event + REST API (Hono + zod-openapi) | Railway |
| `apps/worker` | Node + pg-boss: labeler, ingest-farcaster, notifier, onchain-builder | Railway |
| `apps/web` | Next.js PWA. Client B là cùng app với `CLIENT_CONFIG=b` | Vercel |

Postgres dùng chung, chia 2 schema:
- schema của Ponder: dựng lại được bằng replay;
- schema `app` (Drizzle): dữ liệu offchain, phải backup.

Chưa dùng Redis.

**Stack:** Node LTS, pnpm, Turborepo, Biome · Foundry, OpenZeppelin v5, Slither · `@wagmi/cli` sinh ABI · Ponder · Drizzle · pg-boss · `@anthropic-ai/sdk` · Next.js App Router, Tailwind, shadcn/ui, wagmi, viem, RainbowKit (có Core Wallet), TanStack Query/Virtual, next-intl · Vitest, Playwright · Sentry, pino · Neynar · Avalanche Data API.

## Luật kiến trúc

**Contract**
- Contract lõi **không có admin, không thu phí, không upgrade được**. Muốn thay đổi thì deploy version mới chạy song song. Schema event đóng băng từ P8. Trước P8, contract trên Fuji được phép deploy lại.
- Identity chính là `address`. Mất ví là mất identity; đây là giới hạn đã biết.
- **Session key:**
  - Owner cấp quyền một lần qua `registerWithDelegate` (payable), đồng thời nạp gas cho key.
  - Mọi hàm ghi đều nhận tham số `as` và kiểm tra `isAuthorized(as, msg.sender)`.
  - Delegate **chỉ** được: `post`, `react`, `unreact`, `deletePost`, `follow`, `unfollow`, `followMany`, `setProfile`.
  - Delegate không được đụng tới: quản lý delegate, handle, FeedRegistry, tiền.
  - Hết hạn mặc định sau 30 ngày.
- **Posts:** storage chỉ có `authorOf`. Text tối đa 1024 byte, nằm trong event. Có field `channel` và `meta` để mở rộng.
- **SocialGraph:** storage chỉ có `isFollowing`; số đếm do indexer tính. Được follow cả địa chỉ chưa đăng ký.
- Không đưa thông tin cá nhân lên chain.

**Feed**
- LLM chỉ chạy lúc **ghi** (labeler) và lúc **biên dịch** feed (`compileFeed`).
- Lúc **đọc** chỉ chạy `rank()` thuần: không I/O, tất định, chạy được cả trên server lẫn trong trình duyệt. Mỗi phần tử `reasons` trỏ về đúng 1 rule.
- Pipeline: `sources → moderation stack → rules → diversity`.
- Bộ nhãn là tập đóng trong `packages/feed-sdk/labels.ts`. `compileFeed` không được bịa rule; yêu cầu nào không map được thì trả về trong `unsupported[]`.
- Labeler coi nội dung bài là dữ liệu không đáng tin (chống prompt injection). Indexer không tự gán nhãn; nhãn đến từ labeler, có chữ ký.

**Chung**
- Mọi thứ mang thương hiệu nằm trong `apps/web/configs/*.ts`.
- **Interface công khai** (ABI, schema event, FeedSpec, REST API): muốn đổi thì hỏi trước.

## Cấu trúc repo

```
contracts/              Foundry: src/, test/, script/
packages/protocol/      ABI (wagmi cli), địa chỉ theo chainId + version, typed client, helper session key
packages/feed-sdk/      FeedSpec (zod + JSON Schema), LABELS, SIGNALS, rank(), compileFeed(), moderation
packages/db/            Drizzle: schema "app" + migrations
packages/ui/            component shadcn dùng chung
apps/indexer/           Ponder + REST API
apps/worker/            labeler, ingest-farcaster, notifier, onchain-builder
apps/web/               Next.js PWA; configs/a.ts, configs/b.ts
evals/labeler/          golden set + script đo
scripts/                seed (chỉ local), snapshot export
docs/                   ARCHITECTURE.md, COSTS.md, LIMITATIONS.md, MODERATION.md, FORK.md
```

## Quy ước code

- TypeScript strict. Dùng zod ở **mọi biên**: API, output LLM (sai schema thì retry), manifest, batch nhãn. Lint/format bằng Biome.
- Mọi dịch vụ ngoài (Anthropic, Neynar, Avalanche Data API, RPC) đều có chế độ mock/fixture. Thiếu key không được chặn tiến độ.
- Thư viện/API ngoài: đọc docs hiện tại, không đoán version hay API. Đặc biệt là Ponder (custom route, schema), Neynar và Avalanche Data API.
- Mỗi tx trên UI đều có link explorer Fuji.
- Seed data hư cấu chỉ dùng ở local. Không dùng tên/ảnh người thật, không nhắc chính trị Việt Nam có thật.
- Báo cáo trung thực: tách rõ phần "đã verify thật" và phần "chưa verify".
- Quyết định đảo ngược được thì tự quyết và ghi vào Decision log trong PROGRESS.md. Quyết định không đảo ngược được (schema, interface công khai, tiền, mainnet) thì hỏi trước.

## Lệnh (dự kiến, cập nhật sau P0)

```bash
pnpm i && pnpm dev:local               # Postgres (Docker) + Anvil + deploy + indexer + worker + web, không cần key
pnpm test                              # Vitest (feed-sdk fixtures, ...)
pnpm lint && pnpm typecheck            # Biome + tsc
cd contracts && forge test --gas-report
pnpm indexer:replay                    # dựng lại state từ block deploy (từ P2)
pnpm eval:labeler                      # đo precision/recall của labeler (từ P6)
pnpm snapshot:export                   # xuất graph + bài onchain ra JSON (từ P8)
```

## Secrets

- Chỉ nằm trong `.env` (đã gitignore), mẫu ở `.env.example`. Khi deploy thì để trong secret manager của Railway/Vercel.
- Các biến: `DEPLOYER_PRIVATE_KEY`, `LABELER_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, `NEYNAR_API_KEY`, `FUJI_RPC_URL`, `JWT_SECRET`, `SENTRY_DSN`.
- **Không bao giờ** in key ra log/output hay commit key, kể cả private key của session key.
- Không đụng tới mainnet hay tiền thật khi chưa có xác nhận.

## Chưa làm

Token, DAO/governance, proxy upgradeable, DM, app native (dùng PWA), relayer/tài trợ gas, đưa media lên chain. Phạm vi Giai đoạn 2–3 xem ở INIT_PROMPT.md §3.

## Trạng thái hiện tại

@PROGRESS.md
