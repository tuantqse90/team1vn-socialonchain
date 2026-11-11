# Fork / build trên nền này

"Một danh tính, một graph, hàng nghìn feed." Có 4 cách dùng lại, từ nhẹ tới nặng.

## 1. Chỉ viết feed (không cần code)

Feed là một `FeedSpec` JSON. Schema công khai: `GET /feedspec.schema.json`.

```json
{
  "v": 1,
  "name": "Builders, no price talk",
  "sources": ["following", "two_hop", "farcaster:channel:avax-builders"],
  "rules": [
    { "when": { "signal": "onchain_builder", "gte": 1 }, "action": "boost", "weight": 0.8 },
    { "when": { "label": "topic:crypto_market", "gte": 0.6 }, "action": "hide" }
  ],
  "recencyHalfLifeHours": 24,
  "diversity": { "maxPerAuthor": 2 }
}
```

- Nhãn và tín hiệu dùng được: `LABELS` và `SIGNALS` trong `packages/feed-sdk/src/labels.ts`.
- Thử ngay: `GET /feed?spec=<JSON url-encoded>` hoặc dùng Feed Builder trong app (mô tả bằng lời EN/VI).
- Lưu và chia sẻ: `POST /feeds` (cần JWT). Feed public hiện ở tab Community, người khác fork được.

## 2. Dùng `rank()` trong app của bạn

`@socialonchain/feed-sdk` là thư viện thuần (không I/O), chạy được trên server lẫn trình duyệt:

```ts
import { rank, MODERATION_STACKS } from "@socialonchain/feed-sdk";

const { candidates, posts, now } = await fetch(`${API}/candidates?viewer=${me}`).then((r) => r.json());
const result = rank(mySpec, candidates, { now, moderation: [MODERATION_STACKS["mod:safety"]], limit: 50 });
// result.items: [{ id, score, reasons: [{ origin, specName, ruleIndex, action, weight, text: { en, vi } }] }]
```

Mỗi `reason` trỏ về đúng 1 rule, nên UI "vì sao bài này ở đây" luôn trung thực.

## 3. Client mới (fork `apps/web`)

Mọi thứ mang thương hiệu nằm trong `apps/web/configs/*.ts`:

| Field | Ý nghĩa |
|---|---|
| `appName`, `tagline`, `theme.accent` | Tên, khẩu hiệu EN/VI, màu chủ đạo (logo + favicon lấy màu này) |
| `defaultFeeds` | Tab feed mặc định cho người mới |
| `defaultModeration` | Moderation stack mặc định |
| `enabledSources` | Nguồn bài: chỉ onchain, hay cả Farcaster |
| `plans`, `freeLimits` | Freemium của **client** (protocol không thu phí) |

Ví dụ có sẵn: `configs/b.ts` ("Snowfield": chỉ onchain, chặn shill + bait mặc định). Chạy:

```bash
NEXT_PUBLIC_CLIENT_CONFIG=b pnpm --filter @socialonchain/web dev
```

Client mới dùng chung identity + graph + bài với mọi client khác (cùng contract), nhưng có blocklist, quota, thanh toán riêng.

## 4. Indexer / labeler riêng

- **Indexer:** `apps/indexer` dựng lại toàn bộ state từ event (`pnpm indexer:replay`), không cần tin ai. REST API có OpenAPI ở `GET /openapi.json`.
- **Labeler:** bất kỳ ai cũng chạy labeler riêng, ký batch bằng key của mình, rồi `POST /labels` tới indexer chấp nhận key đó (`TRUSTED_LABELERS`). Định dạng batch + chữ ký: `packages/protocol/src/labels.ts` (`canonicalBatch`, `signLabelBatch`, `verifyLabelBatch`).
- **Đọc nhãn của người khác:** `GET /labels?since=<unix>` trả batch gốc + chữ ký theo thứ tự thời gian (trang sau: `cursor=<next>`). Tự verify bằng `verifyLabelBatch`, không cần tin indexer.
- **Snapshot:** `pnpm snapshot:export` xuất graph + bài onchain ra JSON, để bootstrap client mới không cần replay.

## Interface công khai (ổn định)

| Interface | Ở đâu | Đổi thế nào |
|---|---|---|
| ABI + schema event | `packages/protocol/src/abis.ts`, `docs/ARCHITECTURE.md` §6 | Không sửa; deploy version mới chạy song song |
| FeedSpec v1 | `packages/feed-sdk/src/spec.ts`, `GET /feedspec.schema.json` | Thêm field optional; đổi nghĩa thì lên `v: 2` |
| Tập nhãn v1 | `packages/feed-sdk/src/labels.ts` | Chỉ thêm, không đổi nghĩa |
| REST API | `GET /openapi.json` | Thêm endpoint/field; không xoá field |

Địa chỉ contract theo chainId: `packages/protocol/deployments/<chainId>.json`.
