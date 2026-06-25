# F-Job Backend API Specification theo Phase

> API list cập nhật theo `EXE_F-Job_Introduction.md`.
> Trọng tâm: **job sự kiện thời vụ**, **sinh viên Đà Nẵng**, **AI/rule-based matching theo lịch + vị trí**, **Double Trust**, **Trust Score**.
>
> Base URL hiện tại trong code: `/api` (`app.setGlobalPrefix('api')` trong `src/main.ts`).
> Base URL khuyến nghị versioning: `/api/v1`
> Swagger UI: `/api-docs` (chỉ bật khi `NODE_ENV !== production`).

## Legend

| Ký hiệu | Ý nghĩa |
|---|---|
| `[DONE]` | Đã có trong codebase hiện tại |
| `[PARTIAL]` | Đã có một phần / triển khai dưới path khác với thiết kế |
| `[TODO]` | Chưa có, cần xây dựng |
| `P1` | MVP pilot Đà Nẵng |
| `P2` | Growth |
| `P3` | Scale |

---

## Tổng quan theo Phase

| Phase | Mục tiêu | Module chính |
|---|---|---|
| P1 MVP | Có marketplace cơ bản cho job sự kiện ở Đà Nẵng | Auth, profile, xác thực, lịch rảnh, job theo ca, apply, match cơ bản, rating, trust score, admin duyệt |
| P2 Growth | Tăng hiệu quả vận hành & doanh thu B2B | Chat realtime, payment, package employer, credit, commission, notification nâng cao |
| P3 Scale | Mở rộng nền tảng & tối ưu bằng AI | AI matching nâng cao, referral, payout, fraud/risk, analytics nâng cao |

---

## 0. Trạng thái triển khai thực tế (Implementation Snapshot)

> Cập nhật từ codebase NestJS `be-f-job` (rà soát toàn bộ controller + WebSocket gateway).
> **Base URL thực tế:** `/api`. Tất cả endpoint dưới đây có tiền tố `/api`.
>
> Module đang đăng ký trong `src/app.module.ts`:
> `Users, Auth, Health, Candidates, Employers, Jobs, Applications, Profiles, Search, Notifications, Referrals, Payouts, Chat, Packages, Audit, Reviews, Verification, Reports, Interviews, Email`.
>
> Đây là danh sách endpoint **đang thực sự tồn tại trong code**. Nhiều path khác với thiết kế đề xuất ở các mục bên dưới.

### Auth — `src/auth/auth.controller.ts` (prefix `/auth`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| POST | `/auth/signup` | Đăng ký tài khoản chung | Public (alias `register`) |
| POST | `/auth/register` | Đăng ký tài khoản chung | Public |
| POST | `/auth/register/candidate` | Đăng ký ứng viên | Public |
| POST | `/auth/register/employer` | Đăng ký nhà tuyển dụng | Public |
| POST | `/auth/login` | Đăng nhập email/password | Public |
| POST | `/auth/oauth/google` | Đăng nhập/đăng ký Google | Public |
| POST | `/auth/oauth/facebook` | Đăng nhập/đăng ký Facebook | Public |
| POST | `/auth/refresh` | Refresh access token | `RefreshTokenGuard` |
| POST | `/auth/logout` | Đăng xuất, vô hiệu refresh token | `JwtAuthGuard` |
| POST | `/auth/forgot-password` | Yêu cầu token reset password | Public |
| POST | `/auth/reset-password` | Đặt lại mật khẩu — **token nằm trong body** (`{ email, token, newPassword }`) | Public |
| GET | `/auth/me` | Lấy user hiện tại | `JwtAuthGuard` |

### Users — `src/users/users.controller.ts` (prefix `/users`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/users` | Danh sách user phân trang | ADMIN |
| GET | `/users/:id` | Chi tiết user | JWT |
| PATCH | `/users/:id` | Cập nhật user | JWT |
| DELETE | `/users/:id` | Xóa user | ADMIN |

### Candidate Management — `src/candidates/candidates.controller.ts` (prefix `/users/candidates`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/users/candidates` | Danh sách ứng viên phân trang (filter `keyword`) | ADMIN |
| GET | `/users/candidates/:id` | Chi tiết hồ sơ ứng viên | ADMIN |
| PUT | `/users/candidates/:id` | Cập nhật hồ sơ ứng viên | CANDIDATE (self) / ADMIN |
| PUT | `/users/candidates/:id/status` | Bật/tắt open-to-work | CANDIDATE (self) / ADMIN |
| PUT | `/users/candidates/:id/block` | Khóa ứng viên | ADMIN |
| PUT | `/users/candidates/:id/unblock` | Mở khóa ứng viên | ADMIN |
| DELETE | `/users/candidates/:id` | Xóa tài khoản + profile (transaction) | ADMIN |

### Employers — `src/employers/employer.controller.ts` (prefix `/employers`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/employers` | Danh sách employer | Public (chưa có guard) |
| GET | `/employers/id/:id` | Chi tiết employer (lưu ý path là `/id/:id`) | Public (chưa có guard) |
| PUT | `/employers/:id` | Cập nhật employer | `AuthGuard('jwt')` |
| PUT | `/employers/:id/verify` | Xác thực employer | `AuthGuard('jwt')` |
| PUT | `/employers/:id/reject` | Từ chối xác thực kèm lý do | `AuthGuard('jwt')` |
| PUT | `/employers/:id/block` | Khóa employer kèm lý do | `AuthGuard('jwt')` |
| DELETE | `/employers/:id` | Xóa employer | `AuthGuard('jwt')` |

### Employer — Tìm & Mở khóa ứng viên — `src/employers/employer.candidates.controller.ts` (prefix `/employers`, `AuthGuard('jwt')`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/employers/candidates` | Tìm kiếm ứng viên (query filter) | JWT |
| GET | `/employers/candidates/:id` | Chi tiết 1 ứng viên | JWT |
| GET | `/employers/candidates/:id/download-cv` | Tải CV ứng viên | JWT |
| POST | `/employers/candidates/:id/unlock` | Mở khóa hồ sơ ứng viên (trừ credit) | JWT |
| GET | `/employers/ats/:applicationId` | Xem ATS theo đơn ứng tuyển | JWT |

### Employer — Công cụ & Yêu thích — `src/employers/employer.tools.controller.ts` (prefix `/employers`, `AuthGuard('jwt')`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| POST | `/employers/emails/bulk-reject` | Gửi email từ chối hàng loạt | JWT |
| POST | `/employers/emails/bulk-interview` | Gửi email mời phỏng vấn hàng loạt | JWT |
| GET | `/employers/favorites` | Danh sách ứng viên yêu thích | JWT |
| POST | `/employers/favorites/:candidateId` | Thêm ứng viên vào yêu thích | JWT |
| DELETE | `/employers/favorites/:candidateId` | Bỏ ứng viên khỏi yêu thích | JWT |

### Employer Credits — `src/packages/controllers/employer-credit.controller.ts` (prefix `/employers`, JWT + RolesGuard, EMPLOYER)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/employers/credit-balance` | Số dư credit của employer | EMPLOYER |
| POST | `/employers/credit/transactions` | Lịch sử giao dịch credit (phân trang qua body) | EMPLOYER |

### Candidate Profile / CV — `src/profiles/profiles.controller.ts` (prefix `/profiles`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/profiles/my` | Lấy profile ứng viên hiện tại | CANDIDATE |
| PUT | `/profiles/my` | Cập nhật thông tin tóm tắt profile | CANDIDATE |
| POST | `/profiles/experience` | Thêm kinh nghiệm làm việc | CANDIDATE |
| PUT | `/profiles/experience/:id` | Sửa kinh nghiệm | CANDIDATE |
| DELETE | `/profiles/experience/:id` | Xóa kinh nghiệm | CANDIDATE |
| POST | `/profiles/education` | Thêm học vấn | CANDIDATE |
| PUT | `/profiles/education/:id` | Sửa học vấn | CANDIDATE |
| DELETE | `/profiles/education/:id` | Xóa học vấn | CANDIDATE |
| POST | `/profiles/skills` | Thêm/cập nhật kỹ năng + mức thành thạo | CANDIDATE |
| DELETE | `/profiles/skills/:skillId` | Xóa kỹ năng | CANDIDATE |
| GET | `/profiles/files` | Danh sách CV file đã upload | CANDIDATE |
| POST | `/profiles/files` | Upload CV (PDF/DOC/DOCX, max 5MB, tối đa 3) | CANDIDATE |
| DELETE | `/profiles/files/:id` | Xóa CV file | CANDIDATE |
| PUT | `/profiles/files/:id/primary` | Đặt CV chính | CANDIDATE |
| GET | `/profiles/files/:id/download` | Tải/stream CV file | CANDIDATE / EMPLOYER / ADMIN |
| PUT | `/profiles/avatar` | Upload/cập nhật avatar (JPG/PNG/WEBP, max 2MB) | CANDIDATE |
| GET | `/profiles/avatar/:filename` | Xem ảnh avatar | Public |
| PUT | `/profiles/status` | Bật/tắt open-to-work | CANDIDATE |
| GET | `/profiles/preview/:candidateId` | Xem preview profile ứng viên | EMPLOYER / ADMIN |

### Public Jobs — `src/jobs/jobs.controller.ts` (prefix `/jobs`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/jobs` | Danh sách job ACTIVE + filter/pagination | Public |
| GET | `/jobs/urgent` | Job gấp (top 20, pinned ưu tiên) | Public |
| GET | `/jobs/recommended` | Job gợi ý theo profile JWT (top 10) | CANDIDATE |
| GET | `/jobs/stats/industry` | Thống kê số job theo ngành | Public/Admin |
| GET | `/jobs/:id` | Chi tiết job + tăng viewCount | Public |
| GET | `/jobs/:id/applications` | Đơn ứng tuyển của chính candidate cho job | CANDIDATE |

> Filter `/jobs` thực tế: `keyword, location, district, salary_min, salary_max, level, job_type, industry, is_urgent, sort=newest|salary_high|salary_low, page, limit`.

### Search & Metadata — `src/search/*`

`SearchController` (prefix `/search`):

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/search/jobs` | Tìm job nâng cao + pagination | Public |
| GET | `/search/candidates` | Tìm ứng viên theo skill/location/bio | EMPLOYER / ADMIN |
| GET | `/search/suggestions` | Gợi ý từ khóa autocomplete (top 10) | Public |

`metadata.controller.ts` (master data in-memory, public):

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/industries` | Danh sách ngành |
| GET | `/industries/:id/jobs` | Job ACTIVE theo ngành (pagination) |
| GET | `/industries/:id` | Chi tiết ngành |
| GET | `/locations/provinces` | Danh sách tỉnh/thành |
| GET | `/locations/:provinceId/districts` | Quận/huyện theo tỉnh |
| GET | `/skills` | Danh mục kỹ năng |
| GET | `/levels` | Danh mục mức kinh nghiệm |
| GET | `/job-types` | Danh mục loại hình job |

### Applications — `src/applications/applications.controller.ts` (prefix `/applications`, JWT + RolesGuard, CANDIDATE)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/applications` | Ứng tuyển job (online/pdf/quick) |
| GET | `/applications/my` | Lịch sử ứng tuyển của tôi |
| GET | `/applications/:jobId/check` | Kiểm tra đã ứng tuyển chưa |
| GET | `/applications/:id/status` | Trạng thái nhanh của đơn |
| GET | `/applications/:id` | Chi tiết đơn ứng tuyển |
| DELETE | `/applications/:id` | Rút đơn (chỉ khi status = Applied) |

### Notifications — `src/notifications/notifications.controller.ts` (prefix `/notifications`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/notifications/unread-count` | Số thông báo chưa đọc |
| GET | `/notifications` | Danh sách thông báo phân trang |
| PUT | `/notifications/read-all` | Đánh dấu tất cả đã đọc |
| PUT | `/notifications/settings` | Cập nhật cài đặt kênh (email/in-app) |
| PUT | `/notifications/:id/read` | Đánh dấu 1 thông báo đã đọc |
| DELETE | `/notifications/:id` | Xóa mềm thông báo |

### Chat & Messaging — `src/chat/conversations.controller.ts` (prefix `/conversations`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/conversations/unread-count` | Tổng tin nhắn chưa đọc |
| GET | `/conversations` | Danh sách hội thoại |
| POST | `/conversations` | Tạo hội thoại (CANDIDATE ↔ EMPLOYER, idempotent) |
| GET | `/conversations/:id` | Chi tiết 1 hội thoại |
| GET | `/conversations/:id/messages` | Tin nhắn (pagination) |
| POST | `/conversations/:id/messages` | Gửi tin nhắn (HTTP fallback) |
| PUT | `/conversations/:id/messages/:messageId/read` | Đánh dấu tin nhắn đã đọc |
| DELETE | `/conversations/:id` | Ẩn (soft-delete) hội thoại |

> **WebSocket realtime:** `ChatGateway` (`src/chat/chat.gateway.ts`) — Socket.io namespace `/chat`, auth qua JWT khi connect. Event vào: `sendMessage`. Event ra: `newMessage`, `exception`.

### Referrals — `src/referrals/referrals.controller.ts` (prefix `/referrals`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/referrals/apply` | Áp dụng mã giới thiệu | CANDIDATE |
| GET | `/referrals/my` | Mã giới thiệu + invite URL + tổng kết |
| GET | `/referrals/history` | Lịch sử giới thiệu (pagination) |
| GET | `/referrals/balance` | Số dư ví thưởng giới thiệu |

### Payouts — `src/payouts/payouts.controller.ts` (prefix `/payouts`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/payouts/request` | Tạo yêu cầu rút tiền (min 50.000đ) |
| GET | `/payouts/my` | Danh sách payout của tôi |
| GET | `/payouts/my/settings` | Lấy cài đặt tài khoản ngân hàng |
| PUT | `/payouts/my/settings` | Tạo/cập nhật tài khoản ngân hàng |
| GET | `/payouts/my/settings/validate` | Kiểm tra điều kiện rút tiền |
| PATCH | `/payouts/dev/simulate/:id` | **DEV ONLY** — giả lập chuyển trạng thái payout |
| GET | `/payouts/my/:id` | Chi tiết payout |

### Employer Jobs & ATS — `src/jobs/employer-jobs.controller.ts` (prefix `/employers/jobs`, `AuthGuard('jwt')`)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/employers/jobs` | Tạo job (status mặc định `pending`) |
| GET | `/employers/jobs` | Danh sách job của employer (filter `status`) |
| GET | `/employers/jobs/:id` | Chi tiết job |
| PUT | `/employers/jobs/:id` | Sửa job |
| DELETE | `/employers/jobs/:id` | Xóa (soft-delete) job |
| POST | `/employers/jobs/:id/refresh` | Đẩy tin lên đầu (trừ credit) |
| POST | `/employers/jobs/:id/duplicate` | Nhân bản tin |
| PUT | `/employers/jobs/:id/close` | Đóng job |
| PUT | `/employers/jobs/:id/extend` | Gia hạn job |
| GET | `/employers/jobs/:id/applications` | Danh sách ứng viên của job |
| PUT | `/employers/jobs/ats/:applicationId/stage` | Cập nhật stage ATS của đơn |
| POST | `/employers/jobs/ats/:applicationId/schedule` | Lên lịch phỏng vấn cho đơn |
| POST | `/employers/jobs/ats/:applicationId/reject` | Từ chối ứng viên kèm lý do |
| POST | `/employers/jobs/ats/:applicationId/accept` | Nhận ứng viên |

### Employer Applications — `src/applications/employer-applications.controller.ts` (prefix `/employers/applications`, JWT + RolesGuard + BlockedUserGuard, EMPLOYER)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| PUT | `/employers/applications/:id/complete` | Xác nhận ứng viên hoàn thành ca (`Accepted` → `Completed`) |
| PUT | `/employers/applications/:id/no-show` | Báo ứng viên bỏ ca (`Accepted` → `NoShow`, trừ trust score) |

### Interviews — `src/interviews/interviews.controller.ts` (prefix `/employers/interviews`, `AuthGuard('jwt')`)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/employers/interviews` | Danh sách lịch phỏng vấn của employer |
| POST | `/employers/interviews/:id/remind` | Gửi nhắc lịch phỏng vấn |
| PUT | `/employers/interviews/:id` | Cập nhật lịch phỏng vấn |
| DELETE | `/employers/interviews/:id` | Hủy lịch phỏng vấn |

### Identity Verification — `src/verification/verification.controller.ts` (prefix `/verification`, `JwtAuthGuard`)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/verification/verify` | Xác thực danh tính từ dữ liệu CCCD/CMND (không lưu ảnh) |
| GET | `/verification/status` | Trạng thái xác thực của user hiện tại |
| DELETE | `/verification/remove` | Gỡ xác thực (testing / user request) |

### Public Verification — `src/verification/public-verification.controller.ts` (prefix `/verification/public`, Public)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/verification/public/verify-with-email` | Xác thực danh tính bằng email ngay sau đăng ký (chưa cần đăng nhập) |

### Admin Verification — `src/verification/admin-verification.controller.ts` (prefix `/admin/verifications`, JWT + RolesGuard + BlockedUserGuard, ADMIN)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/admin/verifications` | Hàng đợi xác thực `PENDING_REVIEW` (phân trang) |
| GET | `/admin/verifications/:userId` | Xem tài liệu xác thực của ứng viên (admin hoặc chủ sở hữu) |
| PATCH | `/admin/verifications/:userId/approve` | Duyệt xác thực (`PENDING_REVIEW` → `VERIFIED`) |
| PATCH | `/admin/verifications/:userId/reject` | Từ chối xác thực kèm lý do (→ `REJECTED`) |

### Reviews & Trust — `src/reviews/reviews.controller.ts` (JWT + RolesGuard + BlockedUserGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/reviews` | Đánh giá sau khi đơn `Completed` | CANDIDATE / EMPLOYER |
| GET | `/reviews` | Danh sách review hiển thị của 1 reviewee (query `revieweeId`) | Mọi user đã đăng nhập |
| GET | `/profiles/:userId/trust` | Trust aggregates + verified badge của user | Mọi user đã đăng nhập |

### Admin Reviews — `src/reviews/admin-reviews.controller.ts` (prefix `/admin/reviews`, JWT + RolesGuard + BlockedUserGuard, ADMIN)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/admin/reviews` | Hàng đợi review để kiểm duyệt (gồm cả review bị ẩn) |
| PATCH | `/admin/reviews/:id/hide` | Ẩn review kèm lý do |
| PATCH | `/admin/reviews/:id/restore` | Khôi phục review đã ẩn |

### Reports — `src/reports/reports.controller.ts` (prefix `/reports`, JWT + RolesGuard + BlockedUserGuard + IdentityVerificationGuard)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| POST | `/reports` | Báo cáo job ảo/scam hoặc user vi phạm (yêu cầu đã xác thực danh tính) |

### Admin Reports — `src/reports/admin-reports.controller.ts` (prefix `/admin/reports`, JWT + RolesGuard + BlockedUserGuard, ADMIN)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/admin/reports` | Hàng đợi report (filter `status`/`targetType`, phân trang) |
| PATCH | `/admin/reports/:id/review` | Nhận xử lý report (`OPEN` → `UNDER_REVIEW`) |
| PATCH | `/admin/reports/:id/resolve` | Xử lý report + khóa target (→ `RESOLVED`) |
| PATCH | `/admin/reports/:id/dismiss` | Hủy report kèm lý do (→ `DISMISSED`) |

### Packages — `src/packages/controllers/packages.controller.ts` (prefix `/packages`)

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/packages` | Danh sách gói đang active | Public |
| GET | `/packages/my` | Gói employer đang dùng | EMPLOYER |
| GET | `/packages/history` | Lịch sử hóa đơn mua gói | EMPLOYER |
| POST | `/packages/purchase` | Mua gói credit | EMPLOYER |
| GET | `/packages/:id` | Chi tiết gói | Public |

### Admin Packages — `src/packages/controllers/packages-admin.controller.ts` (prefix `/packages`, JWT + RolesGuard, ADMIN)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/packages/admin` | Danh sách tất cả gói (active + inactive) |
| GET | `/packages/credits/admin` | Ledger credit toàn hệ thống (phân trang) |
| POST | `/packages/admin` | Tạo gói mới |
| PUT | `/packages/admin/:id` | Sửa gói |
| DELETE | `/packages/admin/:id` | Soft-delete / vô hiệu hóa gói |

### Admin Audit Logs — `src/audit/audit.controller.ts` (prefix `/admin/audit-logs`, JWT + RolesGuard + BlockedUserGuard, ADMIN)

| Method | Endpoint thực tế | Mô tả |
|---|---|---|
| GET | `/admin/audit-logs` | Đọc audit trail (filter `actorId`/`action`/`targetId`, phân trang, mới nhất trước) |

### Health — `src/health/health.controller.ts`

| Method | Endpoint thực tế | Mô tả | Guard / Role |
|---|---|---|---|
| GET | `/health` | Health check (status, uptime, env) | Public |

> **Lưu ý monitoring:** Hạ tầng metrics tồn tại (`MetricsService`, cấu hình Prometheus/Grafana/AlertManager trong `data/`), nhưng **chưa có controller NestJS** expose các route `/monitoring/*`. Endpoint duy nhất hiện có cho ops là `GET /api/health`.

---

## 1. Auth & Account

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/auth/signup` | Đăng ký tài khoản chung hiện tại | P1 | `[DONE]` |
| POST | `/auth/register` | Đăng ký tài khoản chung (alias signup) | P1 | `[DONE]` |
| POST | `/auth/login` | Đăng nhập email/password | P1 | `[DONE]` |
| POST | `/auth/refresh` | Refresh token | P1 | `[DONE]` |
| POST | `/auth/logout` | Đăng xuất | P1 | `[DONE]` |
| GET | `/auth/verify-email/:token` | Xác thực email | P1 | `[TODO]` |
| POST | `/auth/send-email-verification` | Gửi lại email xác thực | P1 | `[TODO]` |
| POST | `/auth/forgot-password` | Quên mật khẩu | P1 | `[DONE]` |
| POST | `/auth/reset-password` | Đặt lại mật khẩu (token trong body, không phải `:token`) | P1 | `[DONE]` |
| POST | `/auth/register/candidate` | Đăng ký ứng viên, tạo `candidate_profile` | P1 | `[DONE]` |
| POST | `/auth/register/employer` | Đăng ký nhà tuyển dụng, tạo `employer_profile` | P1 | `[DONE]` |
| POST | `/auth/oauth/google` | Đăng nhập/đăng ký Google | P1 | `[DONE]` |
| POST | `/auth/oauth/facebook` | Đăng nhập/đăng ký Facebook | P2 | `[DONE]` |
| GET | `/auth/me` | Lấy user hiện tại + role/profile | P1 | `[DONE]` |

---

## 2. Candidate Profile & Availability

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/profiles/my` | Lấy profile ứng viên hiện tại | P1 | `[DONE]` |
| PUT | `/profiles/my` | Cập nhật hồ sơ chuẩn hóa: summary, bio | P1 | `[DONE]` |
| PUT | `/profiles/status` | Bật/tắt chế độ tìm việc (open-to-work) | P1 | `[DONE]` |
| POST | `/profiles/experience` | Thêm kinh nghiệm làm việc | P1 | `[DONE]` |
| PUT | `/profiles/experience/:id` | Sửa kinh nghiệm | P1 | `[DONE]` |
| DELETE | `/profiles/experience/:id` | Xóa kinh nghiệm | P1 | `[DONE]` |
| POST | `/profiles/education` | Thêm học vấn | P1 | `[DONE]` |
| PUT | `/profiles/education/:id` | Sửa học vấn | P1 | `[DONE]` |
| DELETE | `/profiles/education/:id` | Xóa học vấn | P1 | `[DONE]` |
| POST | `/profiles/skills` | Thêm/cập nhật kỹ năng + mức thành thạo | P1 | `[DONE]` |
| DELETE | `/profiles/skills/:skillId` | Xóa kỹ năng | P1 | `[DONE]` |
| GET | `/profiles/files` | Danh sách CV file | P2 | `[DONE]` |
| POST | `/profiles/files` | Upload CV file | P2 | `[DONE]` |
| PUT | `/profiles/files/:id/primary` | Đặt CV chính | P2 | `[DONE]` |
| DELETE | `/profiles/files/:id` | Xóa CV file | P2 | `[DONE]` |
| GET | `/profiles/files/:id/download` | Tải/stream CV file | P2 | `[DONE]` |
| PUT | `/profiles/avatar` | Upload/cập nhật avatar | P2 | `[DONE]` |
| GET | `/profiles/avatar/:filename` | Xem ảnh avatar (public) | P2 | `[DONE]` |
| GET | `/profiles/preview/:candidateId` | Employer/Admin xem preview profile | P1 | `[DONE]` |
| GET | `/candidates/me/trust-score` | Xem điểm uy tín + lịch sử thay đổi điểm | P1 | `[TODO]` |
| GET | `/candidates/me/work-history` | Lịch sử job đã làm + rating | P1 | `[TODO]` |
| POST | `/candidates/me/availability` | Tạo lịch rảnh theo ngày/ca | P1 | `[TODO]` |
| GET | `/candidates/me/availability` | Danh sách lịch rảnh | P1 | `[TODO]` |
| PUT | `/candidates/me/availability/:id` | Cập nhật lịch rảnh | P1 | `[TODO]` |
| DELETE | `/candidates/me/availability/:id` | Xóa lịch rảnh | P1 | `[TODO]` |

> **Ghi chú triển khai:** Module `Profiles` đã triển khai đầy đủ CRUD profile/experience/education/skills/CV/avatar dưới prefix `/profiles` (self qua JWT), thay cho thiết kế `/candidates/me/*`. Ngoài ra `PUT /users/candidates/:id` và `PUT /users/candidates/:id/status` vẫn dùng cho luồng Admin hoặc candidate sửa theo id. **Chưa có** module `availability` (lịch rảnh theo ca), `trust-score`, và `work-history`.

---

## 3. Employer Profile & Verification

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/employers/me/profile` | Lấy profile doanh nghiệp | P1 | `[TODO]` |
| PUT | `/employers/me/profile` | Cập nhật thông tin agency/CLB/event organizer | P1 | `[TODO]` |
| POST | `/employers/me/verification` | Upload GPKD/tax code/địa điểm kinh doanh thật | P1 | `[TODO]` |
| GET | `/employers/me/verification` | Xem trạng thái xác thực doanh nghiệp | P1 | `[TODO]` |
| GET | `/employers/me/dashboard` | Dashboard tuyển dụng: job active, applicants, urgent jobs | P1 | `[TODO]` |
| GET | `/employers/me/trust-score` | Điểm uy tín employer | P2 | `[TODO]` |

> **Ghi chú triển khai:** Đã có CRUD employer dạng admin/by-id (không phải `me`): `GET /employers`, `GET /employers/:id`, `PUT /employers/:id`, `PUT /employers/:id/verify`, `PUT /employers/:id/reject`, `PUT /employers/:id/block`, `DELETE /employers/:id`. Chưa có route self `/employers/me/*` và dashboard. Xem mục 0.

---

## 4. Candidate Verification / Double Trust

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/verification/verify` | Ứng viên/user xác thực danh tính từ dữ liệu CCCD/CMND | P1 | `[DONE]` |
| POST | `/verification/public/verify-with-email` | Xác thực ngay sau đăng ký (public, chưa cần login) | P1 | `[DONE]` |
| GET | `/verification/status` | Trạng thái xác thực của user hiện tại | P1 | `[DONE]` |
| DELETE | `/verification/remove` | Gỡ xác thực (testing / theo yêu cầu user) | P1 | `[DONE]` |
| GET | `/admin/verifications` | Hàng đợi xác thực chờ duyệt (ADMIN) | P1 | `[DONE]` |
| GET | `/admin/verifications/:userId` | Tài liệu xác thực của ứng viên (ADMIN/owner) | P1 | `[DONE]` |
| PATCH | `/admin/verifications/:userId/approve` | Duyệt xác thực (`PENDING_REVIEW` → `VERIFIED`) | P1 | `[DONE]` |
| PATCH | `/admin/verifications/:userId/reject` | Từ chối xác thực kèm lý do | P1 | `[DONE]` |

> **Ghi chú triển khai:** Module `Verification` đã triển khai đầy đủ (xác thực danh tính qua dữ liệu CCCD/CMND, không lưu ảnh — chỉ lưu thông tin tối thiểu đã mã hóa). Có `IdentityVerificationGuard` chặn các hành động nhạy cảm (apply job, report) khi chưa xác thực. Luồng duyệt xác thực **employer** vẫn nằm ở `PUT /employers/:id/verify` & `/reject` (mục 0). Thiết kế cũ `/verifications/*` được hiện thực dưới prefix `/verification` (số ít) và `/admin/verifications`.

---

## 5. Event Job & Shift Management

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/employers/jobs` | Tạo job sự kiện mới (status mặc định `pending`) | P1 | `[DONE]` |
| GET | `/employers/jobs` | Danh sách job của employer (filter `status`, phân trang) | P1 | `[DONE]` |
| GET | `/employers/jobs/:id` | Chi tiết job của employer | P1 | `[DONE]` |
| PUT | `/employers/jobs/:id` | Sửa job | P1 | `[DONE]` |
| DELETE | `/employers/jobs/:id` | Xóa job (soft-delete → `closed`) | P1 | `[DONE]` |
| POST | `/employers/jobs/:id/refresh` | Đẩy tin lên đầu (cập nhật updatedAt) | P2 | `[DONE]` |
| POST | `/employers/jobs/:id/duplicate` | Nhân bản tin (bản sao `pending`) | P2 | `[DONE]` |
| PUT | `/employers/jobs/:id/close` | Đóng job | P1 | `[DONE]` |
| PUT | `/employers/jobs/:id/extend` | Gia hạn job thêm 7 ngày | P1 | `[DONE]` |
| GET | `/employers/jobs/:id/applications` | Danh sách ứng viên của job | P1 | `[DONE]` |
| PUT | `/employers/jobs/:id/submit` | Gửi job để admin duyệt | P1 | `[TODO]` |
| PUT | `/employers/jobs/ats/:applicationId/stage` | Cập nhật stage ATS của đơn ứng tuyển | P1 | `[DONE]` |
| POST | `/employers/jobs/ats/:applicationId/schedule` | Lên lịch phỏng vấn cho đơn | P1 | `[DONE]` |
| POST | `/employers/jobs/ats/:applicationId/accept` | Nhận ứng viên (ATS) | P1 | `[DONE]` |
| POST | `/employers/jobs/ats/:applicationId/reject` | Từ chối ứng viên kèm lý do (ATS) | P1 | `[DONE]` |
| POST | `/employers/jobs/:id/shifts` | Thêm ca làm cho job | P1 | `[TODO]` |
| PUT | `/employers/jobs/:id/shifts/:shiftId` | Sửa ca làm | P1 | `[TODO]` |
| DELETE | `/employers/jobs/:id/shifts/:shiftId` | Xóa ca làm | P1 | `[TODO]` |
| PUT | `/employers/jobs/:id/feature` | Mua/đặt ưu tiên hiển thị | P2 | `[TODO]` |

> **Ghi chú triển khai:** Module `EmployerJobsController/Service` (`src/jobs/employer-jobs.*`) prefix `/employers/jobs`, guard `AuthGuard('jwt')`. Tạo tin nhận: `title, description, location, district?, salaryType, salaryAmount, level, jobType, industry, workingTimeText, slots?, expiresAt?, benefits?`. Tin mới ở status `pending`, **không** lên public cho tới khi admin duyệt (xem mục 13). **Đã bổ sung** luồng ATS theo đơn ứng tuyển dưới `/employers/jobs/ats/:applicationId/*` (stage/schedule/accept/reject). Vẫn **chưa có** quản lý `shift` riêng và route `submit` (tin tạo ra đã ở `pending` luôn).

### Public Job APIs

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/jobs` | Danh sách job sự kiện công khai + filter | P1 | `[DONE]` |
| GET | `/jobs/:id` | Chi tiết job (tăng viewCount) | P1 | `[DONE]` |
| GET | `/jobs/urgent` | Job gấp | P1 | `[DONE]` |
| GET | `/jobs/recommended` | Job gợi ý cho candidate | P1 | `[PARTIAL]` |
| GET | `/jobs/stats/industry` | Thống kê số job theo ngành | P1 | `[DONE]` |
| GET | `/jobs/:id/applications` | Đơn ứng tuyển của candidate cho job | P1 | `[DONE]` |
| GET | `/search/jobs` | Tìm job nâng cao (keyword/company/province/district/...) | P1 | `[DONE]` |
| GET | `/search/suggestions` | Autocomplete từ khóa tìm kiếm | P1 | `[DONE]` |
| GET | `/industries`, `/industries/:id`, `/industries/:id/jobs` | Danh mục ngành + job theo ngành | P1 | `[DONE]` |
| GET | `/locations/provinces`, `/locations/:provinceId/districts` | Master data tỉnh/quận | P1 | `[DONE]` |
| GET | `/skills`, `/levels`, `/job-types` | Master data lọc job | P1 | `[DONE]` |

**Query params P1 cho `/jobs` (thiết kế đề xuất):**
- `keyword`, `province_id` / `district_id`, `category_id`, `shift_date`, `start_time`, `end_time`, `salary_min`, `salary_max`, `is_urgent`, `sort=nearest|newest|salary_high|urgent`, `page`, `limit`

> **Ghi chú triển khai:**
> - Query params `/jobs` thực tế: `keyword, location, district, salary_min, salary_max, level, job_type, industry, is_urgent, sort=newest|salary_high|salary_low, page, limit`.
> - `/jobs/recommended` lấy context từ JWT payload (industry/benefits/location), chưa dùng lịch rảnh/kỹ năng thực sự → `[PARTIAL]`.
> - Danh mục role sự kiện được phục vụ qua module `Search/Metadata` (`/industries`, `/skills`, `/levels`, `/job-types`) thay cho `/jobs/categories`.

---

## 6. Matching

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/matching/jobs-for-me` | Candidate xem job phù hợp lịch rảnh/kỹ năng/vị trí | P1 | `[TODO]` |
| GET | `/matching/candidates-for-job/:jobId` | Employer xem ứng viên phù hợp job | P1 | `[TODO]` |
| POST | `/matching/jobs/:jobId/recalculate` | Recalculate match score | P2 | `[TODO]` |
| GET | `/matching/explain/:recommendationId` | Giải thích vì sao match | P2 | `[TODO]` |
| POST | `/matching/ai/jobs/:jobId` | AI matching nâng cao | P3 | `[TODO]` |

> **Ghi chú triển khai:** Chưa có module `matching` riêng. Tạm thời có thể dùng `/jobs/recommended` (candidate, rule-based theo JWT, `[PARTIAL]`) và `/search/candidates` (employer tìm ứng viên theo skill/location/bio) như giải pháp thay thế gần đúng.

---

## 7. Application & Work Completion

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/applications` | Ứng tuyển job/ca | P1 | `[DONE]` |
| GET | `/applications/my` | Candidate xem lịch sử ứng tuyển | P1 | `[DONE]` |
| GET | `/applications/:id` | Chi tiết đơn ứng tuyển | P1 | `[DONE]` |
| DELETE | `/applications/:id` | Rút đơn trước khi được nhận | P1 | `[DONE]` |
| GET | `/applications/:jobId/check` | Kiểm tra đã ứng tuyển job chưa | P1 | `[DONE]` |
| GET | `/applications/:id/status` | Trạng thái nhanh của đơn ứng tuyển | P1 | `[DONE]` |
| GET | `/employers/jobs/:id/applications` | Employer xem applicants của job | P1 | `[DONE]` |
| PUT | `/employers/applications/:id/view` | Đánh dấu đã xem | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/shortlist` | Đưa vào shortlist | P1 | `[TODO]` |
| POST | `/employers/jobs/ats/:applicationId/accept` | Nhận ứng viên cho ca (ATS) | P1 | `[DONE]` |
| POST | `/employers/jobs/ats/:applicationId/reject` | Từ chối ứng viên (ATS) | P1 | `[DONE]` |
| PUT | `/employers/jobs/ats/:applicationId/stage` | Chuyển stage ATS của đơn | P1 | `[DONE]` |
| PUT | `/employers/applications/:id/complete` | Xác nhận ứng viên hoàn thành job | P1 | `[DONE]` |
| PUT | `/employers/applications/:id/no-show` | Báo ứng viên bỏ ca | P1 | `[DONE]` |

> **Ghi chú triển khai:** `GET /applications/me` trong thiết kế = `GET /applications/my` trong code. Luồng employer-side accept/reject/stage được hiện thực qua ATS (`/employers/jobs/ats/:applicationId/*`); complete/no-show qua `EmployerApplicationsController` (`/employers/applications/:id/*`). `view` và `shortlist` chưa có route riêng. Xem mục 0.

---

## 8. Rating, Review & Trust Score

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/reviews` | Đánh giá sau job (đơn ở trạng thái `Completed`) | P1 | `[DONE]` |
| GET | `/reviews?revieweeId=` | Lịch sử đánh giá hiển thị của 1 user (candidate/employer) | P1 | `[DONE]` |
| GET | `/profiles/:userId/trust` | Trust aggregates + verified badge của user | P1 | `[DONE]` |
| GET | `/admin/reviews` | Hàng đợi review kiểm duyệt (gồm review ẩn) | P1 | `[DONE]` |
| PATCH | `/admin/reviews/:id/hide` | Ẩn review kèm lý do | P1 | `[DONE]` |
| PATCH | `/admin/reviews/:id/restore` | Khôi phục review đã ẩn | P1 | `[DONE]` |
| POST | `/trust-score/admin/adjust` | Admin điều chỉnh trust score thủ công | P1 | `[TODO]` |

> **Ghi chú triển khai:** Module `Reviews` đã triển khai review hai chiều (candidate ↔ employer) sau khi đơn `Completed`, kèm tính toán **trust aggregates** (`trustScore`, `averageRating`, `reviewCount`, `provisional`, `verified`) và kiểm duyệt admin (hide/restore). Thiết kế cũ tách riêng `/reviews/candidates/:id`, `/reviews/employers/:id`, `/trust-score/*` được gộp về `GET /reviews?revieweeId=` và `GET /profiles/:userId/trust`. Trust score cũng tự động bị trừ khi employer báo `no-show` (mục 7). Chưa có route admin điều chỉnh điểm thủ công.

---

## 9. Chat & Notification

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/notifications` | Danh sách thông báo | P1 | `[DONE]` |
| GET | `/notifications/unread-count` | Số thông báo chưa đọc | P1 | `[DONE]` |
| PUT | `/notifications/:id/read` | Đánh dấu đã đọc | P1 | `[DONE]` |
| PUT | `/notifications/read-all` | Đánh dấu tất cả đã đọc | P1 | `[DONE]` |
| PUT | `/notifications/settings` | Cập nhật cài đặt kênh thông báo | P1 | `[DONE]` |
| DELETE | `/notifications/:id` | Xóa mềm thông báo | P1 | `[DONE]` |
| GET | `/conversations` | Danh sách hội thoại | P2 | `[DONE]` |
| GET | `/conversations/unread-count` | Tổng tin nhắn chưa đọc | P2 | `[DONE]` |
| POST | `/conversations` | Tạo hội thoại (CANDIDATE ↔ EMPLOYER) | P2 | `[DONE]` |
| GET | `/conversations/:id` | Chi tiết hội thoại | P2 | `[DONE]` |
| GET | `/conversations/:id/messages` | Tin nhắn | P2 | `[DONE]` |
| POST | `/conversations/:id/messages` | Gửi tin nhắn (HTTP fallback) | P2 | `[DONE]` |
| PUT | `/conversations/:id/messages/:messageId/read` | Đánh dấu đã đọc | P2 | `[DONE]` |
| DELETE | `/conversations/:id` | Ẩn hội thoại | P2 | `[DONE]` |
| WS | `/chat` (Socket.io) | Realtime: event `sendMessage` → `newMessage` | P2 | `[DONE]` |

> **Ghi chú triển khai:** Module `Notifications` và `Chat` đã triển khai đầy đủ (REST + WebSocket gateway namespace `/chat`). Chat realtime vốn xếp P2 nhưng đã có sẵn trong code.

---

## 10. Payment & Revenue

### Candidate Entry Fee — P1

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/payments/entry-fee` | Tạo thanh toán phí vào cửa sinh viên | P1 | `[TODO]` |
| GET | `/payments/entry-fee/me` | Trạng thái phí vào cửa | P1 | `[TODO]` |
| POST | `/payments/entry-fee/refund-check` | Kiểm tra đủ điều kiện hoàn phí sau 3 job tốt | P1 | `[TODO]` |
| POST | `/payments/entry-fee/refund` | Hoàn phí | P2 | `[TODO]` |

### Employer Revenue — P2

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/payments/methods` | Phương thức thanh toán | P2 | `[TODO]` |
| POST | `/payments/topup` | Nạp credit employer | P2 | `[TODO]` |
| POST | `/payments/webhook/vnpay` | VNPAY webhook | P2 | `[TODO]` |
| POST | `/payments/webhook/momo` | MoMo webhook | P2 | `[TODO]` |
| GET | `/payments/transactions` | Lịch sử giao dịch | P2 | `[TODO]` |
| POST | `/commissions/jobs/:jobId` | Tạo phí hoa hồng khi job hoàn thành | P2 | `[TODO]` |
| GET | `/commissions/employer/me` | Employer xem phí hoa hồng | P2 | `[TODO]` |

> **Ghi chú triển khai:** Chưa có module `payments`/`commissions`. Tuy nhiên đã có module `Payouts` (rút tiền từ ví referral) — xem mục 14.

---

## 11. Package & Credit

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/packages` | Danh sách gói đang active | P2 | `[DONE]` |
| GET | `/packages/:id` | Chi tiết gói | P2 | `[DONE]` |
| POST | `/packages/purchase` | Mua gói | P2 | `[DONE]` |
| GET | `/packages/my` | Gói employer đang dùng | P2 | `[DONE]` |
| GET | `/packages/history` | Lịch sử hóa đơn mua gói | P2 | `[DONE]` |
| GET | `/employers/credit-balance` | Số dư credit | P2 | `[DONE]` |
| POST | `/employers/credit/transactions` | Lịch sử credit (phân trang qua body) | P2 | `[DONE]` |
| GET | `/packages/admin` | [Admin] Danh sách toàn bộ gói | P2 | `[DONE]` |
| POST | `/packages/admin` | [Admin] Tạo gói | P2 | `[DONE]` |
| PUT | `/packages/admin/:id` | [Admin] Sửa gói | P2 | `[DONE]` |
| DELETE | `/packages/admin/:id` | [Admin] Soft-delete gói | P2 | `[DONE]` |
| GET | `/packages/credits/admin` | [Admin] Ledger credit toàn hệ thống | P2 | `[DONE]` |

> **Ghi chú triển khai:** Module `Packages` đã triển khai đầy đủ: gói credit cho employer (mua/lịch sử/số dư credit), CRUD gói cho admin, và ledger credit toàn hệ thống. Lưu ý balance/transactions credit nằm dưới prefix `/employers/*` (controller `EmployerCreditController`), thay cho thiết kế cũ `/employers/me/credit-*`. Các route admin gói dùng cùng prefix `/packages` (`/packages/admin`, `/packages/admin/:id`, `/packages/credits/admin`).

---

## 12. Reports & Safety

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/reports` | User báo cáo job ảo/scam/user vi phạm (yêu cầu đã xác thực) | P1 | `[DONE]` |
| GET | `/reports/me` | Báo cáo của tôi | P1 | `[TODO]` |
| GET | `/admin/reports` | Admin xem report (filter `status`/`targetType`) | P1 | `[DONE]` |
| PATCH | `/admin/reports/:id/review` | Nhận xử lý report (`OPEN` → `UNDER_REVIEW`) | P1 | `[DONE]` |
| PATCH | `/admin/reports/:id/resolve` | Xử lý report + khóa target | P1 | `[DONE]` |
| PATCH | `/admin/reports/:id/dismiss` | Hủy report sai kèm lý do | P1 | `[DONE]` |

> **Ghi chú triển khai:** Module `Reports` đã triển khai: nộp report (chặn bởi `IdentityVerificationGuard`) và toàn bộ luồng kiểm duyệt admin (review/resolve/dismiss) với máy trạng thái `OPEN → UNDER_REVIEW → RESOLVED|DISMISSED`. Thiết kế cũ dùng `PUT /admin/reports/:id/resolve|dismiss`; code dùng `PATCH`. Chưa có route `GET /reports/me` (xem report của chính mình).

---

## 13. Admin

### Dashboard & Moderation

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/admin/dashboard/stats` | Tổng quan: candidates, employers, active jobs, completed jobs | P1 | `[TODO]` |
| GET | `/admin/jobs` | Danh sách job (filter `?status`) | P1 | `[DONE]` |
| GET | `/admin/jobs/pending` | Tin chờ duyệt | P1 | `[DONE]` |
| GET | `/admin/jobs/:id` | Chi tiết job admin | P1 | `[DONE]` |
| PUT | `/admin/jobs/:id/approve` | Duyệt job (`pending` → `active`) | P1 | `[DONE]` |
| PUT | `/admin/jobs/:id/reject` | Từ chối job kèm lý do (`pending` → `draft`) | P1 | `[DONE]` |
| PUT | `/admin/jobs/:id/hide` | Ẩn job vi phạm (→ `closed`) | P1 | `[DONE]` |
| PUT | `/admin/jobs/:id/urgent` | Bật/tắt cờ "tuyển gấp" | P1 | `[DONE]` |

> **Ghi chú triển khai:** Module `AdminJobsController/Service` (`src/jobs/admin-jobs.*`) prefix `/admin/jobs`, guard `JwtAuthGuard + RolesGuard + @Roles(ADMIN)`. Workflow duyệt: `pending → approve → active` (tin lên public), `pending → reject → draft` (kèm `rejectionReason`, employer sửa & gửi lại), `any → hide → closed`. `approve/reject` chỉ áp dụng cho job đang `pending` (ngược lại trả 400).

### User & Verification

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/admin/users` | Danh sách user chung | P1 | `[PARTIAL]` |
| GET | `/admin/candidates` | Danh sách ứng viên | P1 | `[PARTIAL]` |
| GET | `/admin/employers` | Danh sách employer | P1 | `[PARTIAL]` |
| PUT | `/admin/users/:id/block` | Khóa user | P1 | `[PARTIAL]` |
| PUT | `/admin/users/:id/unblock` | Mở khóa user | P1 | `[PARTIAL]` |
| GET | `/admin/verifications` | Danh sách xác thực chờ duyệt | P1 | `[DONE]` |
| GET | `/admin/verifications/:userId` | Tài liệu xác thực của ứng viên | P1 | `[DONE]` |
| PATCH | `/admin/verifications/:userId/approve` | Duyệt xác thực | P1 | `[DONE]` |
| PATCH | `/admin/verifications/:userId/reject` | Từ chối xác thực | P1 | `[DONE]` |
| GET | `/admin/audit-logs` | Đọc audit trail (filter `actorId`/`action`/`targetId`) | P1 | `[DONE]` |

> **Ghi chú triển khai (mapping path thực tế):**
> - `GET /admin/users` → đang là `GET /users` (ADMIN only).
> - `GET /admin/candidates` → đang là `GET /users/candidates` (ADMIN only).
> - `GET /admin/employers` → đang là `GET /employers` (chưa gắn guard ADMIN).
> - Block/unblock ứng viên: `PUT /users/candidates/:id/block` và `/unblock`. Block employer: `PUT /employers/:id/block`. Chưa có route block/unblock dùng chung `/admin/users/:id/*`.
> - **Đã có** module `Verification` (`/admin/verifications/*`, dùng `PATCH` cho approve/reject) và `Audit` (`GET /admin/audit-logs`).

### Master Data

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/industries` | Danh mục ngành (đọc, in-memory master data) | P1 | `[DONE]` |
| GET | `/skills` | Danh mục kỹ năng (đọc) | P1 | `[DONE]` |
| GET | `/levels` | Danh mục mức kinh nghiệm (đọc) | P1 | `[DONE]` |
| GET | `/job-types` | Danh mục loại hình job (đọc) | P1 | `[DONE]` |
| GET | `/locations/provinces` | Danh sách tỉnh/thành | P1 | `[DONE]` |
| GET | `/locations/:provinceId/districts` | Danh sách quận/huyện | P1 | `[DONE]` |
| POST/PUT/DELETE | `/admin/event-role-categories`, `/admin/skills` | CRUD master data (ghi) | P1 | `[TODO]` |

> **Ghi chú triển khai:** Master data hiện chỉ **đọc** (in-memory trong `SearchService`), public dưới prefix `/industries`, `/skills`, `/levels`, `/job-types`, `/locations`. Chưa có CRUD ghi qua `/admin/*`.

### Finance Admin — P2/P3

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/admin/transactions` | Danh sách giao dịch | P2 | `[TODO]` |
| PUT | `/admin/transactions/:id/manual-approve` | Duyệt tay bank transfer | P2 | `[TODO]` |
| GET | `/admin/commissions` | Báo cáo hoa hồng job | P2 | `[TODO]` |
| GET | `/admin/packages` | Quản lý gói employer | P2 | `[TODO]` |
| POST | `/admin/packages` | Tạo gói | P2 | `[TODO]` |
| PUT | `/admin/packages/:id` | Sửa gói | P2 | `[TODO]` |
| DELETE | `/admin/packages/:id` | Xóa gói | P2 | `[TODO]` |
| GET | `/admin/payouts` | Danh sách payout | P3 | `[TODO]` |
| PUT | `/admin/payouts/:id/approve` | Duyệt payout | P3 | `[TODO]` |
| PUT | `/admin/payouts/:id/reject` | Từ chối payout | P3 | `[TODO]` |

> **Ghi chú triển khai:** Admin duyệt payout chưa có; tạm thời có route DEV `PATCH /payouts/dev/simulate/:id` để giả lập chuyển trạng thái payout khi test (cần gỡ/giới hạn trước production).

---

## 14. Referral & Payout — P3

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/referrals/apply` | Áp dụng mã giới thiệu | P3 | `[DONE]` |
| GET | `/referrals/my` | Thông tin referral của tôi (code + invite URL) | P3 | `[DONE]` |
| GET | `/referrals/history` | Lịch sử hoa hồng referral | P3 | `[DONE]` |
| GET | `/referrals/balance` | Số dư hoa hồng | P3 | `[DONE]` |
| POST | `/payouts/request` | Yêu cầu rút tiền | P3 | `[DONE]` |
| GET | `/payouts/my` | Danh sách payout của tôi | P3 | `[DONE]` |
| GET | `/payouts/my/:id` | Chi tiết payout | P3 | `[DONE]` |
| GET | `/payouts/my/settings` | Lấy cài đặt tài khoản ngân hàng | P3 | `[DONE]` |
| PUT | `/payouts/my/settings` | Cập nhật tài khoản ngân hàng | P3 | `[DONE]` |
| GET | `/payouts/my/settings/validate` | Kiểm tra điều kiện rút tiền | P3 | `[DONE]` |
| PATCH | `/payouts/dev/simulate/:id` | **DEV ONLY** — giả lập trạng thái payout | P3 | `[DONE]` |

> **Ghi chú triển khai:** Module `Referrals` và `Payouts` đã triển khai đầy đủ (vốn xếp P3 nhưng đã có sẵn trong code). `PUT /payouts/my/settings` thay cho thiết kế `PUT /payouts/my/settings`; chi tiết payout là `GET /payouts/my/:id`.

---

## 15. Monitoring hiện có

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/health` | Health check (status, uptime, env) | P1 | `[DONE]` |
| GET | `/monitoring/metrics` | Prometheus metrics | P1 | `[TODO]` |
| GET | `/monitoring/health` | Health check | P1 | `[TODO]` |
| GET | `/monitoring/readiness` | Readiness check | P1 | `[TODO]` |
| GET | `/monitoring/liveness` | Liveness check | P1 | `[TODO]` |
| POST | `/monitoring/alerts` | AlertManager webhook | P2 | `[TODO]` |
| GET | `/monitoring/simulate-error` | Dev only | P2 | `[TODO]` |

> **Ghi chú triển khai:** Endpoint duy nhất đang expose là `GET /api/health`. `MetricsService` và cấu hình Prometheus/Grafana/AlertManager đã có trong repo nhưng **chưa có controller** mount các route `/monitoring/*`.

---

## Tổng hợp tiến độ theo Module (code thực tế)

| Module | Prefix | Trạng thái | Ghi chú |
|---|---|---|---|
| Auth | `/auth` | `[DONE]` | Thiếu verify-email |
| Users | `/users` | `[DONE]` | CRUD admin |
| Candidates (admin) | `/users/candidates` | `[DONE]` | Quản lý ứng viên by-id |
| Profiles (self) | `/profiles` | `[DONE]` | CV, skills, experience, education, avatar |
| Employers | `/employers` | `[DONE]` | CRUD + verify/reject/block (chưa có `/me`) |
| Jobs (public) | `/jobs` | `[DONE]` | recommended `[PARTIAL]` |
| Search & Metadata | `/search`, `/industries`, `/locations`, `/skills`, `/levels`, `/job-types` | `[DONE]` | Master data read-only |
| Applications | `/applications` | `[DONE]` | Candidate-side; employer-side `[TODO]` |
| Notifications | `/notifications` | `[DONE]` | |
| Chat | `/conversations` + WS `/chat` | `[DONE]` | Realtime Socket.io |
| Referrals | `/referrals` | `[DONE]` | |
| Payouts | `/payouts` | `[DONE]` | Có route DEV |
| Health | `/health` | `[DONE]` | |
| Employer Jobs | `/employers/jobs/*` | `[DONE]` | Tạo/sửa/đóng/gia hạn job + ATS (stage/schedule/accept/reject). Chưa có `shifts` riêng |
| Employer Applications | `/employers/applications/*` | `[DONE]` | complete / no-show |
| Employer Candidates/Tools | `/employers/candidates`, `/employers/favorites`, `/employers/emails/*`, `/employers/ats` | `[DONE]` | Tìm/mở khóa ứng viên, yêu thích, email hàng loạt |
| Interviews | `/employers/interviews/*` | `[DONE]` | Quản lý lịch phỏng vấn |
| Verification (Double Trust) | `/verification/*`, `/admin/verifications/*` | `[DONE]` | Xác thực CCCD/CMND + duyệt admin |
| Reviews & Trust | `/reviews`, `/profiles/:id/trust`, `/admin/reviews/*` | `[DONE]` | Review 2 chiều + trust aggregates + kiểm duyệt |
| Reports & Safety | `/reports`, `/admin/reports/*` | `[DONE]` | Nộp report + kiểm duyệt admin |
| Packages & Credit | `/packages/*`, `/employers/credit*` | `[DONE]` | Gói credit, mua/lịch sử, CRUD admin |
| Audit | `/admin/audit-logs` | `[DONE]` | Đọc audit trail (admin) |
| Email | (internal) | `[DONE]` | Module gửi email thông báo (không expose REST riêng) |
| Matching | `/matching/*` | `[TODO]` | |
| Availability | `/candidates/me/availability` | `[TODO]` | Lịch rảnh theo ca |
| Payments & Entry Fee | `/payments/*` | `[TODO]` | |
| Admin moderation/dashboard | `/admin/*` | `[PARTIAL]` | Có jobs/verifications/reports/reviews/audit; users/candidates/employers map qua `/users`, `/employers`; thiếu `/admin/dashboard/stats` |
| Monitoring | `/monitoring/*` | `[TODO]` | Chỉ có `/health` |

---

## Tổng hợp theo Phase

| Phase | API trọng tâm | Mức ưu tiên |
|---|---|---|
| P1 MVP | Auth role-specific, candidate/employer profile, verification, availability, event jobs, shifts, application, matching basic, rating, trust score, admin moderation | Bắt buộc |
| P2 Growth | Chat, payment employer, packages, credit, commission, CV files, notifications nâng cao | Sau pilot |
| P3 Scale | AI matching nâng cao, referral, payout, analytics/fraud risk | Khi có traction |

---

## Các điểm mạnh F-Job được đảm bảo trong API

| Điểm mạnh | API hỗ trợ | Trạng thái |
|---|---|---|
| Nền tảng chuyên biệt job sự kiện | `/jobs`, `/employers/jobs`, `/industries`, `/search/jobs` | Có (thiếu `shifts` theo ca) |
| Match nhanh đúng người đúng ca | `/jobs/recommended`, `/search/candidates`, `/employers/candidates` | Một phần (thiếu `availability` + `/matching/*`) |
| Hồ sơ nhân sự chuẩn hóa | `/profiles/*`, `/profiles/preview/:candidateId` | Có |
| Giảm lừa đảo & bỏ ca | `/verification/*`, `/reports`, `/reviews` + `/profiles/:id/trust`, `no-show`, `/admin/audit-logs` | Có |
| Tối ưu cho sinh viên | `/jobs/recommended`, work-history | Một phần (thiếu entry-fee/availability) |
| Dễ scale marketplace | `/referrals`, `/payouts`, `/notifications`, `/conversations`, `/packages` | Có (thiếu `/commissions`, AI matching) |

---

## Ghi chú khác biệt so với API list cũ

1. API được đổi trọng tâm từ job portal chung sang **event gig marketplace**.
2. Module bắt buộc cho P1 còn thiếu: `availability` (lịch rảnh theo ca), `job_shift`, `event_role_category` (CRUD ghi), `matching`, `/admin/dashboard/stats`, và route `view/shortlist` của application.
3. Một số module xếp P2/P3 nhưng **đã có sẵn trong code**: `Notifications`, `Chat` realtime (P2), `Referrals`, `Payouts` (P3), `Packages` & credit (P2).
4. `Profiles` (CV/skills/experience/education/avatar) đã triển khai đầy đủ dưới `/profiles/*` thay cho thiết kế `/candidates/me/*`.
5. `Search` + `Metadata` cung cấp tìm kiếm nâng cao và master data read-only (`/industries`, `/locations`, `/skills`, `/levels`, `/job-types`).
6. **Đã bổ sung từ lần rà soát trước:** `Verification` (`/verification/*`, `/admin/verifications/*`), `Reviews & Trust` (`/reviews`, `/profiles/:id/trust`, `/admin/reviews/*`), `Reports` (`/reports`, `/admin/reports/*`), `Packages` & credit, `Interviews` (`/employers/interviews/*`), `Audit` (`/admin/audit-logs`), luồng ATS & complete/no-show cho employer, và module `Email`.
7. Vẫn **chưa có**: `payments`/entry-fee, `commissions`, `matching`, `availability`, và controller `monitoring` (chỉ có `/health`).
8. Lưu ý mapping path khác thiết kế: chi tiết employer là `GET /employers/id/:id`; xác thực dùng prefix số ít `/verification`; approve/reject xác thực & report dùng `PATCH`; credit balance/transactions nằm dưới `/employers/*`.
