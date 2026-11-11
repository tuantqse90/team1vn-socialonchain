# PROGRESS

> Sổ bàn giao giữa các session (cả người lẫn Claude). File này được import vào CLAUDE.md nên luôn nằm trong context; giữ nó **ngắn**.
> - Chỉ đánh ✅ khi đã chạy lệnh nghiệm thu và thấy pass. Code xong mà chưa chạy thì để 🟡.
> - Session log chỉ giữ ~5 entry gần nhất, cũ hơn thì xoá (git history vẫn giữ lại).
> - Sub-task chi tiết của từng phase nằm trong PLAN.md.

**Cập nhật:** 2026-11-11
**Phase hiện tại:** P0–P14 đã code xong và verify ở **local** (Anvil + Postgres, không key). Phần còn lại cần tài khoản/key/người thật (xem Blockers) và 3 lần duyệt [REVIEW].

## Bước tiếp theo

1. **Người dùng duyệt** (P1, P8, P13 là [REVIEW]): schema event + quyền delegate (`docs/ARCHITECTURE.md` §6), contract thanh toán (`contracts/src/TestUSD.sol`, `PlanPayments.sol`).
2. Có ví deployer + test AVAX → `forge script` deploy lên Fuji → điền `packages/protocol/deployments/43113.json`.
3. Railway (Postgres + indexer + worker) và Vercel (web), đặt secrets → chạy lại e2e trên URL public.
4. Thêm `ANTHROPIC_API_KEY` → `pnpm eval:labeler` bản LLM (heuristic chưa đạt ngưỡng 0.8 của P6).
5. Thêm `NEYNAR_API_KEY` → xác nhận `FC_CHANNELS`, import 1 tài khoản Farcaster thật (P11).
6. Dùng thử 1 tuần, rồi mời Alpha.

## Phase tracker

⬜ chưa làm · 🟡 đang làm / chưa verify · ✅ đã verify · ⛔ blocked · ➖ bỏ

| Phase | Việc | Trạng thái |
|---|---|---|
| P0 | Khung dự án | ✅ (CI GitHub xanh: contracts + ts, có integration test) |
| P1 | Contract lõi **[REVIEW]** | 🟡 forge 58 test ✅, Slither 0 high ✅; **chờ người dùng duyệt** |
| P2 | Indexer + API cơ bản | ✅ (indexer viem, không Ponder) |
| P3 | Walking skeleton online | 🟡 e2e local 9/9 ✅; deploy Fuji/Railway/Vercel ⛔ |
| P4 | Feed engine (chưa LLM) | ✅ |
| P5 | Đọc Farcaster | 🟡 fixture ✅; Neynar thật ⛔ (thiếu key) |
| P6 | Labeler LLM + eval | 🟡 heuristic F1 0.776 (chưa đạt ≥ 0.8/nhãn); LLM ⛔ (thiếu key) |
| P7 | onchain_builder | 🟡 fixture ✅; Avalanche Data API thật chưa gọi |
| P8 | Hoàn thiện + đóng băng **[REVIEW]** | 🟡 code ✅; Sentry DSN, uptime ping, v1 trên Fuji, 1 tuần dùng thử ⛔; chờ duyệt |
| | **Hết Giai đoạn 0** (dùng thử 1 tuần) | ⛔ cần bản chạy thật |
| P9 | NL Feed Builder + quota | ✅ (compiler heuristic; bản LLM chưa chạy key thật) |
| P10 | Kiểm duyệt | ✅ |
| P11 | Importer Farcaster, rồi mời Alpha | 🟡 fixture ✅; tài khoản Farcaster thật ⛔ |
| P12 | Thông báo + tìm kiếm | ✅ |
| P13 | Thanh toán tUSD **[REVIEW]** | 🟡 e2e local ✅ (faucet + permit); Fuji ⛔; **chờ duyệt contract** |
| P14 | Client B + đo lường | 🟡 client B build + chạy local ✅; Vercel ⛔; bấm giờ fork cần người ngoài ⛔ |

## Blockers / câu hỏi mở

- **Cần từ người dùng:** ví deployer có test AVAX (Fuji), tài khoản Railway + Vercel, `ANTHROPIC_API_KEY`, `NEYNAR_API_KEY`, `SENTRY_DSN`, WalletConnect project id (`NEXT_PUBLIC_WC_PROJECT_ID`), `LABELER_PRIVATE_KEY` (ví riêng).
- **PWA hay SwiftUI?** Auto-memory ghi hướng "iPhone-only (SwiftUI)" từ một session khác, còn CLAUDE.md/spec ghi "Next.js PWA, không app native". Đã làm PWA theo spec, giữ hướng visual đã duyệt (Threads-like, icon-first, đỏ Avalanche). Cần chốt.
- **Tên sản phẩm / npm scope:** đang dùng `socialonchain` / `@socialonchain/*`.
- Chưa có CSP header (rủi ro XSS với session key trong localStorage); nên làm trước Alpha.

## Decision log

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-11-11 | `CLAUDE.md` (luật) + `PROGRESS.md` (trạng thái) + `PLAN.md` (kế hoạch) | Tách luật ổn định, kế hoạch, trạng thái hằng ngày |
| 2026-11-11 | Sản phẩm thật (spec v6), builder Avalanche (Team1), EN/VI, Fuji, user tự trả gas qua session key, đọc Farcaster, freemium + tUSD | Người dùng chốt |
| 2026-11-11 | **Indexer tự viết bằng viem `getLogs` thay Ponder** | Chung DB + transaction với schema `app` (thông báo sinh cùng tx), OpenAPI qua zod-openapi, Avalanche finality tức thì nên không cần xử lý reorg. Replay có test |
| 2026-11-11 | `scripts/gen-abis.mjs` thay `@wagmi/cli` | Sinh ABI `as const` từ `forge build`, không thêm dependency |
| 2026-11-11 | Ghim wagmi 2, TypeScript 5.9.3, `evm_version = cancun`; Node 26 giữ nguyên | RainbowKit chưa hỗ trợ wagmi 3; Next 16 + Node 26 build/e2e chạy được |
| 2026-11-11 | Hàm ghi dùng tham số `actor` (thay `as`), reaction stateless (chỉ event) | `as` là từ khoá Solidity; reaction không cần storage, indexer khử trùng lặp |
| 2026-11-11 | Postgres local ở cổng 5440 | Tránh đụng Postgres có sẵn trên máy |
| 2026-11-11 | Nhãn đi qua HTTP `POST /labels` (có chữ ký) + `GET /labels?since=` công khai, lưu batch gốc | Labeler của mình đi đúng đường labeler bên thứ ba; client khác tự verify |
| 2026-11-11 | Thêm package `farcaster`, `llm`, `ui` | Tách I/O ngoài (có mock/fixture) khỏi app; component dùng chung |
| 2026-11-11 | Nhãn tác giả `author:*` bằng heuristic; `onchain_builder` local dùng fixture | Không cần LLM/key; Data API thật khi có key |
| 2026-11-11 | JWT 7 ngày, mỗi request kiểm lại delegate trong DB | Thu hồi session key có hiệu lực ngay với API |
| 2026-11-11 | Client B "Snowfield": chỉ onchain, bật sẵn chặn shill + bait | Chứng minh cùng identity/graph, khác chính sách |
| 2026-11-11 | `mod:safety` bật cứng ở client A | Lớp an toàn tối thiểu; user tắt được các stack khác |
| 2026-11-11 | Renew session key = cấp key mới + trả gas thừa key cũ + thu hồi key cũ | Không để key cũ còn hiệu lực/còn tiền |
| 2026-11-11 | Web: `Sheet` render qua portal; Tailwind `@source` quét `packages/ui`; alias `@x402/*` về CJS rỗng | Sửa lỗi layout trong row ảo hoá; class của package bị thiếu; dependency tuỳ chọn của wagmi connectors |
| 2026-11-11 | E2E chạy trên production build (`.next-e2e`), ví e2e = Anvil #2 (cũng là `ADMIN_ADDRESSES` ở local) | `next dev` lần đầu quá chậm/không ổn định |
| 2026-11-11 | Seed tắt automine, tự mine từng tx | Anvil automine ~400 ms/tx khi đồng hồ chain ở quá khứ; tự mine ~4 ms/tx |
| 2026-11-11 | Labeler chỉ gán nhãn bài trong cửa sổ candidate (14 ngày) | Bài cũ không lên feed xếp hạng, đỡ tốn lượt LLM |
| 2026-11-11 | Embed Farcaster: chỉ URL http(s), tối đa 4; ảnh lazy + `no-referrer` | Embed cơ bản theo P5; quote-cast để sau |
| 2026-11-11 | Sentry web nạp động trong `instrumentation-client.ts` khi có DSN; `@sentry/browser` 11.11.0 | Không tốn byte khi không có DSN; 11.12.0 vi phạm `minimumReleaseAge` của pnpm |

## Session log (mới nhất ở trên)

### 2026-11-11 (session 3: chạy hết P0–P14 không hỏi lại)
- Làm P0–P14 ở local. Commit theo nhánh `phase-N-*`, merge ff vào `main`.
- **Đã verify thật:** `forge test` 58/58; Slither 0 high/medium trong `src/`; `pnpm lint` + `pnpm typecheck` sạch; Vitest: feed-sdk 29, protocol 6, farcaster 2, indexer integration 8, worker 7 (integration cần `TEST_DATABASE_URL`); `pnpm eval:labeler` macro F1 0.776; Playwright e2e 9/9 trên production build + chain/indexer/worker thật ở local; `next build` client A và B; `pnpm dev:local --seed` (40 persona, ~550 bài, ~410 follow, 120 cast Farcaster fixture); `snapshot:export`; `db:backup`; tìm kiếm có dấu/không dấu.
- CI GitHub run `43051151040` xanh (sau khi sửa: job `ts` từng gọi `forge` mà không cài Foundry).
- **Chưa verify:** mọi thứ trên Fuji/Railway/Vercel; labeler + compiler bản LLM; Neynar và Avalanche Data API thật; Sentry thật.

### 2026-11-11 (session 2)
- Viết lại `CLAUDE.md`, `PROGRESS.md` theo INIT_PROMPT v6; thêm `PLAN.md`, `docs/ARCHITECTURE.md`. Kiểm tra công cụ trên máy.
