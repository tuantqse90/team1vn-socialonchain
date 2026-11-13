# PROGRESS

> Sổ bàn giao giữa các session (cả người lẫn Claude). File này được import vào CLAUDE.md nên luôn nằm trong context; giữ nó **ngắn**.
> - Chỉ đánh ✅ khi đã chạy lệnh nghiệm thu và thấy pass. Code xong mà chưa chạy thì để 🟡.
> - Session log chỉ giữ ~5 entry gần nhất, cũ hơn thì xoá (git history vẫn giữ lại).
> - Sub-task chi tiết của từng phase nằm trong PLAN.md.

**Cập nhật:** 2026-11-13
**Phase hiện tại:** P0–P14 đã code xong và verify ở **local** (Anvil + Postgres, không key). **P15 (DM) + P15b (đồng bộ UI theo design canvas)** xong + verify local, đã ff vào `main` và push (người dùng đồng ý 2026-11-12). **Contract v1 đã lên Fuji** (2026-11-12, xem `packages/protocol/deployments/43113.json`); chạy app với Fuji ở localhost bằng `pnpm dev:fuji` (người dùng chốt: chưa cần Railway/Vercel, quay clip demo trên localhost). **P18 (tài khoản mật khẩu + ví nhúng, không popup)** xong, verify local + **Fuji thật** (2026-11-13), đã ff vào `main`. Phần còn lại cần key/người thật (xem Blockers) và 3 lần duyệt [REVIEW].

## Bước tiếp theo

1. **Người dùng duyệt** (P1, P8, P13 là [REVIEW]): schema event + quyền delegate (`docs/ARCHITECTURE.md` §6), contract thanh toán (`contracts/src/TestUSD.sol`, `PlanPayments.sol`).
2. Quay clip demo: dừng stack `:3000` cũ → `git pull` `main` → `pnpm i && pnpm dev:fuji` (migration 0006/0007 tự chạy) → tạo tài khoản bằng tên + mật khẩu (app tặng 0.001 AVAX, không popup) → đăng bài, follow, feed, DM.
   - Tài khoản cũ `tuantq` (đăng ký bằng Core): xuất private key trong Core → màn Đăng nhập › "Nhập khoá" → handle tự điền → đặt mật khẩu.
   - Ví deployer của builder: Cài đặt › Ví builder → ký tin nhắn bằng ví đó (Core/`cast wallet sign`) → dán chữ ký.
3. (Khi cần URL public) Railway + Vercel, đặt secrets → chạy lại e2e trên URL public.
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
| P3 | Walking skeleton online | 🟡 e2e local 10/10 ✅; contract trên Fuji ✅ (5 contract, source verify trên Snowtrace); `pnpm dev:fuji` chạy ✅ (indexer lag 0); luồng thật trên Fuji bằng ví nhúng ✅ (P18: tạo tài khoản, đăng bài, đăng nhập máy khác, nhập khoá); Railway/Vercel ➖ tạm chưa làm |
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
| P15 | Tin nhắn riêng (DM) | 🟡 local ✅ (unit 5, integration 1, e2e 1); Fuji ⛔ như các phase khác; đã merge `main` |
| P15b | Đồng bộ UI theo design canvas | 🟡 local ✅ (lint, typecheck, Vitest, e2e 10/10, chụp màn sáng/tối cả client A + B, intro onboarding khi chưa kết nối ví: đủ 3 vai trò, sửa tràn màn thấp); client B trên máy thật chưa thử; đã merge `main` |
| P18 | Tài khoản mật khẩu + ví nhúng + app tặng gas | ✅ local (e2e 12/12, Vitest protocol 16, indexer 15, worker 8) + Fuji (Chromium headless: tạo tài khoản 12–15 s, đăng bài 5.7 s, máy khác đăng nhập 7.9 s, nhập khoá 13 s, liên kết ví deployer; 0 lỗi console, 0 popup). Máy thật iOS chưa thử. Đã merge `main` |

## Blockers / câu hỏi mở

- **Cần từ người dùng:** `ANTHROPIC_API_KEY`, `NEYNAR_API_KEY`, `SENTRY_DSN`; tài khoản Railway + Vercel khi cần URL public.
- **Ví deployer** `0x6d1A…4a12` (key trong `.env` local, cũng là owner TestUSD/PlanPayments + treasury): người dùng tự backup `.env`. Labeler `0xAc42…F38B` cũng do Claude tạo, chỉ ký nhãn offchain. Ví vòi tặng gas `0xe88B…42ef` (`FAUCET_PRIVATE_KEY` trong `.env`): còn ~0.017 AVAX ≈ 17 tài khoản mới, cạn thì nạp thêm từ faucet Fuji.
- **Tên sản phẩm / npm scope:** đang dùng `socialonchain` / `@socialonchain/*`.
- CSP có nonce đã bật (`apps/web/proxy.ts` + `lib/csp.ts`); không còn ví extension (P18) nên không còn rủi ro CSP chặn ví.

## Decision log

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-11-13 | "Nhập khoá": ví đã đăng ký bằng ví ngoài dán private key → đi đúng đường tạo tài khoản (keystore mã hoá), handle tự điền theo onchain | Cho `tuantq` và builder đã đăng ký bằng Core chuyển sang mật khẩu mà không mất handle/graph |
| 2026-11-13 | Liên kết ví builder: chữ ký `linkWalletMessage` của chính ví đó, tối đa 5 ví, chữ ký hợp lệ cho owner mới thì ví chuyển owner; session key được phép liên kết/gỡ (vẫn cần chữ ký của ví) | Ví nhúng là địa chỉ mới nên `onchain_builder` = 0; chỉ thêm field/endpoint, không đổi API cũ |
| 2026-11-13 | Chặn mật khẩu yếu ở client (`lib/password.ts`) | Server không thấy mật khẩu; lộ DB thì dò offline |
| 2026-11-13 | Key vừa tạo chỉ "ready" khi chain trả `isAuthorized = true` (poll 2 s tới khi xác nhận) | Bug thật thấy trên Fuji: màn "xong" hiện trước khi gửi `addDelegate`, đóng tab là tx không đi |
| 2026-11-13 | Indexer: rate limit (429/Cloudflare 1015) thì không thu chunk, chờ lũy thừa tới 60 s; chạy ổn thì nới chunk lại | RPC Fuji công khai chặn IP khi bắt kịp từ đầu; chunk thu về 10 block thì kẹt |
| 2026-11-13 | `dev:fuji` chạy song song được (`FUJI_DATABASE_URL`, `API_PORT`, `WEB_PORT`, `NEXT_DIST_DIR`); verify Fuji bằng bản sao schema `chain` thay vì quét lại | Không đụng stack demo `:3000`, không đốt rate limit RPC công khai |
| 2026-11-12 | **Bỏ ví ngoài (RainbowKit/Core/MetaMask), dùng ví nhúng: tên + mật khẩu**; owner ký ngầm, không popup | Người dùng chốt: PWA mobile không có popup ví |
| 2026-11-12 | App tặng gas 1 lần khi tạo tài khoản (Fuji 0.001 AVAX, local 0.1); quên mật khẩu = mất tài khoản + nút Xuất khoá | Người dùng chốt (0.001 qua session `-4f`); local 0.1 vì đăng ký cần 0.06 (0.05 session key + phí) |
| 2026-11-12 | KDF scrypt N=2^16 r=8 p=1 → encKey (không rời máy) + authKey (server lưu sha256); keystore AES-256-GCM (@noble/ciphers), AAD gắn địa chỉ; mật khẩu ≥ 8 ký tự, NFKC | ~1 s trên điện thoại; chạy được ở trang http LAN (không cần WebCrypto); server không giải mã được |
| 2026-11-12 | Ví owner đã mở khoá nằm trong `localStorage` (`soc:wallet:<chainId>`), như session key | Không popup; đổi lại XSS lấy được ví chính (ghi ở LIMITATIONS) |
| 2026-11-12 | Mức gas theo mạng ở `apps/web/lib/gas.ts` (Fuji: session key 0.0005, chừa phí 0.0001, low 0.0002, empty 0.00002) | Fuji ~160 wei/gas; 0.001 tặng phải đủ cho đăng ký + vài thiết bị |
| 2026-11-12 | Vòi local = Anvil #8; e2e tự mở khoá ví nhúng bằng key công khai Anvil #2 (`NEXT_PUBLIC_E2E_PRIVATE_KEY`), tắt bằng `soc:e2e-off` | #0–#3, #9 đã có việc; test cần cả máy "trắng" |
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
| 2026-11-12 | Chốt **PWA** (không app native), **bỏ gọi thoại/video**, **làm DM ngay** (P15) | Người dùng chốt |
| 2026-11-12 | DM tự làm: X25519 + HKDF + AES-256-GCM ở client, ciphertext lưu `app.dm_*` qua indexer API; không dùng XMTP | Không thêm dịch vụ ngoài/key; dùng chung DB + JWT; hộp Yêu cầu dựa trên graph onchain đã index. Đánh đổi: không forward secrecy (`docs/LIMITATIONS.md`) |
| 2026-11-12 | Khoá nhắn tin sinh tất định từ chữ ký owner; owner ký xác nhận khoá công khai; client tự kiểm | Nhiều thiết bị không cần đồng bộ khoá; không phải tin server về khoá |
| 2026-11-12 | Người lạ: tối đa 3 tin tới khi được chấp nhận, 20 người lạ mới/ngày, 30 tin/phút, phải đăng ký onchain | Chống spam khi server không đọc được nội dung |
| 2026-11-12 | Twemoji v17.0.3: đóng gói 56 SVG trong `apps/web/public/emoji` (không CDN); credit CC-BY ở Cài đặt › Giấy phép | Không lộ IP/emoji người dùng cho CDN; đúng giấy phép |
| 2026-11-12 | Chuỗi i18n của DM ở `messages/dm.<locale>.json`; icon DM inline trong `components/dm` | Tránh xung đột với nhánh UI đang sửa `en.json`/`vi.json` và `packages/ui` |
| 2026-11-12 | API design sync chỉ **thêm** (field `origins`, `viewerFollows`, `registeredBlock`, `topTopics`, `subscribers`, `labelers`, `parent`; endpoint `/builders`, `/channels`, `?kind=`); không đổi/xoá gì | Interface công khai: thêm thì client cũ không vỡ |
| 2026-11-12 | Lý do report: thêm `shill`, `toxic`, `nsfw`; API vẫn nhận `harassment`, `other` | Theo sheet report 6 ô của design; tương thích client cũ |
| 2026-11-12 | Tham gia kênh = offchain (`app.user_settings.channels`, migration `0005_channels`); `KNOWN_CHANNELS` thêm infra/defi/gaming/ai | Không cần tx/gas; kênh onchain vẫn là field `channel` của bài |
| 2026-11-12 | Mọi tx/chữ ký của ví chính đi qua `useMainWallet` (ép `chainId`, đổi mạng trước) | Ví đang ở C-Chain mainnet thì không bao giờ gửi tx thật |
| 2026-11-12 | Theo design nhưng giữ: quota Pro 200/50 (code), `mod:safety` khoá; bỏ trường "trường học" ở onboarding; quét builder chỉ cho chính owner | Không đổi giá/quyền đã chốt; không thu thông tin cá nhân |
| 2026-11-12 | Client B đổi tên "Snowfield" → "Phố Builder" (vàng #F5B53D, mặc định tối) | Theo design canvas; chỉ đổi `configs/b.ts` |
| 2026-11-12 | Deploy contract v1 lên Fuji theo lời người dùng ("chuyển AVAX cho bạn deploy"), trước khi duyệt [REVIEW] P1/P13 | Testnet, trước P8 được deploy lại; review đòi sửa thì deploy bản mới |
| 2026-11-12 | Chưa làm Railway/Vercel; `pnpm dev:fuji` chạy indexer + worker + web ở localhost với contract Fuji, DB riêng `socialonchain_fuji`, `.next-fuji`, admin từ `FUJI_ADMIN_ADDRESSES` | Người dùng chốt: localhost + quay clip là đủ |
| 2026-11-12 | Claude tạo ví deployer + key labeler, ghi thẳng vào `.env` (chmod 600), chỉ in địa chỉ | Người dùng nhờ; key không đi qua chat/log |
| 2026-11-12 | DM gắn vào shell mới: chat full-screen trên mobile như thread; credit Twemoji chuyển vào sheet Giấy phép | Thống nhất với design mới; giữ đúng CC-BY |
| 2026-11-12 | Config client có `theme.text` / `theme.tint` (sáng/tối) → `--red-ink`/`--blush`; B dùng vàng đậm #8A5A00 (5.9:1) | Chữ thương hiệu của B không còn đỏ Avalanche |
| 2026-11-12 | Job `onchain-builder` quét user đã đăng ký trước, rồi tác giả onchain, rồi Farcaster | Gợi ý builder + badge hồ sơ có sớm hơn (50 địa chỉ/lượt) |
| 2026-11-12 | Playwright xoá `.next-e2e/cache/fetch-cache` trước khi build | Reset chain local làm id bài lặp lại → SSR trả bài cũ từ cache |
| 2026-11-12 | CSP nonce + `'strict-dynamic'` qua `proxy.ts`, mọi trang render động; style vẫn `'unsafe-inline'`; e2e fail nếu có vi phạm CSP | Chặn script lạ đọc session key/khoá DM trong localStorage; style attribute SSR + `<style>` của RainbowKit cần inline |
| 2026-11-12 | CI: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6` | Runtime Node 20 của action bị deprecated |
| 2026-11-11 | Sentry web nạp động trong `instrumentation-client.ts` khi có DSN; `@sentry/browser` 11.11.0 | Không tốn byte khi không có DSN; 11.12.0 vi phạm `minimumReleaseAge` của pnpm |

## Session log (mới nhất ở trên)

### 2026-11-13 (session 8: nhập khoá, ví builder, P18 trên Fuji, merge main)
- Người dùng: "Làm hết đi bro". Nhánh `phase-18-embedded-wallet`: nhập khoá + chặn mật khẩu yếu (web), `/me/wallets` + migration `0007_linked_wallets` + worker cộng contract ví liên kết (agent nền), sheet Cài đặt › Ví builder, event `import_done`/`reply` vào allowlist, indexer backoff khi bị rate limit, `dev:fuji` chạy song song.
- Vòi `0xe88B…42ef` nạp 0.02 AVAX từ deployer (đúng địa chỉ session `-4f` báo, không tạo key mới).
- **Bug tìm thấy nhờ chạy Fuji:** đăng nhập máy mới hiện "xong" trước khi `addDelegate` được gửi (nonce owner vẫn 1). Sửa trong `lib/session.tsx`, e2e thêm assert `isAuthorized` onchain; chạy lại Fuji: nonce 2, key máy mới được uỷ quyền.
- **Đã verify thật:** lint + typecheck sạch; `pnpm test` (forge 58, protocol 16, feed-sdk 29, worker 8, farcaster 2, indexer 15); e2e **12/12** trên production build. Fuji (stack riêng `:3197/:42097`, DB `socialonchain_fuji_wallet`): `soc_fuji_zohb` tạo tài khoản + tặng gas + `registerWithDelegate` 15 s, đăng bài 5.7 s ([tx](https://testnet.snowtrace.io/tx/0x5bb04af16b6a14e0caf51a3bac3b54d37206c27dbdf36eeab8b8e30a06b541e0)), liên kết ví deployer, đăng xuất xoá ví; `soc_imp_zohb` nhập khoá 13 s; `soc_dev_3vc4` đăng nhập máy khác 7.9 s (tx thật). 0 lỗi console, 0 dialog.
- **Chưa verify:** iPhone/Android thật (tốc độ scrypt, trình quản lý mật khẩu); ký liên kết ví bằng Core thật (đã thử bằng key deployer trong script); worker đếm contract thật của ví liên kết (`BUILDER_MODE=fixture`, chưa có `GLACIER_API_KEY`); stack `:3000` của người dùng vẫn chạy bản cũ tới khi khởi động lại.
- 3 handle test (`soc_fuji_zohb`, `soc_imp_zohb`, `soc_dev_3vc4`) và 1 bài test nằm vĩnh viễn trên Fuji v1.

### 2026-11-12 (session 7: P18 tài khoản mật khẩu + ví nhúng)
- Worktree `../team1vn-socialonchain-wallet`, nhánh `phase-18-embedded-wallet` (từ `main` 424f052). Stack riêng: Anvil 8587, API 42087, DB `socialonchain_wallet`, web e2e 3187.
- Server (agent nền): `app.accounts` + migration `0006_accounts`, `/accounts` (tạo + tặng gas tuần tự, trần/ngày, giới hạn IP), `/accounts/kdf/{handle}`, `/accounts/login` (sai tên/sai mật khẩu cùng 401, 10 lần/phút theo IP và tên).
- Web: `lib/embedded.ts`, `useMainWallet` ký ngầm, wagmi chỉ đọc, bỏ RainbowKit + WalletConnect khỏi CSP; onboarding tên + mật khẩu (tự `registerWithDelegate`, máy mới tự `addDelegate`); Cài đặt › Xuất khoá + Đăng xuất (trả gas session key về ví, xoá ví/session key/khoá DM khỏi máy); gia hạn key: rút gas key cũ trước rồi mới nạp key mới.
- Sửa thêm: event đo lường `onboarding_started`/`registered` vốn bị server từ chối (400) → `onboarding_step`.
- **Đã verify thật (local):** lint + typecheck sạch; `pnpm test` (forge 58, protocol 15, feed-sdk 29, worker 7, farcaster 2, indexer 11); e2e **11/11** trên production build (permit tUSD + DM chạy bằng ví nhúng); form tài khoản vừa 1 màn iPhone 15 (overflow 0), chụp sáng/tối.
- **Chưa verify:** Fuji (cần ví vòi có AVAX); máy thật (iOS Safari: tốc độ scrypt, trình quản lý mật khẩu); tài khoản cũ đăng ký bằng Core (vd. `tuantq`) chưa có đường nhập khoá.

### 2026-11-12 (session 6: contract lên Fuji + chạy localhost với Fuji)
- Nhánh `phase-3-fuji-local` (từ `main` 52342b9). Tạo ví deployer, người dùng nạp 0.05 AVAX; `forge script` deploy 6 tx đều status 1, ~4.58M gas, tốn chưa tới 0.000001 AVAX; startBlock 60950634.
- **Đã verify thật (Fuji):** bytecode 5 contract; `SocialGraph.identity`/`Posts.identity` trỏ đúng IdentityRegistry; PlanPayments token = TestUSD, giá gói Pro 5 tUSD, owner/treasury = deployer; tUSD 6 decimals; source verify trên Snowtrace (Routescan) cả 5. `pnpm dev:fuji`: `/status` network fuji, indexer lag 0, `lastError` null; worker ký nhãn bằng key labeler mới, indexer nhận; web hiện "Avalanche Fuji".
- **Chưa verify:** luồng ví thật (đăng ký + session key, đăng bài, follow, DM, tUSD) trên Fuji; RPC công khai khi có nhiều event.
- Nhánh `phase-16-wow` (người dùng: "giao diện hơi xấu, làm wow hơn"): avatar orb gradient tất định theo địa chỉ (`lib/orb.ts`), cột phải desktop ≥1280px (block Fuji live + s/block đo được, 3 contract lõi link Snowtrace, kênh nổi, builder), nền ambient đỏ + lưới chấm, nút soạn bài đỏ, thả tim có vòng + hạt, bài màn đầu trồi lên lần lượt, panel đã đăng có "Onchain in X.Xs" (đo từ lúc bấm tới receipt), chip feed + ô feed cùng orb, Explore có empty state khi chưa có builder, ẩn nút dev "N" của Next. Chuỗi mới ở `messages/wow.<locale>.json`. **Verify:** lint + typecheck sạch; e2e **10/10** trên stack Anvil riêng (8565/42089/3120); chụp desktop + mobile, sáng + tối; Fuji: 1.6 s/block. Lưu ý: đổi cổng e2e phải xoá `.next-e2e` (cache Turbopack giữ RPC cũ).

### 2026-11-12 (session 5: P15b đồng bộ UI theo design canvas + gộp DM)
- Worktree riêng `../team1vn-socialonchain-ui`, nhánh `phase-15-ui-design-sync`, stack cô lập (Anvil 8555, API 42079, DB `socialonchain_ui`, web 3010, e2e 3110). 5 agent làm song song theo màn, rồi gộp i18n vào `en.json`/`vi.json` (556 key, EN/VI khớp).
- Commit: `10836d1` API, `8f81bf5`+`ac4c39b` foundations, `a675b35` dev tooling, `df13e04` màn hình, `cffedd3` gộp `phase-15-dm` + gắn DM.
- **Đã verify thật (local):** `pnpm lint` + `pnpm typecheck` sạch; `pnpm test`: forge 58, feed-sdk 29, protocol 11, farcaster 2, worker 7, indexer integration 10 (gồm test API design sync + DM); `drizzle-kit check` OK; Playwright e2e **10/10** trên production build; chụp màn sáng/tối của mọi màn chính + DM trong shell mới.
- Sự cố: 1 lần `pnpm test` fail ở test DM ngay sau khi tạo lại DB, 5 lần chạy sau đều pass, chưa tái hiện. DB test cũ của worktree đã chạy `0005` trước `0004` nên phải tạo lại (DB khác không bị).
- Client B build production + chụp sáng/tối (home, explore, splash intro). Sửa thêm: màu chữ thương hiệu theo client, nút quay lại ở các trạng thái chat trước khi bật khoá, ưu tiên quét builder.
- Sau merge (nhánh `phase-16-local-demo`): indexer đọc head với `cacheTime: 0` (CI từng fail vì head cũ); CSP có nonce + header bảo mật; CI lên action Node 24; onboarding vừa màn 393×659 (splash từng tràn 67px, nút Tiếp dính đáy). **Đã verify:** lint, typecheck, `pnpm test` (forge 58, indexer 10…), e2e 10/10 có kiểm vi phạm CSP, chụp intro 3 vai trò sáng/tối khi chưa kết nối ví + đo tràn ở 3 cỡ màn.
- **Chưa verify:** ví thật (MetaMask/Core) khi có CSP; client B trên máy thật.

### 2026-11-12 (session 4: P15 tin nhắn riêng)
- Người dùng chốt: PWA, không gọi điện, làm DM ngay. Thêm P15 vào PLAN; CLAUDE.md/INIT_PROMPT "Chưa làm" đổi DM → gọi thoại/video.
- Nhánh `phase-15-dm`: crypto trong `packages/protocol/dm.ts`, migration `0004_dm`, API `/dm/*`, web `/messages` + chat + Twemoji, seed 5 builder có khoá, docs (ARCHITECTURE §11, LIMITATIONS, MODERATION).
- **Đã verify thật (local):** `pnpm lint` + `pnpm typecheck` sạch; `pnpm test`: protocol 11, indexer integration 9, feed-sdk 29, worker 7, farcaster 2, forge 58; Playwright e2e **10/10** trên production build (gồm test DM: bật khoá bằng chữ ký ví → người lạ nhắn từ Node → Yêu cầu → chấp nhận → thả ❤️ → trả lời có Twemoji → người kia giải mã được, server không chứa plaintext). Chụp màn hình hộp thư/chat/khay emoji để tự kiểm.
- Sửa e2e cũ: test feed builder fail khi chạy lại sau reset chain (gói Pro mất, feed E2E cũ vượt quota Free) → test tự dọn feed E2E cũ.
- **Chưa verify:** DM trên Fuji; ví thật ngoài connector giả (MetaMask/Core: chữ ký có tất định không); ví hợp đồng (ERC-1271).
- Canvas design: bỏ màn Gọi, nút gọi trong Chat, làn GỌI trong sơ đồ (Version 45).
