# PLAN

> Kế hoạch chi tiết cho Giai đoạn 0 và Giai đoạn 1 (P0–P14). Danh sách phase lấy từ `INIT_PROMPT.md` §15. Trạng thái từng phase nằm trong `PROGRESS.md`.
> Ước lượng tính bằng **ngày làm việc của 1 người cùng Claude Code**. Đây là ước lượng thô; sẽ chỉnh lại sau mỗi phase.
> Không tự đổi thứ tự hay gộp phase khi chưa hỏi người dùng.

## Tổng quan

| Phase | Tên | Ước lượng | Review bắt buộc |
|---|---|---|---|
| P0 | Khung dự án | 0.5 ngày | |
| P1 | Contract lõi | 1.5–2 ngày | ✔ schema event + quyền delegate |
| P2 | Indexer + API cơ bản | 1.5–2 ngày | |
| P3 | Walking skeleton online | 2–3 ngày | |
| P4 | Feed engine (chưa LLM) | 2 ngày | |
| P5 | Đọc Farcaster | 1.5–2 ngày | |
| P6 | Labeler LLM + eval | 2 ngày | |
| P7 | onchain_builder | 1 ngày | |
| P8 | Hoàn thiện + đóng băng | 1–1.5 ngày, cộng 1 tuần dùng thử | ✔ trước khi có user thật |
| **Giai đoạn 0** | | **khoảng 13–16 ngày, cộng 1 tuần dùng thử** | |
| P9 | NL Feed Builder + quota | 2 ngày | |
| P10 | Kiểm duyệt | 1.5 ngày | |
| P11 | Importer Farcaster | 1 ngày | |
| P12 | Thông báo + tìm kiếm | 1.5 ngày | |
| P13 | Thanh toán tUSD | 1.5 ngày | ✔ contract thanh toán |
| P14 | Client B + đo lường | 1 ngày | |
| P15 | Tin nhắn riêng (DM), thêm ngày 2026-11-12 | 1.5 ngày | |
| P15b | Đồng bộ UI theo design canvas nâng cấp, thêm ngày 2026-11-12 | 1 ngày | |
| P18 | Tài khoản mật khẩu + ví nhúng + app tặng gas, thêm ngày 2026-11-12 | 1 ngày | |
| **Giai đoạn 1** | | **khoảng 9–10 ngày** | |

## Điều kiện tiên quyết

**Công cụ** (đã kiểm tra trên máy ngày 2026-11-11): Node 26.7.0, pnpm 11.20.0, Foundry (forge/anvil) 1.8.5, Docker 29.5.3, git 2.50.1, gh 2.97.0, Slither 0.11.6. Repo GitHub đã có remote `origin` (public).

**Tài khoản và key, theo phase cần đến:**

| Cần | Từ phase | Ghi chú |
|---|---|---|
| Ví deployer có test AVAX trên Fuji | P3 | `DEPLOYER_PRIVATE_KEY` |
| Tài khoản Railway (Postgres, indexer, worker) | P3 | |
| Tài khoản Vercel (web) | P3 | |
| `FUJI_RPC_URL` | P3 | RPC công khai tạm đủ; cần RPC riêng trước Alpha |
| `NEYNAR_API_KEY` | P5 | Trước đó dùng fixture |
| `ANTHROPIC_API_KEY` | P6 | Trước đó dùng labeler heuristic |
| `LABELER_PRIVATE_KEY` | P6 | Ví riêng, dùng để ký batch nhãn |
| Key Avalanche Data API (nếu cần) | P7 | |
| Sentry | P8 | |

---

## Giai đoạn 0: Nền móng

### P0. Khung dự án · 0.5 ngày
- [x] Root: `package.json` (engines), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (strict), `biome.json`, `.nvmrc`, `.env.example`
- [x] Kiểm tra Node 26 có tương thích với Ponder và Next.js không. Nếu không thì ghim Node LTS trước đó trong `.nvmrc`, rồi ghi vào Decision log — _Next 16 build + e2e chạy trên Node 26; không dùng Ponder (xem Decision log)_
- [x] Khung workspace: `contracts/` (`forge init`), `packages/{protocol,feed-sdk,db,ui}`, `apps/{indexer,worker,web}` ở dạng placeholder chạy được
- [x] `docker-compose.yml`: Postgres, có bật extension `unaccent` — _`unaccent` bật trong migration `0001_search`_
- [x] `pnpm dev:local`: chạy song song Postgres, Anvil, indexer, worker, web
- [x] Scripts gốc: `pnpm test`, `pnpm lint`, `pnpm typecheck`
- [x] GitHub Actions: Biome, typecheck, Vitest, `forge test`
- [x] README: yêu cầu môi trường và cách chạy local
- **Xong khi:** clone sạch, chạy `pnpm i && pnpm dev:local` thì lên đủ service mà không cần key nào; CI xanh trên GitHub.

### P1. Contract lõi · 1.5–2 ngày · [REVIEW]
- [x] `IdentityRegistry`:
  - `register`;
  - `registerWithDelegate` (payable, chuyển `msg.value` sang session key);
  - `setProfile(as, uri)`;
  - `addDelegate` (payable, để nạp thêm gas), `removeDelegate`, `isAuthorized`;
  - validate handle theo `[a-z0-9_]{3,20}`
- [x] `SocialGraph`: `follow`, `unfollow`, `followMany(as, …)` có kiểm `isAuthorized`; giới hạn kích thước batch
- [x] `Posts`:
  - `post(as, text, parentId, channel, meta)`, text tối đa 1024 byte;
  - storage `authorOf`;
  - `react`, `unreact`, `deletePost`
- [x] Phân quyền delegate: delegate gọi hàm chỉ dành cho owner thì revert
- [x] Test unit theo INIT_PROMPT §6, và fuzz cho: độ dài text, handle, kích thước batch, thời hạn delegate — _58 test, có fuzz_
- [x] `forge test --gas-report`, ghi bảng gas đầu tiên vào `docs/COSTS.md`
- [x] Slither không còn cảnh báo mức high — _0 high/medium trong `src/`; high/medium còn lại nằm trong OpenZeppelin `Math.sol` (false positive đã biết)_
- [x] `script/Deploy.s.sol` cho Anvil và Fuji; ghi địa chỉ theo chainId vào `packages/protocol` — _Anvil ✅; Fuji ✅ 2026-11-12 (startBlock 60950634, source verify trên Snowtrace)_
- [x] `@wagmi/cli` sinh ABI có kiểu vào `packages/protocol` — _thay bằng `scripts/gen-abis.mjs` (xem Decision log)_
- [x] Chốt bảng schema event trong `docs/ARCHITECTURE.md` (§6), gồm cả field nào được indexed
- **Xong khi:** `forge test` xanh; Slither không có high; **người dùng đã duyệt schema event và quyền delegate**.

### P2. Indexer + API · 1.5–2 ngày
- [x] Đọc docs Ponder hiện tại về: custom Hono route, cách quản lý schema/view, và cách để Ponder sống chung với schema `app` trong cùng Postgres — _chọn indexer viem tự viết thay Ponder, lý do ở ARCHITECTURE.md_
- [x] `ponder.config.ts` (Anvil và Fuji, chọn qua env) và `ponder.schema.ts`: users, profiles, delegates, follows, posts, reactions — _thay bằng `apps/indexer/src/sync.ts` + schema `chain` (Drizzle)_
- [x] `packages/db`: Drizzle schema `app` + migrations. Bắt đầu với bảng `events`
- [x] REST (Hono + zod-openapi): users, followers/following, posts, threads, feed chronological; `/openapi.json`
- [x] `POST /auth/session`: session key ký message, server kiểm `isAuthorized`, trả JWT
- [x] `pnpm indexer:replay` — _integration test so state trước/sau replay_
- [x] Integration test: script gửi tx lên Anvil rồi poll API
- **Xong khi:** tx trên Anvil hiện qua API trong vài giây; xoá DB rồi replay thì dữ liệu khớp như cũ.

### P3. Walking skeleton online · 2–3 ngày
- [x] Next.js App Router + Tailwind + shadcn/ui (`packages/ui`) + khung next-intl (en/vi)
- [x] wagmi + viem + RainbowKit (có Core Wallet); chain Anvil hoặc Fuji chọn qua env
- [x] Session key: tạo trong trình duyệt, lưu cục bộ, hiện số dư, nhắc nạp thêm khi số dư thấp
- [x] Onboarding: kiểm số dư Fuji → nếu bằng 0 thì hướng dẫn faucet → gửi 1 tx `registerWithDelegate` → vào feed — _verify trên Anvil; Fuji chưa chạy_
- [x] Composer (đếm byte), follow, `/u/[handleOrAddress]`, feed chronological; mỗi tx có link explorer
- [x] SSR cho trang bài và trang profile công khai, có OG tags cơ bản
- [x] `configs/a.ts` và cơ chế chọn config qua `CLIENT_CONFIG`
- [x] Playwright e2e trên local: ví A đăng bài, ví B thấy bài — _9 test_
- [ ] Deploy: contract lên Fuji; Postgres + indexer lên Railway; web lên Vercel; secrets đặt trên các nền tảng đó — _contract Fuji ✅; Railway/Vercel tạm chưa làm (người dùng chốt chạy localhost: `pnpm dev:fuji`)_
- **Xong khi:** e2e trên local xanh, và cùng luồng đó chạy được trên URL public với Fuji.

### P4. Feed engine (chưa cần LLM) · 2 ngày
- [x] `feed-sdk`:
  - FeedSpec v1 (zod) và xuất ra JSON Schema;
  - `LABELS`, `SIGNALS`;
  - pipeline `sources → moderation → rules → diversity`;
  - `rank()` kèm reasons, chạy được trong trình duyệt
- [x] Unit test fixtures cho từng loại rule và cho diversity
- [x] Worker (pg-boss): job `label-post` dùng labeler heuristic; bảng `labels` và `author_labels` trong schema `app`
- [x] 6 feed mặc định (INIT_PROMPT §8), định nghĩa bằng FeedSpec ngay trong code
- [x] `GET /candidates`, `GET /feed?feedId|spec`
- [x] Web: tab chuyển feed, nút "Vì sao?"
- [x] `scripts/seed` (chỉ chạy ở local): khoảng 40 persona hư cấu, 400 bài EN/VI, có thread và graph follow
- **Xong khi:** fixtures xanh; trên seed data, 6 feed cho kết quả khác nhau thấy rõ bằng mắt; `rank()` chạy được trong trình duyệt.

### P5. Đọc Farcaster · 1.5–2 ngày
- [x] Đọc docs Neynar hiện tại: tìm FID theo verified address, danh sách following, feed theo FID/channel, giới hạn và giá
- [x] Tìm FID của user qua ví của họ. Nếu không có FID thì feed dùng các channel Avalanche — _verify bằng fixture; Neynar thật chưa chạy (thiếu key)_
- [x] Worker `ingest-farcaster` theo dõi following của user và các channel Avalanche; có chế độ fixture
- [ ] Tìm và xác nhận tên các channel Farcaster về Avalanche, ghi vào config — _🟡 `FC_CHANNELS` mặc định `avalanche,avax-builders`, chưa xác nhận với Neynar thật_
- [x] Chuẩn hoá dữ liệu: ID dạng `fc:<hash>`; tác giả map về verified ETH address nếu có; lưu trong schema `app`
- [x] Sources `farcaster:following` và `farcaster:channel:<name>` trong `/candidates`
- [x] Chỉ đưa vào hàng đợi gán nhãn những bài có khả năng lên feed — _chỉ bài trong cửa sổ candidate (`CANDIDATE_WINDOW_DAYS`)_
- [x] Web: nhãn nguồn trên bài Farcaster, render embed cơ bản — _embed URL: ảnh + chip link; quote-cast chưa hỗ trợ_
- **Xong khi:** user có follow trên Farcaster vào app là thấy feed có nội dung ngay.

### P6. Labeler LLM + eval · 2 ngày
- [x] Labeler dùng Anthropic SDK với `LABELER_MODEL`: chạy theo batch, output có cấu trúc, validate bằng zod, retry khi sai — _🟡 chưa chạy với key thật; test bằng LLM mock_
- [x] Chống prompt injection: delimiter, system prompt nói rõ không làm theo chỉ dẫn trong bài, kẹp điểm 0–1, nhãn `spam:manipulation`
- [x] Ký batch nhãn bằng `LABELER_PRIVATE_KEY`; endpoint `/labels?since=`; indexer verify chữ ký trước khi lưu — _`POST /labels` (labeler → indexer) + `GET /labels?since=` (công khai, kèm chữ ký)_
- [x] `evals/labeler/golden.jsonl` khoảng 100 bài EN/VI, cố ý có ca khó: shill so với chia sẻ dự án thật, văn bản không dấu, teencode, châm biếm
- [x] `pnpm eval:labeler` in precision/recall theo từng nhãn; CI chạy lệnh này khi prompt hoặc model đổi — _CI chạy mỗi lần (heuristic, không cần key)_
- [ ] Ghi chi phí gán nhãn trên 1.000 bài vào COSTS.md — _🟡 mới là ước tính trong COSTS.md; đo thật cần `ANTHROPIC_API_KEY`_
- **Xong khi:** precision/recall ≥ 0.8 cho `topic:politics`, `quality:engagement_bait`, `quality:shill`, `quality:substantive`.

### P7. onchain_builder · 1 ngày
- [x] Tìm nguồn dữ liệu theo thứ tự ưu tiên: — _Avalanche Data API (Glacier); local dùng fixture_
  1. Avalanche Data API, nếu có endpoint liệt kê contract mà một địa chỉ đã deploy;
  2. explorer API;
  3. nếu cả hai đều không có: quét danh sách tx của địa chỉ và lấy `contractAddress` từ receipt
- [x] Worker `onchain-builder` + cache có TTL trong schema `app`
- [x] Signal `onchain_builder`, badge "Verified builder", feed "Builders shipping"
- **Xong khi:** địa chỉ đã từng deploy contract thì có badge; địa chỉ chưa từng deploy thì không.

### P8. Hoàn thiện + đóng băng · 1–1.5 ngày, cộng 1 tuần dùng thử · [REVIEW]
- [x] Sentry cho web, indexer và worker; log bằng pino — _🟡 code có, chưa có DSN thật_
- [x] `/health` và `/status` (độ trễ indexer, độ dài hàng đợi, lỗi ingest gần nhất); uptime ping kèm cảnh báo — _uptime ping ⛔ cần dịch vụ ngoài_
- [x] Backup Postgres; `pnpm snapshot:export` — _`pnpm db:backup` (schema `app`)_
- [x] Bảng `events`, ghi các sự kiện đo lường chính
- [x] Rà schema event lần cuối; deploy bản contract v1 chính thức lên Fuji nếu có thay đổi — _bản v1 lên Fuji ⛔_
- [x] Viết `docs/LIMITATIONS.md`, cập nhật `docs/ARCHITECTURE.md`
- [ ] Dùng app hằng ngày trong 1 tuần, ghi bug vào PROGRESS.md — _⛔ cần bản chạy thật trên Fuji_
- **Xong khi:** 1 tuần dùng thử không gặp bug chặn; **người dùng duyệt việc đóng băng schema**.

---

## Giai đoạn 1: Alpha

### P9. NL Feed Builder + quota · 2 ngày
- [x] `compileFeed` dùng `COMPILER_MODEL`: nhận EN/VI, sửa dần trên spec cũ, có `unsupported`, cache theo hash của input — _🟡 bản LLM chưa chạy với key thật; heuristic đã verify_
- [x] Màn `/feeds/new`: ô nhập, chip bật/tắt, preview re-rank ngay trong trình duyệt
- [x] Lưu feed cá nhân vào schema `app`
- [x] `entitlements`: gói, quota, đếm lượt dùng; `GET /me/entitlements`; UI khi hết quota
- **Xong khi:** gõ "less price talk, bớt shill" thì feed đổi; hết quota thì UI báo rõ ràng.

### P10. Kiểm duyệt · 1.5 ngày
- [x] Moderation stack trong settings, áp lên mọi feed
- [x] Nút Báo cáo, bảng `reports`, trang admin (chỉ địa chỉ admin vào được)
- [x] Danh sách chặn của người vận hành, áp ở cả web và indexer
- [x] `docs/MODERATION.md`
- **Xong khi:** bật một moderation stack thì mọi feed đổi tương ứng; bài trong danh sách chặn không hiện ở bất cứ đâu.

### P11. Importer Farcaster · 1 ngày
- [x] Màn `/import`: nhập FID hoặc username → lấy danh sách following → lấy verified address — _verify bằng fixture_
- [x] Ước tính số tx và gas; chạy `followMany` theo batch qua session key, có thanh tiến trình và retry — _tự thử lại 1 lần mỗi batch, bấm lại thì chạy tiếp từ batch lỗi_
- [x] Bảng `pending_follows`
- **Xong khi:** import thành công một tài khoản Farcaster thật. **Sau phase này: mời 20–50 builder vào Alpha.**

### P12. Thông báo + tìm kiếm · 1.5 ngày
- [x] Notifier (reply, mention, follow) ghi vào bảng `notifications`; màn `/notifications` (dùng polling)
- [x] Tìm kiếm bằng Postgres full-text + extension `unaccent`; màn `/search` cho user và bài
- **Xong khi:** được reply thì có thông báo trong vài giây; tìm được bài tiếng Việt dù gõ có dấu hay không dấu.

### P13. Thanh toán tUSD · 1.5 ngày · [REVIEW]
- [x] TestUSD (ERC20Permit, owner mint, faucet có cooldown) + test
- [x] PlanPayments (`setPlan`, `pay`, `payWithPermit`, `paidUntil`) + test
- [x] Indexer bắt event `Paid` và đưa vào `entitlements`
- [x] Màn `/billing`: số dư tUSD, nút faucet, mua Pro bằng 1 tx, hạn dùng — _e2e: faucet + permit + payWithPermit_
- **Xong khi:** bước 8–9 của hành trình cốt lõi chạy được trên Fuji; **người dùng đã duyệt contract trước khi deploy**.

### P14. Client B + đo lường · 1 ngày
- [ ] `configs/b.ts`, deploy lần 2 trên Vercel — _🟡 `configs/b.ts` build + chạy local được; Vercel ⛔_
- [ ] Viết `docs/FORK.md`; nhờ một người chưa đụng vào code fork thử và bấm giờ — _🟡 FORK.md xong; bấm giờ fork ⛔ cần người ngoài_
- [x] Trang số liệu nội bộ: D1/D7, % user chỉnh feed, % user chạm quota — _`/admin` → Metrics_
- **Xong khi:** client B chạy trên cùng identity và graph; có số đo "fork trong X phút"; đủ số liệu để đánh giá tiêu chí thoát Alpha.

### P15. Tin nhắn riêng (DM) · 1.5 ngày
> Người dùng chốt ngày 2026-11-12: làm DM ngay, **không** làm gọi thoại/video, giữ PWA (không app native).
- [x] `packages/protocol/dm.ts`: khoá X25519 sinh từ 1 chữ ký owner, owner ký xác nhận khoá công khai, ECDH → HKDF → AES-256-GCM (AAD theo chiều gửi) + unit test
- [x] Migration `0004_dm`: `app.dm_keys` (có lịch sử), `app.dm_messages` (chỉ ciphertext), `app.dm_threads` (trạng thái theo từng người)
- [x] API `/dm/*`: khoá, hộp thư Chính/Yêu cầu theo graph onchain (xếp theo bạn chung + `onchain_builder`), gửi, đã đọc, chấp nhận/từ chối; chống spam (3 tin chờ, 20 người lạ/ngày, 30 tin/phút, phải đăng ký, blocklist) + integration test
- [x] Web: `/messages` (2 tab, chấp nhận/từ chối), `/messages/[handle|address]` (bong bóng, thả cảm xúc, khay emoji, "Đã xem"), nút phong bì ở header + rail, nút nhắn tin trên hồ sơ, mục Tin nhắn + Giấy phép trong Cài đặt
- [x] Twemoji v17.0.3 (56 SVG, CC-BY 4.0) trong `apps/web/public/emoji/`, credit ở Cài đặt › Giấy phép
- [x] Seed: 5 builder có khoá nhắn tin; e2e: bật khoá → người lạ nhắn → Yêu cầu → chấp nhận → thả ❤️ → trả lời có Twemoji → người kia giải mã được
- **Xong khi:** hai ví nhắn qua lại được trên Fuji, server chỉ thấy ciphertext; người lạ vào Yêu cầu, người mình follow vào Chính.

### P15b. Đồng bộ UI theo design canvas nâng cấp · 1 ngày
> Người dùng yêu cầu ngày 2026-11-12: "giao diện có gì mới chưa làm thì làm luôn". Nhánh `phase-15-ui-design-sync` (đã merge `phase-15-dm`).
- [x] Foundations: token màu/trạng thái (sáng + tối), motion (`--spring`, `--bouncy`, keyframe), icon mới, `kit.tsx` (Verified, Segmented, CountUp, Burst, BigRing, Eq)
- [x] An toàn ví chính: `useMainWallet` ép `chainId` + đổi mạng trước mọi tx/chữ ký; chip sai mạng; sheet nạp gas cho session key
- [x] API bổ sung (chỉ thêm field/endpoint): `origins`, `viewerFollows`, `registeredBlock`, `topTopics`, `?kind=`, `/builders`, `/channels` + join (`user_settings.channels`, migration `0005_channels`), `subscribers`, `labelers`, `parent` trong thông báo, lý do report mới + integration test
- [x] Màn hình: Home/feed/thread, Why, report, compose, thông báo, Explore, kênh, hồ sơ (IdCard), cài đặt, billing, feed builder, feeds, import, onboarding (intro + vai trò + các trạng thái ví); client B "Phố Builder"
- [x] Gắn DM vào shell mới: hộp thư ở header + rail, nút nhắn tin trên hồ sơ, mục Tin nhắn trong Cài đặt, credit Twemoji trong sheet Giấy phép, chat full-screen trên mobile
- [ ] Soát màn intro onboarding khi chưa kết nối ví và client B trên máy thật — _intro ✅ (chụp 3 vai trò sáng/tối, sửa tràn màn thấp); client B trên máy thật chưa_
- **Xong khi:** lint + typecheck sạch; Vitest + e2e xanh trên stack local; chụp màn sáng/tối khớp design; người dùng duyệt rồi mới merge vào `main`.

### P18. Tài khoản mật khẩu + ví nhúng · 1 ngày
> Người dùng yêu cầu ngày 2026-11-12: "bỏ toàn bộ việc kết nối wallet dùng account password tự tạo wallet bên trong… ko muốn hiện popup". Chốt: app tặng gas (Fuji 0.001 AVAX), quên mật khẩu = mất tài khoản + nút xuất khoá. Nhánh `phase-18-embedded-wallet`.
- [x] `packages/protocol/account.ts`: scrypt → encKey/authKey, keystore AES-256-GCM, `accountMessage` + unit test
- [x] Migration `0006_accounts`, API `/accounts` (tạo + tặng gas), `/accounts/kdf/{handle}`, `/accounts/login`, giới hạn theo IP/tên + integration test
- [x] Web: `lib/embedded.ts` (ví nhúng), `useMainWallet` ký ngầm, bỏ RainbowKit/connector, onboarding tên + mật khẩu (tự lên chain, tự bật thiết bị), Cài đặt › Xuất khoá + Đăng xuất, mức gas theo mạng (`lib/gas.ts`)
- [x] e2e: tạo tài khoản → tự đăng ký → xuất khoá → đăng xuất → máy khác đăng nhập (sai mật khẩu bị từ chối) → tự bật thiết bị
- [x] Nhập khoá ví cũ (tài khoản đăng ký bằng Core/MetaMask chuyển sang mật khẩu), chặn mật khẩu yếu ở client
- [x] Liên kết ví builder bằng chữ ký (`/me/wallets`, migration `0007_linked_wallets`), worker cộng contract của ví liên kết + e2e
- [x] Fuji: ví vòi riêng có AVAX test (`FAUCET_PRIVATE_KEY`), tạo tài khoản thật trên `pnpm dev:fuji` (2026-11-13: tạo, đăng bài, máy khác đăng nhập, nhập khoá, liên kết ví)
- **Xong khi:** lint + typecheck + Vitest + e2e xanh ở local; trên Fuji tạo tài khoản, đăng bài, đăng nhập máy khác mà không có popup nào.

---

## Rủi ro

| Rủi ro | Ảnh hưởng | Cách giảm thiểu |
|---|---|---|
| Ponder chưa hỗ trợ Node 26, hoặc API custom route/schema đã đổi | P0–P2 chậm | Đọc docs trước khi làm. Nếu vướng thì ghim Node LTS trước đó, hoặc tự viết indexer bằng viem |
| Ponder và Drizzle (schema `app`) xung đột trong cùng một DB | P2 | Tách schema rõ ràng; thử replay ngay từ P2 |
| Neynar giới hạn hoặc tính phí theo lượng đọc | P5 | Có chế độ fixture; chỉ ingest following và vài channel; có cache |
| Không có endpoint "contract đã deploy" | P7 | Đã có 3 phương án dự phòng trong P7 |
| Faucet Fuji gây ma sát lúc onboarding | Alpha | App tặng gas lúc tạo tài khoản (P18); vòi cạn thì màn đăng ký chỉ faucet + địa chỉ để chép |
| Next.js + wagmi lỗi hydration | P3 | Chỉ SSR trang công khai; phần app là client component |
| Session key trong trình duyệt bị lộ (XSS) | Bảo mật | Quyền hẹp, hết hạn sau 30 ngày, số dư nhỏ, CSP chặt, thu hồi được |
| Nhãn tiếng Việt không chính xác | Chất lượng feed | Golden set + eval chạy trong CI |
| Fuji không cam kết lưu dữ liệu vĩnh viễn | Mất dữ liệu | Chạy `snapshot:export` định kỳ |
| Làm một mình, dễ phình phạm vi | Tiến độ | Bám sát phase; "Xong khi" là cổng chặn; việc ngoài phạm vi thì đưa vào Backlog |
| RPC công khai của Fuji bị rate limit | P3 trở đi | Chuyển sang RPC riêng trước Alpha |

## Backlog (ngoài P0–P15)

Giai đoạn 2–3 theo INIT_PROMPT §3:
- chợ plugin và FeedRegistry;
- remote feed và labeler của bên thứ ba, kèm `PLUGIN.md` và template;
- upload ảnh;
- security review;
- rà soát pháp lý;
- importer X và importer ví;
- cross-post;
- quyết định có lên mainnet không.
- Tin nhắn: push notification (Web Push), báo cáo tin nhắn, forward secrecy (double ratchet), ảnh đính kèm.
- Ví nhúng: danh sách mật khẩu lộ đầy đủ (zxcvbn/HIBP k-anonymity); khoá lại ví sau một thời gian; passkey; ký liên kết ví builder bằng WalletConnect thay vì dán chữ ký.
- Phần design canvas chưa làm (P15b): mini app (Game/Agent/Dapp, phạm vi chưa chốt trong spec), xuất bản feed onchain + feed trả phí (cần FeedRegistry), upload ảnh, animation xếp hạng lại feed, avatar mini trong thread, quét contract theo yêu cầu (hiện worker quét định kỳ), avatar thành viên kênh (cần API).
