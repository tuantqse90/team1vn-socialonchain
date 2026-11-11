# PROGRESS

> Sổ bàn giao giữa các session (cả người lẫn Claude). File này được import vào CLAUDE.md nên luôn nằm trong context; giữ nó **ngắn**.
> - Chỉ đánh ✅ khi đã chạy lệnh nghiệm thu và thấy pass. Code xong mà chưa chạy thì để 🟡.
> - Session log chỉ giữ ~5 entry gần nhất, cũ hơn thì xoá (git history vẫn giữ lại).
> - Sub-task chi tiết của từng phase nằm trong PLAN.md.

**Cập nhật:** 2026-11-11
**Phase hiện tại:** P0 (chưa bắt đầu, đang chờ duyệt PLAN.md)
**Repo:** có `INIT_PROMPT.md` (v6, chưa commit), `CLAUDE.md`, `PROGRESS.md`, `PLAN.md`, `docs/ARCHITECTURE.md`. Chưa có code.

## Bước tiếp theo

1. Người dùng duyệt `PLAN.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` và trả lời các câu hỏi mở bên dưới.
2. Commit spec v6 cùng các file kế hoạch.
3. P0: scaffold monorepo.

## Phase tracker

⬜ chưa làm · 🟡 đang làm / chưa verify · ✅ đã verify · ⛔ blocked · ➖ bỏ

| Phase | Việc | Trạng thái |
|---|---|---|
| P0 | Khung dự án | ⬜ |
| P1 | Contract lõi **[REVIEW]** | ⬜ |
| P2 | Indexer + API cơ bản | ⬜ |
| P3 | Walking skeleton online | ⬜ |
| P4 | Feed engine (chưa LLM) | ⬜ |
| P5 | Đọc Farcaster | ⬜ |
| P6 | Labeler LLM + eval | ⬜ |
| P7 | onchain_builder | ⬜ |
| P8 | Hoàn thiện + đóng băng **[REVIEW]** | ⬜ |
| | **Hết Giai đoạn 0** (dùng thử 1 tuần) | |
| P9 | NL Feed Builder + quota | ⬜ |
| P10 | Kiểm duyệt | ⬜ |
| P11 | Importer Farcaster, rồi mời Alpha | ⬜ |
| P12 | Thông báo + tìm kiếm | ⬜ |
| P13 | Thanh toán tUSD **[REVIEW]** | ⬜ |
| P14 | Client B + đo lường | ⬜ |

## Blockers / câu hỏi mở

- **Tên sản phẩm / npm scope:** giữ `socialonchain` (`@socialonchain/*`) không? Cần chốt trước P0.
- **Cho P3 (deploy):** đã có tài khoản Railway và Vercel chưa? Đã có ví deployer có test AVAX trên Fuji chưa?
- **Node v26.7.0 trên máy:** cần kiểm tra Ponder/Next có hỗ trợ không (làm ở P0/P2). Nếu không, ghim phiên bản Node LTS trước đó.

## Decision log

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-11-11 | Dùng `CLAUDE.md` (luật ổn định) + `PROGRESS.md` (trạng thái), không dùng `memory.md` | Tên `MEMORY.md` trùng với auto-memory của Claude Code, vốn là bộ nhớ cá nhân, không share được cho đội |
| 2026-11-11 | Chuyển từ bài thi hackathon sang **sản phẩm thật** (spec v6) | Người dùng chốt |
| 2026-11-11 | Cộng đồng đầu tiên là builder Avalanche (Team1), song ngữ EN/VI | Họ onchain-native, quen Fuji, ma sát onboarding thấp |
| 2026-11-11 | Chạy thật trên Fuji; user tự trả gas qua session key; bỏ relayer | Người dùng chốt; kiến trúc gọn hơn |
| 2026-11-11 | Đọc Farcaster (chỉ đọc) để giải bài toán cold start | Feed có nội dung ngay từ ngày đầu |
| 2026-11-11 | Freemium ở client, thanh toán bằng tUSD tự deploy | Người dùng chốt |
| 2026-11-11 | TypeScript end-to-end, 4 thứ cần deploy | Đội 1 người; `rank()` dùng chung giữa server và trình duyệt |
| 2026-11-11 | Thêm `PLAN.md` (kế hoạch) bên cạnh `PROGRESS.md` (trạng thái) | Tách kế hoạch ổn định khỏi trạng thái thay đổi hằng ngày, giữ PROGRESS.md ngắn |

## Session log (mới nhất ở trên)

### 2026-11-11 (session 2)
- Viết lại `CLAUDE.md` và `PROGRESS.md` theo INIT_PROMPT v6. Thêm `PLAN.md` và `docs/ARCHITECTURE.md`.
- Kiểm tra công cụ trên máy: Node 26.7.0, pnpm 11.20.0, Foundry 1.8.5, Docker 29.5.3, gh 2.97.0, Slither 0.11.6. Repo GitHub đã có remote `origin` (public).
- Verified: chưa có code để verify.

### 2026-11-11 (session 1)
- Tạo `CLAUDE.md` và `PROGRESS.md` từ INIT_PROMPT bản hackathon. Session 2 đã thay thế 2 file này.
