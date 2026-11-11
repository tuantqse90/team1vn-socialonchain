# PROGRESS

> Sổ bàn giao giữa các session (cả người lẫn Claude). File này được import vào CLAUDE.md nên luôn nằm trong context; giữ nó **ngắn**.
> - Chỉ đánh ✅ khi đã chạy lệnh nghiệm thu và thấy pass. Code xong mà chưa chạy thì để 🟡.
> - Session log chỉ giữ ~5 entry gần nhất, cũ hơn thì xoá (git history vẫn giữ lại).

**Cập nhật:** 2026-11-11
**Phase hiện tại:** P0 (chưa bắt đầu)
**Repo:** mới có `INIT_PROMPT.md`, `CLAUDE.md`, `PROGRESS.md`. Đã `git init` (branch `main`), có `.gitignore`, chưa commit.

## Bước tiếp theo

1. Chốt tham số ở INIT_PROMPT.md §0 (tên dự án, thời gian, đội, chain). Hiện đang dùng mặc định.
2. Viết `PLAN.md` (task theo phase, ước lượng giờ, rủi ro) rồi chờ duyệt.
3. P0: scaffold monorepo.

## Phase tracker

⬜ chưa làm · 🟡 đang làm / chưa verify · ✅ đã verify · ⛔ blocked · ➖ bỏ

| Phase | Việc | Nghiệm thu | Trạng thái |
|---|---|---|---|
| P0 | Scaffold monorepo, `.env.example`, scripts | `pnpm i && pnpm dev` chạy được | ⬜ |
| P1 | Contracts + test + deploy Fuji, export ABI | `forge test` xanh, địa chỉ có trong `packages/protocol` | ⬜ |
| P2 | Indexer + REST | replay từ block deploy, API trả dữ liệu đúng | ⬜ |
| P3 | Client skeleton: ví, register, follow, post, feed chronological | bài ví A đăng hiện trong feed ví B | ⬜ |
| P4 | Delegate key + relayer | đăng bài không popup, user không tốn gas | ⬜ |
| P5 | Labeler + `rank()` + 4 feed mẫu + seed | fixtures pass, 4 feed khác nhau rõ rệt | ⬜ |
| P6 | NL Feed Builder + "Vì sao?" | gõ 4 câu trên slide thì feed đổi live | ⬜ |
| P7 | Client B (fork) + FORK.md | 2 client chạy song song trên cùng graph | ⬜ |
| | **VẠCH MVP** | | |
| P8 | Marketplace + subscribe + remote feed mẫu | ví B trả phí, tác giả nhận được tiền | ⬜ |
| P9 | Importer Farcaster | import được 1 tài khoản thật | ⬜ |
| P10 | Polish, DEMO.md, README, pitch | demo trơn tru 2 lần liên tiếp | ⬜ |

## Blockers / câu hỏi mở

- (chưa có)

## Decision log

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-11-11 | Dùng `CLAUDE.md` (luật ổn định) + `PROGRESS.md` (trạng thái), không dùng `memory.md` | Tên `MEMORY.md` trùng với auto-memory của Claude Code, vốn là bộ nhớ cá nhân, không share được cho đội |

## Session log (mới nhất ở trên)

### 2026-11-11
- Tạo `CLAUDE.md` và `PROGRESS.md` từ `INIT_PROMPT.md`.
- Verified: chưa có gì (chưa có code).
