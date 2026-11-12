# Giới hạn đã biết

Viết thẳng để người dùng và dev bên ngoài biết họ đang dựa vào cái gì. Cập nhật mỗi khi có giới hạn mới.

## Danh tính và ví

| Giới hạn | Hệ quả | Giảm thiểu hiện tại |
|---|---|---|
| Identity = `address`. Mất ví chính là mất identity | Không có recovery, không đổi được owner | Không có. Đây là lựa chọn có chủ đích của v1 (đơn giản, không admin) |
| Session key nằm trong `localStorage` của trình duyệt | Ai đọc được localStorage của máy (extension độc, XSS) là đăng bài thay được tới khi key hết hạn | Key chỉ làm được việc xã hội (post/react/follow/setProfile), không chạm tới tiền, handle, delegate. Hết hạn sau 30 ngày. Thu hồi bằng `removeDelegate` (Settings → Revoke); gas còn lại được trả về ví chính trước khi thu hồi |
| Mỗi thiết bị một session key | Đăng nhập máy mới cần 1 tx `addDelegate` | Nút "Enable this device · 1 tx" |
| Delegate không bị giới hạn số lượng | Một owner có thể cấp rất nhiều key | Chấp nhận: owner tự chịu |
| JWT sống tối đa 7 ngày (không quá hạn của session key) | Mỗi request có JWT đều kiểm tra lại delegate trong DB đã index: key bị thu hồi/hết hạn bị coi như ẩn danh ngay. JWT phát cho chính ví owner thì không thu hồi được, chỉ hết hạn | JWT chỉ mở dữ liệu offchain (thông báo, quota, feed đã lưu); mọi thao tác onchain vẫn cần chữ ký hợp lệ trên chain |

## Dữ liệu onchain

- **Không xoá được.** `deletePost` chỉ tạo tombstone: indexer và client tôn trọng nó, nhưng text vẫn nằm trong log của chain. UI nói rõ điều này ở bước onboarding ("Posts live onchain forever").
- **Không đưa thông tin cá nhân lên chain.** Profile (tên, bio, avatar) lưu offchain ở `GET /profiles/{address}`; `profileURI` onchain chỉ trỏ tới đó. Nếu API sập, client khác vẫn đọc được handle + graph + bài, nhưng mất tên hiển thị.
- **Text tối đa 1024 byte UTF-8.** Tiếng Việt có dấu tốn 2–3 byte/ký tự, nên một bài tiếng Việt dài nhất khoảng 400–500 ký tự. Composer hiển thị vòng đếm byte.
- **Reaction không lưu trạng thái onchain** (stateless): contract chỉ emit event, indexer khử trùng lặp. Client nhẹ không có indexer phải tự đếm từ log.
- **Fuji là testnet.** Không cam kết lưu vĩnh viễn. Giảm thiểu: `pnpm snapshot:export` xuất graph + bài ra JSON. Test AVAX không có giá trị nên spam rẻ; giảm thiểu bằng feed/moderation và labeler, không bằng phí.

## Feed và nhãn

- **Labeler heuristic khi chưa có `ANTHROPIC_API_KEY`.** Macro F1 trên golden set: **0.776** (politics 0.75, engagement_bait 0.67, shill 0.87, substantive 0.81). Bản LLM **chưa đo** (thiếu key). Xem `evals/labeler/README.md`.
- **Golden set nhỏ (~100 mẫu) và do chính dự án viết.** Điểm F1 chỉ để so sánh tương đối giữa các bản labeler, không phải chất lượng tuyệt đối.
- **Nhãn tác giả (`author:*`) là heuristic** (bio, tuổi tài khoản, số contract đã deploy), không qua LLM.
- **`compileFeed` heuristic** (khi không có key) chỉ hiểu các cụm EN/VI phổ biến. Phần không hiểu được trả về trong `unsupported[]`, không bịa rule.
- **Tập nhãn đóng (24 nhãn).** Muốn feed theo chủ đề ngoài tập nhãn thì chưa làm được; sẽ mở rộng qua version mới của `LABELS` (không sửa nghĩa nhãn cũ).
- **`onchain_builder` chỉ đếm contract deploy trực tiếp từ địa chỉ đó** trên C-Chain (và Fuji). Deploy qua factory/multisig hay từ ví khác không được tính. Ở local dùng fixture.
- **Candidate window 14 ngày.** Bài cũ hơn không vào feed xếp hạng (vẫn xem được ở profile và thread).

## Farcaster

- **Chỉ đọc.** Không reply/like/recast lên Farcaster được. Trả lời bài Farcaster bằng bài onchain cũng chưa hỗ trợ (composer chặn).
- Tác giả Farcaster được map về địa chỉ ETH qua verified address; ai không có verified address thì không có profile ở đây và không follow onchain được (import lưu họ vào `pending_follows`, báo khi họ tham gia).
- Phụ thuộc Neynar (có rate limit, cần key). Ở local dùng fixture.
- Embed chỉ hỗ trợ URL (ảnh + link), tối đa 4; quote-cast chưa hiển thị. Ảnh tải thẳng từ host gốc (không qua proxy), nên host đó thấy IP người xem; không gửi referrer.

## Thanh toán

- **tUSD là token test, không có giá trị.** Doanh thu chỉ là giả lập cho tới khi thay bằng USDC thật (cần quyết định riêng, chưa làm).
- `TestUSD` và `PlanPayments` **có owner** (khác contract lõi): owner đổi được giá plan và treasury. Quyền lợi Pro đọc từ event `Paid`, không cần tin backend.
- Faucet tUSD có cooldown theo địa chỉ; dễ farm bằng nhiều ví. Chấp nhận vì là token test.

## Vận hành

- Một người vận hành. Không có on-call. Indexer/worker sập thì client vẫn đọc được chain trực tiếp nhưng mất feed xếp hạng.
- Labeler chỉ có một (ký bằng `LABELER_PRIVATE_KEY`); danh sách labeler tin cậy cấu hình ở indexer (`TRUSTED_LABELERS`).
- Admin = danh sách địa chỉ trong `ADMIN_ADDRESSES`. Blocklist chỉ ẩn ở **client này**; dữ liệu onchain không đổi, client khác tự quyết.
- Chưa có Sentry thật (thiếu DSN): lỗi chỉ nằm trong log pino.

## Tin nhắn riêng

- **Không có forward secrecy.** Khoá X25519 tĩnh theo ví: ai lấy được khoá riêng (hoặc chữ ký `dmDeriveMessage`) đọc được toàn bộ tin cũ lẫn mới. Chưa có double ratchet.
- **Metadata không mã hoá:** server biết ai nhắn ai, lúc nào, độ dài xấp xỉ, ai chấp nhận/từ chối ai.
- **Khoá riêng nằm trong localStorage** (giống session key): XSS là đọc được. CSP có nonce chặn script chèn từ ngoài, nhưng lỗ hổng ngay trong bundle của app (hoặc dependency bị nhiễm) vẫn đọc được.
- **Cần ví ký tất định.** Ví ký không tất định (một số ví hợp đồng/passkey) cho ra khoá khác mỗi lần bật → thiết bị mới đổi khoá, tin mã hoá bằng khoá cũ không đọc được ở thiết bị đó.
- **Đổi khoá thì mất đọc tin cũ** trên thiết bị không còn khoá cũ (hiện "Mã hoá bằng khoá cũ").
- Không có gọi thoại/video (đã chốt bỏ), ảnh/file đính kèm, nhóm chat, chỉnh/xoá tin, đang soạn.
- Chưa có push notification: hộp thư dùng polling (4–20 giây) khi app đang mở.
- Admin **không đọc được** nội dung để kiểm duyệt; chỉ có giới hạn spam, hộp Yêu cầu và blocklist tác giả. Chưa có nút báo cáo tin nhắn.
- Emoji: chỉ đóng gói 56 Twemoji (CC-BY 4.0, credit ở Cài đặt › Giấy phép); emoji khác hiện bằng font hệ thống.
