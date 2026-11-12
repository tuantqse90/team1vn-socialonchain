# INIT PROMPT: Social Onchain · sản phẩm · v6

> Dùng toàn bộ file này làm prompt đầu tiên cho Claude Code trong thư mục dự án (đang trống).
> Đây là một **sản phẩm cho người dùng thật**, không phải bài thi. Mọi quyết định tối ưu cho việc người dùng ở lại, chứ không cho một buổi demo.

## 0. Các quyết định đã chốt

| Mục | Quyết định |
|---|---|
| Đội | **1 người** + Claude Code. Bạn (agent) viết phần lớn code. |
| Cộng đồng đầu tiên | **Builder Avalanche trong và ngoài nước**, bắt đầu từ cộng đồng Team1. |
| Chain | **Avalanche Fuji testnet** (chainId 43113) cho cả dev lẫn bản chạy thật ở thời điểm này. |
| Gas | **User tự trả.** Không có relayer, không tài trợ gas. |
| Nội dung ngoài | **Farcaster, chỉ đọc.** Bài mới đăng native onchain. |
| Nguồn thu | **Thu phí ở client** theo mô hình freemium. Protocol không thu phí. |
| Token thanh toán | **tUSD**: stablecoin giả lập do mình tự deploy trên Fuji (ERC-20, 6 decimals, có permit). Dùng cho gói Pro, subscribe và tip plugin. Khi lên mainnet thì thay bằng USDC thật. |
| Ngôn ngữ lập trình | **TypeScript end-to-end**, cộng Solidity cho contract (chi tiết ở mục 4). |
| Ngôn ngữ | Song ngữ **English + Tiếng Việt**, mặc định theo locale của trình duyệt. |
| Tên sản phẩm | `<<TÊN | mặc định: socialonchain>>` |

## 1. Vai trò của bạn

Bạn là tech lead và gần như là toàn bộ đội engineering của sản phẩm này. Đội chỉ có 1 người, nên:

- **Giữ kiến trúc tối thiểu:** 4 thứ cần deploy (mục 4). Không thêm service mới nếu chưa có lý do rõ ràng.
- **Quyết định đảo ngược được** (thư viện, cấu trúc thư mục, UI): tự quyết, rồi ghi vào "Decision log" trong `CLAUDE.md`.
- **Quyết định không đảo ngược được** (schema contract trước khi deploy Fuji, interface công khai, mọi thứ dính tới tiền thật hoặc mainnet): hỏi mình trước.

Cách làm là ship sớm cho người dùng thật, đo lường, rồi lặp lại. Chất lượng phải đủ để dùng **hằng ngày**: đáng tin cậy, an toàn, chạy tốt trên điện thoại.

## 2. Luận điểm sản phẩm

Mạng xã hội nào cũng có 3 phần: danh tính, social graph và feed. Ở Web2, một công ty nắm cả 3. Sản phẩm này tách 3 phần đó ra:

- **Danh tính** là ví của bạn và dùng được ở mọi app.
- **Graph** nằm onchain nên app nào cũng đọc được.
- **Feed** do bạn tự chọn, thậm chí tự viết bằng lời, ví dụ: `bớt tin chính trị đi`, `show me builders who actually ship`, `bỏ qua bài câu tương tác`.

**Xây như WordPress.** Lõi nhỏ và nhàm: danh tính đi theo bạn, không app nào sở hữu graph, client mã nguồn mở fork chưa tới 1 giờ, giao thức gần như không thu phí. Phần bên ngoài là một cái chợ gồm thuật toán feed, bộ lọc kiểm duyệt, luật cộng đồng, theme và importer.

**Một danh tính, một graph, hàng nghìn feed.**

### Bài học từ người đi trước
- Farcaster đưa identity lên onchain, nhưng một client gần như độc quyền người dùng. Neynar mua lại Farcaster vào tháng 01/2026.
- Lens đưa graph lên onchain, và tháng 01/2026 chuyển vai trò steward sang Mask Network.
- Bluesky có custom feeds và labelers nhưng không onchain, và dev viết feed không kiếm được tiền.

Từ đó rút ra 2 điều:
1. Protocol phi tập trung mà chỉ có một client thống trị thì vẫn là tập trung.
2. Người ta không chuyển sang vì lý tưởng. Họ chuyển vì feed hay hơn.

### Vì sao chọn builder Avalanche làm cộng đồng đầu tiên
- Họ đã có ví, đã quen Fuji và faucet, nên ma sát onboarding thấp nhất.
- Cộng đồng đủ dày để feed có nội dung, và đủ quốc tế để sản phẩm phải song ngữ ngay từ đầu.
- Có một tính năng chỉ social onchain mới làm được: **"ưu tiên người thật sự build" có thể kiểm chứng bằng dữ liệu onchain** (địa chỉ đó đã deploy contract trên Avalanche hay chưa), chứ không phải LLM đoán từ bio.

### Chiến lược cold start: "đọc trước, viết sau"
- Feed engine xếp hạng cả **nội dung Farcaster** (chỉ đọc), ưu tiên những người user follow và các channel liên quan tới Avalanche. Nhờ vậy ngay ngày đầu, user đã có một feed hay hơn feed gốc.
- Người dùng Farcaster có verified ETH address. Bài của họ được gắn vào địa chỉ đó, nên khi họ vào app, lịch sử và follower đã có sẵn.
- Bài viết mới thì đăng native onchain.

### Mô hình kinh tế
- **User tự trả gas** bằng test AVAX, thông qua session key do chính họ nạp tiền (mục 6).
- **Client thu phí theo mô hình freemium, trả bằng tUSD.** Phần tốn tiền thật của client là LLM, Neynar và hosting. Gói Free có quota; gói Pro được quota cao hơn và có tính năng tốn LLM (mục 11).
- **Chợ plugin:** spec feed luôn miễn phí, fork tự do, có tip. Remote feed và labeler được thu phí theo tháng qua FeedRegistry. Mọi giá đều tính bằng tUSD.
- **tUSD là token tạm.** Nó cho phép dựng và kiểm thử toàn bộ luồng thanh toán ngay từ bây giờ. Khi chuyển lên mainnet, chỉ cần deploy lại các contract thanh toán với địa chỉ USDC thật.

## 3. Lộ trình theo giai đoạn

Mỗi giai đoạn có tiêu chí để chuyển sang giai đoạn sau. Không nhảy giai đoạn. Chi tiết từng phase nằm ở mục 15.

### Giai đoạn 0: Nền móng (local + Fuji, chỉ mình dùng) · P0–P8
- 3 contract lõi (Identity, Graph, Posts) kèm test đầy đủ. TestUSD và PlanPayments làm ở Giai đoạn 1; FeedRegistry làm ở Giai đoạn 2.
- Indexer + API.
- Worker: labeler và ingest Farcaster.
- Web lõi: onboarding, feed, soạn bài, profile, follow, chuyển giữa các feed mặc định, "Vì sao bạn thấy bài này".
- Môi trường local chạy không cần key. CI.
- **Xong khi:** mình dùng app hằng ngày trong 1 tuần thay cho Farcaster/X để theo dõi hệ sinh thái Avalanche, không gặp bug chặn.

### Giai đoạn 1: Alpha (mời 20–50 builder Avalanche) · P9–P14
- NL Feed Builder (EN/VI), moderation stack, importer Farcaster.
- Thông báo trong app (reply, mention, follow), tìm kiếm (user, bài).
- Quota Free tier, gói Pro trả bằng tUSD (có faucet tUSD), observability tối thiểu, kênh nhận feedback.
- Client B: cùng codebase, khác config, deploy trên domain riêng.
- **Xong khi:** D7 retention ≥ 30% và ≥ 40% user active đã chỉnh hoặc tạo ít nhất một feed.

### Giai đoạn 2: Beta (100–300 builder, trong và ngoài nước)
- Chợ plugin: publish, fork, tip; remote feed và labeler của bên thứ ba (kèm `PLUGIN.md` + template).
- Subscribe remote feed/labeler trả phí bằng tUSD, tiền về thẳng ví tác giả.
- Upload ảnh.
- Quy trình báo cáo/kiểm duyệt.
- Security review cho contract.
- Rà soát pháp lý trước khi mở công khai tại Việt Nam.
- **Xong khi:** có plugin của bên thứ ba được dùng thật, và tỷ lệ user chạm quota Free cho thấy đủ nhu cầu để gói Pro bù được chi phí LLM khi chuyển sang tiền thật.

### Giai đoạn 3: Mở
- Mở đăng ký công khai.
- Importer X (từ file archive) và importer ví.
- Cross-post sang Farcaster.
- Quyết định có chuyển lên mainnet hay không. Nếu có thì thay tUSD bằng USDC thật.

### Chưa làm
Token, DAO/governance, proxy upgradeable, gọi thoại/video, app native (dùng PWA), relayer/tài trợ gas, đưa media lên chain.
_(2026-11-12: người dùng chốt làm DM ngay, xem PLAN.md P15; bỏ gọi thoại/video; giữ PWA.)_

## 4. Kiến trúc và công nghệ

### Vì sao dùng TypeScript end-to-end
- **Đội 1 người:** indexer, API, worker và web cùng một ngôn ngữ, không phải chuyển ngữ cảnh.
- **Chia sẻ code thật sự giữa server và trình duyệt.** `feed-sdk` (FeedSpec, `rank()`) và `protocol` (ABI, kiểu dữ liệu) được dùng chung. Feed Builder chỉ lấy candidates một lần rồi **chạy `rank()` ngay trong trình duyệt**, nên bật/tắt chip là feed đổi tức thì, không cần gọi server.
- Hệ sinh thái EVM mạnh nhất nằm ở TypeScript: viem, wagmi, Ponder.
- Sau này làm app mobile bằng React Native/Expo thì dùng lại được `feed-sdk` và `protocol`.
- **Chưa dùng Python/Go/Rust:** LLM gọi qua API nên không cần Python, và quy mô hiện tại chưa cần hiệu năng của Go/Rust.

### 4 thứ cần deploy

| Thành phần | Nội dung | Host |
|---|---|---|
| `contracts` | 6 contract trên Fuji | Fuji |
| `indexer` | Ponder: index event + REST API (Hono) | Railway |
| `worker` | Node + pg-boss: labeler, ingest Farcaster, notifications, onchain-builder | Railway |
| `web` | Next.js PWA. Client B là **cùng app** với `CLIENT_CONFIG=b`, deploy lần 2 | Vercel |

Postgres dùng chung trên Railway, có backup. Chưa dùng Redis: hàng đợi chạy bằng pg-boss ngay trên Postgres.

### Stack chi tiết

| Lớp | Chọn | Ghi chú |
|---|---|---|
| Runtime | Node LTS hiện tại, pnpm workspaces, Turborepo, TypeScript strict | Không dùng Bun, để tránh rủi ro tương thích với Ponder/Next |
| Contracts | Solidity ^0.8.24, Foundry, OpenZeppelin v5 | Fuzz test có sẵn, chạy nhanh. Thêm Slither |
| ABI dùng chung | `@wagmi/cli` sinh ABI có kiểu từ artifact của Foundry | Đặt trong `packages/protocol` |
| Indexer | Ponder | Schema onchain do Ponder quản lý |
| API | Hono trong Ponder + `@hono/zod-openapi` | Có OpenAPI để client khác cũng dùng được |
| DB offchain | Postgres + Drizzle, đặt trong **schema riêng `app`** | Chứa nhãn, quota, thông báo, báo cáo, events. Tách khỏi schema của Ponder để reindex không xoá mất dữ liệu offchain |
| Worker | Node + pg-boss | Có retry và idempotency |
| LLM | `@anthropic-ai/sdk`; `LABELER_MODEL=claude-haiku-5-5`, `COMPILER_MODEL=claude-sonnet-5-5` | Tên model đặt trong env. Validate output bằng zod, retry khi sai schema |
| Web | Next.js App Router | SSR cho trang công khai (bài, profile, feed) để có OG preview khi share lên X/Telegram. Phần app là client component |
| UI | Tailwind + shadcn/ui | |
| Ví | wagmi + viem + RainbowKit (có Core Wallet) | |
| Data fetching | TanStack Query (đi kèm wagmi), TanStack Virtual cho feed dài | |
| i18n | next-intl (en, vi) | |
| Đăng nhập API | Session key ký một message kiểu SIWE (không popup). Server kiểm `isAuthorized` rồi cấp JWT | Ví chính chỉ phải ký lúc onboarding và lúc thanh toán |
| Test | Foundry, Vitest, Playwright | |
| Lint/format | Biome | Một công cụ thay cho ESLint + Prettier |
| Lỗi/log | Sentry, pino | |
| Farcaster | Neynar API (`NEYNAR_API_KEY`) | |
| Builder onchain | Avalanche Data API hoặc explorer API | Đọc docs để tìm endpoint liệt kê các contract mà một địa chỉ đã deploy trên C-Chain, Fuji và các L1 |

Trước khi cài, đọc docs hiện tại của từng thứ, đặc biệt là cách thêm custom Hono route vào Ponder và cách Ponder quản lý schema/view. Nếu lựa chọn nào không hợp thì tự chọn phương án thay và ghi vào Decision log.

### Môi trường
- Local: `pnpm dev:local` chạy Postgres (Docker), Anvil, deploy, indexer, worker (labeler heuristic, Farcaster fixture) và web, không cần key nào.
- Fuji: dùng RPC riêng qua `FUJI_RPC_URL`.
- Chạy `git init` ngay từ đầu.
- CI dùng GitHub Actions: Biome, typecheck, Vitest, `forge test`, và eval labeler khi prompt thay đổi.

## 5. Cấu trúc repo

```
contracts/              Foundry: src/, test/, script/
packages/protocol/      ABI, địa chỉ deploy theo version, typed client, helper session key
packages/feed-sdk/      FeedSpec (zod + JSON Schema), LABELS, SIGNALS, rank(), compileFeed(), moderation
packages/db/            Drizzle: schema "app" cho các bảng offchain + migrations
packages/ui/            component shadcn dùng chung
apps/indexer/           Ponder + REST API
apps/worker/            labeler, ingest-farcaster, notifier, onchain-builder
apps/web/               Next.js PWA; config thương hiệu nằm trong configs/a.ts và configs/b.ts
evals/labeler/          golden set + script đo
scripts/                seed (chỉ local), snapshot export
docs/                   ARCHITECTURE.md, FORK.md, COSTS.md, LIMITATIONS.md, MODERATION.md
```

## 6. Lõi onchain (spec)

Có 6 contract, chia làm 2 nhóm:
- **Lõi protocol:** IdentityRegistry, SocialGraph, Posts, FeedRegistry. Nhỏ, nhàm, **không có admin**, không thu phí giao thức.
- **Của client:** TestUSD và PlanPayments. Có owner (ví của mình). Fork client khác có thể dùng contract thanh toán riêng, hoặc không thu phí.

Các nguyên tắc chung:
- **Contract không upgrade được, và đó là một tính năng.** Khi cần thay đổi thì deploy version mới chạy song song. Indexer đọc được nhiều version. Vì vậy phải chốt schema event với mình trước mỗi lần deploy Fuji, và luôn chừa field `meta` để mở rộng.
- **Identity chính là `address`.** Cách này cho phép follow cả người chưa vào app và nối thẳng với verified address của Farcaster. Đổi lại, mất ví là mất identity; ghi rõ trong LIMITATIONS.md.
- **Không đưa thông tin cá nhân lên chain.** Profile là URL trỏ tới JSON.

### Mô hình xác thực: session key do user tự nạp gas
- **Session key** là một EOA tạo trong trình duyệt. Owner (ví chính) cho phép nó **một lần**, kèm nạp một ít test AVAX (mặc định 0.05, chỉnh được).
- Sau đó session key tự gửi tx và tự trả gas. Kết quả: không có popup cho mỗi hành động, và user vẫn là người trả gas.
- Không cần relayer hay EIP-712 meta-tx.
- Mọi hàm ghi của SocialGraph và Posts nhận tham số `address as` (identity đang hành động) và kiểm tra `identity.isAuthorized(as, msg.sender)`. Hàm này trả true nếu `msg.sender` là owner hoặc là delegate còn hạn.
- **Quyền của delegate:**
  - Được gọi: `post`, `react`, `unreact`, `deletePost`, `follow`, `unfollow`, `followMany`, `setProfile`.
  - Không được: thêm hoặc xoá delegate, đăng ký handle, gọi bất kỳ hàm nào của FeedRegistry, làm bất cứ việc gì liên quan tới tiền.
- Delegate mặc định hết hạn sau 30 ngày và thu hồi được.

### IdentityRegistry
- `registerWithDelegate(string handle, string profileURI, address key, uint64 expiresAt) payable`: đăng ký, cấp delegate, và chuyển `msg.value` sang `key` để nạp gas. Đây là **1 tx duy nhất** lúc onboarding.
- `register(string handle, string profileURI)`: handle là tùy chọn, unique, dạng `[a-z0-9_]{3,20}`.
- `setProfile(address as, string profileURI)`.
- `addDelegate(address key, uint64 expiresAt) payable`: có thể nạp gas luôn trong cùng tx. Thêm `removeDelegate(address key)`.
- `isAuthorized(address owner, address signer) view`.
- Events: `Registered`, `ProfileUpdated`, `DelegateAdded`, `DelegateRemoved`.

### SocialGraph
- `follow(address as, address target)`, `unfollow(address as, address target)`, `followMany(address as, address[] targets)`.
- `followMany` mặc định tối đa 50 địa chỉ mỗi tx. Chỉnh con số này theo gas report.
- Cho phép follow cả địa chỉ chưa đăng ký.
- Storage chỉ có `isFollowing[a][b]`. Số follower/following do indexer tính.
- Events: `Followed`, `Unfollowed`.

### Posts
- `post(address as, string text, bytes32 parentId, bytes32 channel, bytes meta) returns (bytes32 id)`
  - `text` tối đa 1024 **byte**. Tiếng Việt có dấu tốn 2–3 byte mỗi ký tự, nên UI đếm byte chứ không đếm ký tự.
  - `channel` là `keccak256(tên kênh)`, hoặc 0 nếu không thuộc kênh nào.
  - `meta` là JSON nhỏ: lang, mentions, embeds…
- `id = keccak256(abi.encode(as, postNonce[as]++))`.
- Storage chỉ có `authorOf[id]`.
- `react(address as, bytes32 postId, uint8 kind)` với 1 = like, 2 = repost. Thêm `unreact`. `deletePost(address as, bytes32 id)` chỉ tác giả được gọi và chỉ tạo tombstone.
- Events: `Posted(id, author, parentId, channel, text, meta, timestamp)`, `Reacted`, `Unreacted`, `Deleted`.

### FeedRegistry
Chỉ owner gọi được, không qua delegate.
- `registerFeed(uint8 kind, bytes manifest, uint256 pricePerMonth, address payout) returns (uint256 feedId)`
  - `kind`: 0 = SPEC, 1 = REMOTE, 2 = LABELER.
  - Nếu `kind == SPEC` thì bắt buộc `pricePerMonth == 0`.
  - Manifest JSON nằm trong event; storage chỉ lưu hash.
- `updateFeed(feedId, bytes manifest, uint256 price)`.
- Giá và thanh toán bằng tUSD. Địa chỉ token truyền vào constructor và là immutable.
- `subscribe(uint256 feedId)`, `tip(uint256 feedId, uint256 amount)`: dùng `transferFrom`, chuyển thẳng 100% cho `payout`. Có thêm bản `...WithPermit`, để user ký permit (không tốn gas) rồi chỉ cần gửi 1 tx.
- `isSubscribed(address user, uint256 feedId) view`.
- Áp dụng checks-effects-interactions và ReentrancyGuard.
- Events: `FeedRegistered`, `FeedUpdated`, `Subscribed`, `Tipped`.

### TestUSD (token thanh toán tạm)
- ERC-20 + ERC20Permit (OpenZeppelin). Tên "Test USD", ký hiệu `tUSD`, 6 decimals giống USDC.
- Không dùng tên hay ký hiệu của stablecoin thật, để không ai nhầm đây là tiền thật.
- `mint(address to, uint256 amount)`: chỉ owner gọi được, dùng để cấp tUSD cho alpha tester.
- `faucet()`: mỗi địa chỉ nhận một lượng cố định, có cooldown. Mặc định 10 tUSD mỗi 7 ngày; owner chỉnh được.

### PlanPayments (thanh toán gói Pro của client)
- Constructor nhận địa chỉ token và địa chỉ treasury.
- Owner đặt bảng giá: `setPlan(uint8 planId, uint256 pricePerMonth)`. Mặc định Pro = 5 tUSD/tháng.
- `pay(uint8 planId, uint8 months)` và `payWithPermit(...)`: `transferFrom` từ user sang treasury, cộng thêm thời hạn, emit `Paid(user, planId, amount, paidUntil)`.
- `paidUntil(address user, uint8 planId) view`.
- Thanh toán phải gửi từ ví chính (owner), không qua session key.

### Test Foundry phải phủ
- happy path;
- TestUSD: faucet tôn trọng cooldown; chỉ owner mint được;
- PlanPayments: chuyển đúng số tiền cho treasury, cộng đúng thời hạn (kể cả khi gia hạn lúc còn hạn), permit hoạt động;
- `registerWithDelegate` chuyển đúng số tiền sang session key;
- delegate hết hạn hoặc đã thu hồi thì revert;
- delegate gọi hàm bị cấm thì revert;
- `as` không khớp với người gọi thì revert;
- người không phải tác giả gọi `deletePost` thì revert;
- feed SPEC đặt giá > 0 thì revert;
- fuzz cho mọi đầu vào;
- gas report (dùng cho COSTS.md).

## 7. Indexer và API

- Dựng lại toàn bộ state từ event, đọc được nhiều version contract. Parse mention và hashtag.
- Mỗi bài có ID theo nguồn: `oc:<id>` (onchain) hoặc `fc:<hash>` (Farcaster). Tác giả được chuẩn hoá về địa chỉ ETH khi có thể.
- **Indexer không tự gán nhãn.** Nó lấy nhãn từ các labeler (mặc định là labeler của mình). Mỗi batch nhãn có chữ ký của labeler, và indexer verify chữ ký trước khi lưu.
- REST:
  - Bài: `GET /posts/:id`, `GET /threads/:id`
  - User: `GET /users/:addressOrHandle`, `GET /users/:a/followers`, `GET /users/:a/following`
  - `GET /candidates?viewer=..` và `GET /feed?viewer=..&feedId=..|spec=..&moderation=..&cursor=`
  - Khác: `GET /feeds`, `GET /search?q=`, `GET /notifications`, `GET /me/entitlements`
  - Đăng nhập: `POST /auth/session`. Session key ký message, server kiểm `isAuthorized`, rồi trả JWT.
- Bảng offchain (nhãn, quota, thông báo, báo cáo, events) nằm trong schema `app` do Drizzle quản lý, không nằm chung với schema của Ponder.
- Mục tiêu hiệu năng: `/feed` có p95 < 500 ms với 500 candidate.
- `pnpm indexer:replay`: ai cũng dựng lại được toàn mạng từ chain.
- **Snapshot công khai:** `pnpm snapshot:export` xuất graph và bài onchain ra JSON, publish định kỳ. Fuji là testnet, không có cam kết lưu trữ vĩnh viễn, nên snapshot bảo đảm graph không bao giờ mất và có thể chuyển sang chain khác.

## 8. Feed engine (trái tim sản phẩm)

**Nguyên tắc vàng:** LLM chỉ chạy lúc **ghi** (gán nhãn) và lúc **biên dịch** feed. Lúc **đọc** chỉ chạy code TypeScript thuần, nên nhanh, tất định, giải thích được và test được.

**Pipeline:** `sources → moderation stack của viewer → rules của feed → diversity`.
- Moderation stack là danh sách các FeedSpec chỉ chứa rule `hide`/`downrank`. Nó áp lên mọi feed.
- FeedSpec có thể khai báo `extends?: feedId`.
- Sources: `following`, `replies_in_my_threads`, `two_hop`, `channel:<id>`, `farcaster:following`, `farcaster:channel:<name>`. Tự tìm và xác nhận tên các channel Farcaster liên quan tới Avalanche.

**Bộ nhãn v1** (tập đóng, nằm trong `feed-sdk/labels.ts`, chỉnh cho cộng đồng builder):
- Chủ đề: `topic:avalanche`, `topic:infra` (L1, node, tooling), `topic:defi`, `topic:gaming`, `topic:ai`, `topic:grants_hackathons`, `topic:jobs`, `topic:crypto_market` (giá, trading), `topic:politics`, `topic:personal_life`
- Chất lượng (điểm 0–1): `quality:substantive`, `quality:engagement_bait`, `quality:shill`, `quality:low_effort`, `tone:toxic`, `spam:manipulation`
- Tác giả (điểm 0–1): `author:founder`, `author:builder`, `author:new_account`
- An toàn: `safety:illegal`, `safety:nsfw`, `safety:doxxing`
- Ngôn ngữ: `lang:vi`, `lang:en`

**Tín hiệu tính từ dữ liệu** (không cần LLM): `recency`, `reactions`, `reply_count`, `distinct_repliers`, `conversation`, `mutual_follow`, `graph_distance`, `author_post_rate`, và:
- **`onchain_builder`**: số contract mà tác giả đã deploy trên Avalanche (C-Chain, Fuji, các L1), do worker `onchain-builder` lấy về và cache. Đây là tín hiệu **kiểm chứng được**, khác với nhãn LLM `author:builder`. UI hiện nó thành badge "Verified builder".

**6 feed mặc định:**
1. Chronological.
2. "Builders shipping": `onchain_builder` × `quality:substantive`.
3. "Avalanche, no shill": `topic:avalanche`/`topic:infra`, đồng thời hide `quality:shill` và downrank `topic:crypto_market`.
4. "Grants & hackathons".
5. "Founder viết có nội dung".
6. "Cuộc trò chuyện thật".

**FeedSpec v1** (schema zod + JSON Schema công khai, đánh version bằng `v`). Ví dụ:
```json
{
  "v": 1,
  "name": "Builders shipping",
  "extends": null,
  "sources": ["following", "farcaster:following", "farcaster:channel:avalanche"],
  "rules": [
    { "when": { "signal": "onchain_builder", "gte": 1 }, "action": "boost", "weight": 0.6 },
    { "when": { "label": "quality:substantive", "gte": 0.6 }, "action": "boost", "weight": 0.5 },
    { "when": { "label": "quality:shill", "gte": 0.7 }, "action": "hide" },
    { "when": { "label": "topic:crypto_market", "gte": 0.5 }, "action": "downrank", "weight": 0.6 }
  ],
  "recencyHalfLifeHours": 24,
  "diversity": { "maxPerAuthor": 2 },
  "explain": { "en": ["Boost verified builders", "Boost substantive posts", "Hide shilling", "Less price talk"], "vi": ["Ưu tiên builder đã xác minh", "Ưu tiên bài có nội dung", "Ẩn bài shill", "Bớt bàn giá"] }
}
```
(Kiểm tra lại tên channel Farcaster trước khi dùng trong ví dụ và feed mặc định.)

**`rank(spec, viewer, candidates) → { postId, score, reasons[] }[]`**
- Là hàm thuần. `score` = điểm recency + tổng boost − tổng downrank.
- Rule `hide` loại bài khỏi feed. Diversity áp dụng sau cùng.
- Mỗi phần tử trong `reasons` trỏ về đúng 1 rule.
- Có unit test với fixtures.

**`compileFeed(nlText, currentSpec?) → { spec, explain, unsupported[] }`**
- Nhận cả tiếng Anh lẫn tiếng Việt. Hỗ trợ sửa dần trên spec hiện có.
- Yêu cầu nào không map được vào nhãn/tín hiệu thì đưa vào `unsupported`, không tự bịa rule.
- Cache theo hash của input. Có tính vào quota (mục 11).

**Labeler**
- Chỉ gán nhãn những bài có khả năng xuất hiện trong feed (của người được follow, hoặc trong channel đang theo dõi). Không gán toàn bộ firehose.
- **Chống prompt injection:** nội dung bài là dữ liệu không đáng tin.
  - Bọc nội dung trong delimiter; system prompt nói rõ không làm theo chỉ dẫn nằm trong bài.
  - Output phải đúng schema; điểm bị kẹp trong khoảng 0–1.
  - Bài cố thao túng labeler thì gán `spam:manipulation`.
- Phải xử lý được tiếng Việt không dấu, teencode, câu trộn Anh–Việt, và thuật ngữ crypto.
- **Eval:** `evals/labeler/golden.jsonl` bắt đầu với khoảng 100 bài (EN + VI) có ca khó, đặc biệt là ranh giới giữa shill và chia sẻ dự án thật. Chạy `pnpm eval:labeler` trong CI mỗi khi đổi prompt hoặc model.
- **Fallback:** `LABELER_MODE=heuristic`.

## 9. Web

- Config `configs/a.ts` và `configs/b.ts` chứa: `appName`, `logo`, `theme`, `defaultFeeds[]`, `defaultModeration[]`, `enabledSources[]`, `indexerUrl`, `chain`, `plans`.
- **Onboarding:**
  1. Kết nối ví.
  2. Kiểm tra số dư Fuji. Nếu bằng 0 thì hướng dẫn lấy AVAX từ faucet, có link.
  3. Gửi 1 tx `registerWithDelegate`, vừa đăng ký vừa nạp gas cho session key.
  4. Đề xuất import Farcaster.
  5. Vào feed, và ngay lập tức có nội dung.
- Màn onboarding nói rõ 2 điều: app đang chạy trên testnet, và bài đăng nằm onchain vĩnh viễn.
- **Số dư session key** luôn hiện trên giao diện. Khi số dư thấp thì nhắc nạp thêm (1 tx từ ví chính).
- Các màn hình:
  - `/`: feed, có tab cho các feed đã lưu. Mỗi bài có nút "Vì sao?". Có composer inline (đếm byte, mention), reply, like, repost. Bài Farcaster có nhãn nguồn.
  - `/u/[handleOrAddress]`: profile, badge Verified builder, follow.
  - `/c/[channel]`: kênh cộng đồng.
  - `/feeds`: feed mặc định và feed đã lưu (chợ plugin để tới Giai đoạn 2).
  - `/feeds/new`: **Feed Builder**. Bên trái là ô gõ EN/VI. Bên phải là các chip rule và preview live. Candidates chỉ tải một lần; mỗi lần bật/tắt chip thì `rank()` chạy lại ngay trong trình duyệt.
  - `/notifications`, `/search`, `/import`.
  - `/settings`: session key (hạn, số dư, thu hồi, tạo lại), moderation stack, ngôn ngữ, theme.
  - `/billing`: số dư tUSD, nút faucet, mua hoặc gia hạn Pro bằng 1 tx (permit), hạn dùng và quota còn lại.
- Nút **Báo cáo** trên mỗi bài, lưu vào một bảng; có trang admin đơn giản.
- Mỗi tx có link explorer Fuji.

## 10. Importer Farcaster

- Input là FID hoặc username, lấy danh sách following qua Neynar. Khi chưa có key thì dùng fixture.
- Với từng người, lấy verified ETH address rồi `followMany` qua session key, chia theo batch.
- Hiện ước tính số tx và gas trước khi chạy, vì user là người trả.
- Người không có verified address thì lưu offchain vào `pending_follows`. Bài của họ vẫn hiện qua source `farcaster:following`.

## 11. Thu phí ở client và chi phí

- Những khoản client phải trả tiền thật: LLM (gán nhãn, biên dịch feed), Neynar, hosting.
- **Free:** 6 feed mặc định, tối đa `<<N | mặc định: 10>>` lần biên dịch feed mỗi ngày, tối đa 5 feed tự tạo, labeler mặc định.
- **Pro:** quota cao hơn, custom label (classify on-demand những yêu cầu nằm ngoài bộ nhãn), và các tính năng tốn LLM khác do mình chốt sau.
- **Ngay từ Giai đoạn 0:** xây module `entitlements` (gói, quota, đếm lượt dùng). Module này chỉ đọc "user X có Pro tới ngày Y" từ event `Paid`, không phụ thuộc vào token cụ thể.
- **Thanh toán:** bằng tUSD qua PlanPayments (mục 6). Khi chuyển sang tiền thật, chỉ cần deploy PlanPayments với địa chỉ USDC thật; `entitlements` giữ nguyên.
- tUSD lấy được từ faucet, nên doanh thu trên testnet là giả lập. Tín hiệu nhu cầu thật cần theo dõi là **% user chạm quota Free** và % user gia hạn Pro.
- `docs/COSTS.md`:
  - gas của từng hành động (user trả, quy ra test AVAX);
  - chi phí LLM và Neynar trên mỗi user active;
  - chi phí hosting;
  - số user Pro cần có để hoà vốn.

## 12. Vận hành (gọn, vì đội 1 người)

- Sentry cho web, indexer và worker.
- Endpoint `/health`, và trang `/status` hiện: độ trễ indexer so với chain head, độ dài các hàng đợi, lỗi ingest gần nhất.
- Uptime ping và cảnh báo về một kênh (email hoặc Telegram).
- Đo lường sản phẩm ghi vào bảng `events` trong Postgres (ẩn danh, có thông báo cho user):
  - DAU/WAU, D1/D7 retention;
  - % user đã tạo/chỉnh feed;
  - số lần biên dịch feed;
  - phân bố feed đang được dùng.
- Test: unit, integration, và e2e (Playwright) cho hành trình cốt lõi. Chạy trong CI.
- Backup Postgres. Nếu mất DB thì replay từ chain, rồi lấy lại nhãn từ labeler.
- Seed data hư cấu chỉ dùng ở local.

## 13. Kiểm duyệt, quyền riêng tư và pháp lý

- **Tính vĩnh viễn:** không bao giờ đưa thông tin cá nhân lên chain. Xoá bài là tombstone, và client của mình tôn trọng tombstone.
- **Hai tầng kiểm duyệt:**
  1. Lựa chọn của người dùng: moderation stack và labeler.
  2. Danh sách chặn của **người vận hành client** cho nội dung bất hợp pháp, áp ở web và indexer của mình.
- `docs/MODERATION.md`: quy trình báo cáo và xử lý.
- **Pháp lý:** client phục vụ người dùng Việt Nam có thể chịu quy định về mạng xã hội, ví dụ yêu cầu xác thực tài khoản theo Nghị định 147/2024. Đây là việc cần luật sư rà soát **trước khi mở công khai** (Giai đoạn 2). Giai đoạn alpha chỉ mời người dùng.

## 14. Hành trình cốt lõi (cũng là e2e test)

1. Builder có ví và có test AVAX: kết nối, gửi 1 tx là vào app, import Farcaster. Ngay lập tức có feed có nội dung.
2. Chuyển sang feed "Builders shipping": thấy badge Verified builder. Bấm "Vì sao?" thì giải thích đúng lý do.
3. Gõ "less price talk, bớt shill". Feed đổi theo.
4. Đăng bài không cần popup ví, được reply, nhận thông báo.
5. Bật một moderation stack: feed đổi tương ứng.
6. Mở client B: cùng identity, cùng graph.
7. Thu hồi session key. Sau đó key cũ không đăng bài được nữa.
8. Hết quota Free: UI hiện giới hạn rõ ràng, không lỗi.
9. Nhận tUSD từ faucet, mua Pro bằng 1 tx (permit), quota tăng ngay.

## 15. Kế hoạch theo phase

Mỗi phase là một khối việc làm trọn trong 1–3 phiên làm việc, và kết thúc ở trạng thái chạy được. Phase trước chưa đạt "Xong khi" thì không bắt đầu phase sau.

**Cách chạy một phase**
- Mở phiên mới và nói: "Đọc CLAUDE.md và PLAN.md, làm Phase N."
- Làm trên nhánh `phase-N-<tên>`, commit nhỏ, merge khi xong.
- Kết thúc phase bằng một báo cáo ngắn:
  - đã làm gì;
  - đã verify bằng lệnh nào, kèm kết quả;
  - còn nợ gì;
  - đề xuất điều chỉnh cho phase sau.

  Đồng thời cập nhật trạng thái trong PLAN.md.
- Phase có đánh dấu **[REVIEW]** thì **bắt buộc dừng chờ mình duyệt**. Các phase khác thì báo cáo xong rồi chờ mình nói "tiếp".

### Giai đoạn 0: Nền móng

**P0. Khung dự án**
- Việc:
  - `git init`, monorepo pnpm + Turborepo, Biome, tsconfig chung;
  - khung các package/app theo mục 5;
  - Docker Postgres + Anvil, `pnpm dev:local`, `.env.example`;
  - CI (Biome, typecheck, Vitest, `forge test`), README.
- Xong khi: trên máy sạch, `pnpm i && pnpm dev:local` chạy lên đủ service (placeholder) mà không cần key nào; CI xanh.

**P1. Contract lõi [REVIEW]**
- Việc:
  - IdentityRegistry (gồm `registerWithDelegate` và session key), SocialGraph, Posts;
  - test unit + fuzz theo mục 6, gas report;
  - script deploy local;
  - `@wagmi/cli` sinh ABI vào `packages/protocol`.
- Xong khi: `forge test` xanh; Slither không còn cảnh báo mức cao; mình đã duyệt schema event và quyền delegate.

**P2. Indexer và API cơ bản**
- Việc:
  - Ponder index 3 contract; schema `app` (Drizzle) tách riêng;
  - REST: users, posts, threads, followers/following, feed chronological;
  - `POST /auth/session` (JWT), OpenAPI;
  - `pnpm indexer:replay`.
- Xong khi: script gửi tx lên Anvil thì dữ liệu hiện qua API trong vài giây; xoá DB rồi replay ra đúng dữ liệu cũ.

**P3. Walking skeleton chạy online**
- Việc trên web:
  - kết nối ví, onboarding 1 tx (`registerWithDelegate`);
  - session key trong trình duyệt, có hiện số dư;
  - soạn bài không popup, follow, profile, feed chronological;
  - khung next-intl (en/vi).
- Việc deploy: contract lên Fuji, indexer + Postgres lên Railway, web lên Vercel.
- Xong khi: Playwright e2e trên local chạy được luồng "ví A đăng bài, ví B thấy bài"; luồng đó cũng chạy được trên URL public với Fuji.
- Ghi chú: trước Alpha, contract trên Fuji được phép deploy lại, vì chỉ có mình dùng.

**P4. Feed engine (chưa cần LLM)**
- Việc:
  - `feed-sdk`: FeedSpec (zod + JSON Schema), LABELS, SIGNALS, `rank()` kèm reasons;
  - worker pg-boss với labeler heuristic;
  - 6 feed mặc định, `GET /feed`;
  - web: chuyển feed và nút "Vì sao?";
  - seed data local.
- Xong khi: unit test fixtures cho từng rule xanh; trên seed data, 6 feed cho kết quả khác nhau thấy bằng mắt; `rank()` chạy được trong trình duyệt.

**P5. Đọc Farcaster**
- Việc:
  - worker ingest qua Neynar, có chế độ fixture;
  - ID theo nguồn `fc:`; map tác giả về verified ETH address;
  - sources `farcaster:following` và `farcaster:channel:*`; tìm và xác nhận tên các channel về Avalanche;
  - chỉ đưa vào hàng đợi gán nhãn những bài có khả năng lên feed.
- Xong khi: user có follow trên Farcaster vào app là thấy feed có nội dung ngay; bài Farcaster có nhãn nguồn.

**P6. Labeler LLM và eval**
- Việc:
  - labeler dùng `LABELER_MODEL`, chống prompt injection;
  - ký batch nhãn; indexer verify chữ ký;
  - golden set khoảng 100 bài EN/VI, `pnpm eval:labeler`, eval chạy trong CI khi prompt đổi;
  - heuristic làm fallback.
- Xong khi: precision/recall ≥ 0.8 cho `topic:politics`, `quality:engagement_bait`, `quality:shill`, `quality:substantive`; chi phí trên 1.000 bài đã ghi vào COSTS.md.

**P7. Tín hiệu onchain_builder**
- Việc:
  - tìm endpoint Avalanche Data API (hoặc explorer API) liệt kê các contract một địa chỉ đã deploy;
  - worker lấy dữ liệu và cache;
  - signal `onchain_builder`, badge "Verified builder";
  - feed "Builders shipping" dùng signal này.
- Xong khi: một địa chỉ đã biết là có deploy contract thì nhận badge; địa chỉ chưa từng deploy thì không.

**P8. Hoàn thiện và đóng băng [REVIEW]**
- Việc:
  - Sentry, `/health`, `/status`, cảnh báo uptime, backup Postgres;
  - `pnpm snapshot:export`, bảng `events` cho đo lường;
  - sửa bug;
  - rà schema event lần cuối, deploy bản contract v1 chính thức lên Fuji nếu cần;
  - viết LIMITATIONS.md và ARCHITECTURE.md.
- Xong khi: mình dùng app hằng ngày 1 tuần mà không gặp bug chặn (đây là tiêu chí thoát Giai đoạn 0). Từ thời điểm này schema đóng băng; muốn thay đổi thì deploy version mới chạy song song.

### Giai đoạn 1: Alpha

**P9. NL Feed Builder và quota**
- Việc:
  - `compileFeed` (`COMPILER_MODEL`, nhận EN/VI, sửa dần trên spec cũ, có `unsupported`, có cache);
  - màn `/feeds/new` với chip và preview re-rank ngay trong trình duyệt;
  - lưu feed cá nhân offchain, trong schema `app`;
  - module `entitlements` và quota Free.
- Xong khi: gõ "less price talk, bớt shill" thì feed đổi; hết quota thì UI báo rõ.

**P10. Kiểm duyệt**
- Việc:
  - moderation stack trong settings, áp lên mọi feed;
  - nút Báo cáo và trang admin;
  - danh sách chặn của người vận hành, áp ở cả web và indexer;
  - MODERATION.md.
- Xong khi: bật một moderation stack thì mọi feed đổi tương ứng; bài nằm trong danh sách chặn không hiện ở bất cứ đâu.

**P11. Importer Farcaster**
- Việc:
  - màn `/import`, lấy danh sách following và verified address;
  - ước tính số tx và gas trước khi chạy;
  - `followMany` theo batch qua session key;
  - `pending_follows`.
- Xong khi: import thành công một tài khoản Farcaster thật; số đã import và số bị bỏ qua hiển thị đúng.
- **Mốc: sau phase này, mời 20–50 builder Avalanche vào Alpha.**

**P12. Thông báo và tìm kiếm**
- Việc:
  - notifier (reply, mention, follow) và màn `/notifications`;
  - tìm kiếm bằng Postgres full-text kèm extension `unaccent`, màn `/search`.
- Xong khi: được reply thì nhận thông báo trong vài giây; tìm được user theo handle, và tìm được bài theo từ khoá tiếng Việt dù gõ có dấu hay không dấu.

**P13. Thanh toán bằng tUSD [REVIEW]**
- Việc:
  - TestUSD và PlanPayments, test theo mục 6;
  - màn `/billing`: faucet, mua Pro bằng 1 tx (permit);
  - `entitlements` đọc event `Paid`.
- Xong khi: bước 8–9 của hành trình cốt lõi chạy được trên Fuji; mình đã duyệt contract trước khi deploy.

**P14. Client B và đo lường**
- Việc:
  - `configs/b.ts`, deploy lần 2 trên domain riêng; FORK.md;
  - nhờ một người chưa đụng vào code fork thử và bấm giờ;
  - trang số liệu nội bộ: D1/D7, % user chỉnh feed, % user chạm quota.
- Xong khi: client B chạy trên cùng identity và graph; có số đo "fork trong X phút"; đủ số liệu để đánh giá tiêu chí thoát Alpha.

### Giai đoạn 2 và 3
Chỉ lập kế hoạch phase chi tiết khi Alpha đã đạt tiêu chí. Phạm vi xem ở mục 3.

## 16. Quy tắc làm việc

1. **Trước khi code:** đọc hết file này. Hỏi mình tối đa 3 câu, chỉ hỏi những gì thật sự chặn P0–P3. Sau đó viết:
   - `PLAN.md`: chép các phase P0–P14 ở mục 15, chia mỗi phase thành sub-task có checkbox, ước lượng thời gian cho 1 người cùng Claude Code, ghi rủi ro. Không tự đổi thứ tự hay gộp phase khi chưa hỏi mình;
   - `CLAUDE.md`: luận điểm, kiến trúc, lệnh chạy, quy ước, Decision log;
   - `docs/ARCHITECTURE.md` bản đầu, có sơ đồ.

   Rồi **dừng lại chờ mình duyệt**. Chưa bắt đầu P0 khi mình chưa nói.
2. Làm từng phase theo cách ở mục 15. Mỗi phase kết thúc bằng test xanh, docs đã cập nhật, commit, và báo cáo rõ phần nào đã verify thật, phần nào chưa.
3. Trong một phase, cho chạy end-to-end trước rồi mới làm sâu.
4. Mọi dịch vụ ngoài (Anthropic, Neynar, Avalanche Data API, RPC) đều phải có chế độ mock/fixture. Thiếu key không được chặn tiến độ.
5. ABI, schema event, FeedSpec và REST API là **interface công khai**. Muốn đổi thì hỏi mình trước.
6. Secrets chỉ nằm trong `.env` khi dev, và trong secret manager của nền tảng host khi deploy. Không bao giờ in ra hay commit key, kể cả private key của session key.
7. Không đụng tới mainnet hay tiền thật khi chưa có xác nhận của mình.
8. Khi dùng thư viện/API bên ngoài, đọc docs hiện tại thay vì đoán version hay API.
9. Code TypeScript strict. Dùng zod ở mọi biên. Hàm `rank()` không được có I/O, và phải chạy được cả trên server lẫn trong trình duyệt.

Bắt đầu từ bước 1 của mục 16.
