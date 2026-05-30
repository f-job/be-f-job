# F-Job Backend API Specification theo Phase

> API list cập nhật theo `EXE_F-Job_Introduction.md`.
> Trọng tâm: **job sự kiện thời vụ**, **sinh viên Đà Nẵng**, **AI/rule-based matching theo lịch + vị trí**, **Double Trust**, **Trust Score**.
>
> Base URL hiện tại trong code: `/api`
> Base URL khuyến nghị versioning: `/api/v1`

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

> Cập nhật từ codebase NestJS `be-f-job` (rà soát toàn bộ controller).
> **Base URL thực tế:** `/api` (cấu hình qua `app.setGlobalPrefix('api')` trong `src/main.ts`).
> Swagger UI: `/api-docs` (chỉ bật khi `NODE_ENV !== production`).
>
> Đây là danh sách endpoint **đang thực sự tồn tại trong code**. Nhiều path khác với thiết kế đề xuất ở các mục bên dưới (ví dụ quản lý ứng viên nằm dưới `/users/candidates/:id` thay vì `/candidates/me/...`).

### Auth — `src/auth/auth.controller.ts`

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| POST | `/auth/signup` | Đăng ký tài khoản chung | Alias của `register` |
| POST | `/auth/register` | Đăng ký tài khoản chung | Mới, chưa có trong spec cũ |
| POST | `/auth/register/candidate` | Đăng ký ứng viên | Đã triển khai |
| POST | `/auth/register/employer` | Đăng ký nhà tuyển dụng | Đã triển khai |
| POST | `/auth/login` | Đăng nhập email/password | |
| POST | `/auth/oauth/google` | Đăng nhập/đăng ký Google | Đã triển khai |
| POST | `/auth/oauth/facebook` | Đăng nhập/đăng ký Facebook | Đã triển khai |
| POST | `/auth/refresh` | Refresh access token | Dùng `RefreshTokenGuard` |
| POST | `/auth/logout` | Đăng xuất, vô hiệu refresh token | `JwtAuthGuard` |
| POST | `/auth/forgot-password` | Yêu cầu token reset password | |
| POST | `/auth/reset-password` | Đặt lại mật khẩu | **token nằm trong body** (`{ email, token, newPassword }`), không phải `:token` trên URL |
| GET | `/auth/me` | Lấy user hiện tại | `JwtAuthGuard` |

### Users — `src/users/users.controller.ts` (prefix `/users`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| GET | `/users` | Danh sách user phân trang | ADMIN |
| GET | `/users/:id` | Chi tiết user | |
| PATCH | `/users/:id` | Cập nhật user | |
| DELETE | `/users/:id` | Xóa user | ADMIN |

### Candidate Management — `src/candidates/candidates.controller.ts` (prefix `/users/candidates`, JWT + RolesGuard)

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| GET | `/users/candidates` | Danh sách ứng viên phân trang | ADMIN |
| GET | `/users/candidates/:id` | Chi tiết hồ sơ ứng viên | ADMIN |
| PUT | `/users/candidates/:id` | Cập nhật hồ sơ ứng viên | CANDIDATE (self) hoặc ADMIN |
| PUT | `/users/candidates/:id/status` | Bật/tắt open-to-work | CANDIDATE (self) hoặc ADMIN |
| PUT | `/users/candidates/:id/block` | Khóa ứng viên | ADMIN |
| PUT | `/users/candidates/:id/unblock` | Mở khóa ứng viên | ADMIN |
| DELETE | `/users/candidates/:id` | Xóa tài khoản + profile (transaction) | ADMIN |

### Employers — `src/employers/employer.controller.ts` (prefix `/employers`)

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| GET | `/employers` | Danh sách employer | Public (chưa có guard) |
| GET | `/employers/:id` | Chi tiết employer | Public (chưa có guard) |
| PUT | `/employers/:id` | Cập nhật employer | `AuthGuard('jwt')` |
| PUT | `/employers/:id/verify` | Xác thực employer | `AuthGuard('jwt')` |
| PUT | `/employers/:id/reject` | Từ chối xác thực kèm lý do | `AuthGuard('jwt')` |
| PUT | `/employers/:id/block` | Khóa employer kèm lý do | `AuthGuard('jwt')` |
| DELETE | `/employers/:id` | Xóa employer | `AuthGuard('jwt')` |

### Public Jobs — `src/jobs/jobs.controller.ts` (prefix `/jobs`)

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| GET | `/jobs` | Danh sách job active + filter/pagination | Public. Filter: `keyword, location, district, salary_min, salary_max, level, job_type, industry, is_urgent, sort, page, limit` |
| GET | `/jobs/urgent` | Job gấp (top 20) | Public |
| GET | `/jobs/recommended` | Job gợi ý theo profile JWT | CANDIDATE |
| GET | `/jobs/stats/industry` | Thống kê số job theo ngành | Public/Admin |
| GET | `/jobs/:id` | Chi tiết job + tăng viewCount | Public |
| GET | `/jobs/:id/applications` | Đơn ứng tuyển của chính candidate cho job | CANDIDATE |

### Applications — `src/applications/applications.controller.ts` (prefix `/applications`, JWT + RolesGuard CANDIDATE)

| Method | Endpoint thực tế | Mô tả | Ghi chú |
|---|---|---|---|
| POST | `/applications` | Ứng tuyển job (online/pdf/quick) | |
| GET | `/applications/my` | Lịch sử ứng tuyển của tôi | |
| GET | `/applications/:jobId/check` | Kiểm tra đã ứng tuyển chưa | |
| GET | `/applications/:id/status` | Trạng thái nhanh của đơn | |
| GET | `/applications/:id` | Chi tiết đơn ứng tuyển | |
| DELETE | `/applications/:id` | Rút đơn (chỉ khi status = Applied) | |

### Health — `src/health/health.controller.ts`

| Method | Endpoint thực tế | Mô tả | Ghi chú |
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
| GET | `/candidates/me/profile` | Lấy profile ứng viên hiện tại | P1 | `[TODO]` |
| PUT | `/candidates/me/profile` | Cập nhật hồ sơ chuẩn hóa: trường, kỹ năng, địa chỉ, bio | P1 | `[PARTIAL]` |
| PUT | `/candidates/me/open-to-work` | Bật/tắt chế độ tìm việc | P1 | `[PARTIAL]` |
| GET | `/candidates/me/trust-score` | Xem điểm uy tín + lịch sử thay đổi điểm | P1 | `[TODO]` |
| GET | `/candidates/me/work-history` | Lịch sử job đã làm + rating | P1 | `[TODO]` |
| POST | `/candidates/me/availability` | Tạo lịch rảnh theo ngày/ca | P1 | `[TODO]` |
| GET | `/candidates/me/availability` | Danh sách lịch rảnh | P1 | `[TODO]` |
| PUT | `/candidates/me/availability/:id` | Cập nhật lịch rảnh | P1 | `[TODO]` |
| DELETE | `/candidates/me/availability/:id` | Xóa lịch rảnh | P1 | `[TODO]` |
| POST | `/candidates/me/experiences` | Thêm kinh nghiệm event đã làm | P1 | `[TODO]` |
| PUT | `/candidates/me/experiences/:id` | Sửa kinh nghiệm | P1 | `[TODO]` |
| DELETE | `/candidates/me/experiences/:id` | Xóa kinh nghiệm | P1 | `[TODO]` |
| POST | `/candidates/me/skills` | Thêm kỹ năng | P1 | `[TODO]` |
| DELETE | `/candidates/me/skills/:skillId` | Xóa kỹ năng | P1 | `[TODO]` |
| POST | `/candidates/me/cv-files` | Upload CV file | P2 | `[TODO]` |
| GET | `/candidates/me/cv-files` | Danh sách CV file | P2 | `[TODO]` |
| PUT | `/candidates/me/cv-files/:id/primary` | Đặt CV chính | P2 | `[TODO]` |
| DELETE | `/candidates/me/cv-files/:id` | Xóa CV file | P2 | `[TODO]` |

> **Ghi chú triển khai:** Hiện code chưa có route `self` dạng `/candidates/me/*`. Thay vào đó, cập nhật hồ sơ và toggle open-to-work được thực hiện qua `PUT /users/candidates/:id` và `PUT /users/candidates/:id/status` (CANDIDATE chỉ sửa được chính mình, hoặc ADMIN). Xem mục 0.

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

> **Ghi chú triển khai:** Đã có CRUD employer dạng admin/by-id (không phải `me`): `GET /employers`, `GET /employers/:id`, `PUT /employers/:id`, `PUT /employers/:id/verify`, `PUT /employers/:id/reject`, `PUT /employers/:id/block`, `DELETE /employers/:id`. Xem mục 0.

---

## 4. Candidate Verification / Double Trust

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/verifications/candidate` | Ứng viên upload CCCD/thẻ sinh viên | P1 | `[TODO]` |
| GET | `/verifications/candidate/me` | Trạng thái xác thực ứng viên | P1 | `[TODO]` |
| POST | `/verifications/employer` | Employer upload GPKD/tax code | P1 | `[TODO]` |
| GET | `/verifications/employer/me` | Trạng thái xác thực employer | P1 | `[TODO]` |

> **Ghi chú triển khai:** Luồng duyệt xác thực employer hiện làm qua `PUT /employers/:id/verify` và `PUT /employers/:id/reject` (mục 0), chưa có module `verifications` riêng cũng như xác thực ứng viên (CCCD/thẻ sinh viên).

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
| POST | `/employers/jobs/:id/shifts` | Thêm ca làm cho job | P1 | `[TODO]` |
| PUT | `/employers/jobs/:id/shifts/:shiftId` | Sửa ca làm | P1 | `[TODO]` |
| DELETE | `/employers/jobs/:id/shifts/:shiftId` | Xóa ca làm | P1 | `[TODO]` |
| PUT | `/employers/jobs/:id/feature` | Mua/đặt ưu tiên hiển thị | P2 | `[TODO]` |

> **Ghi chú triển khai:** Module `EmployerJobsController/Service` (`src/jobs/employer-jobs.*`) prefix `/employers/jobs`, guard `AuthGuard('jwt')`. Tạo tin nhận: `title, description, location, district?, salaryType, salaryAmount, level, jobType, industry, workingTimeText, slots?, expiresAt?, benefits?`. Tin mới ở status `pending`, **không** lên public cho tới khi admin duyệt (xem mục 13). Chưa có quản lý `shift` riêng và route `submit` (tin tạo ra đã ở `pending` luôn).

### Public Job APIs

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/jobs` | Danh sách job sự kiện công khai | P1 | `[DONE]` |
| GET | `/jobs/:id` | Chi tiết job | P1 | `[DONE]` |
| GET | `/jobs/urgent` | Job gấp | P1 | `[DONE]` |
| GET | `/jobs/recommended` | Job gợi ý cho candidate dựa trên lịch/vị trí/kỹ năng | P1 | `[PARTIAL]` |
| GET | `/jobs/categories` | Danh mục role sự kiện | P1 | `[TODO]` |
| GET | `/jobs/stats/industry` | Thống kê số job theo ngành (đang có thay cho categories) | P1 | `[DONE]` |
| GET | `/jobs/:id/applications` | Đơn ứng tuyển của candidate cho job | P1 | `[DONE]` |

**Query params P1 cho `/jobs`:**
- `keyword`
- `province_id` / `district_id`
- `category_id`
- `shift_date`
- `start_time`
- `end_time`
- `salary_min`
- `salary_max`
- `is_urgent`
- `sort=nearest|newest|salary_high|urgent`
- `page`, `limit`

> **Ghi chú triển khai:** Query params hiện code đang nhận khác với thiết kế trên: `keyword`, `location`, `district`, `salary_min`, `salary_max`, `level`, `job_type`, `industry`, `is_urgent`, `sort=newest|salary_high|salary_low`, `page`, `limit`. `/jobs/recommended` hiện lấy context từ JWT payload (industry/benefits/location), chưa dùng lịch rảnh/kỹ năng thực sự nên đánh dấu `[PARTIAL]`.

---

## 6. Matching

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/matching/jobs-for-me` | Candidate xem job phù hợp lịch rảnh/kỹ năng/vị trí | P1 | `[TODO]` |
| GET | `/matching/candidates-for-job/:jobId` | Employer xem ứng viên phù hợp job | P1 | `[TODO]` |
| POST | `/matching/jobs/:jobId/recalculate` | Recalculate match score | P2 | `[TODO]` |
| GET | `/matching/explain/:recommendationId` | Giải thích vì sao match | P2 | `[TODO]` |
| POST | `/matching/ai/jobs/:jobId` | AI matching nâng cao | P3 | `[TODO]` |

---

## 7. Application & Work Completion

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/applications` | Ứng tuyển job/ca | P1 | `[DONE]` |
| GET | `/applications/me` | Candidate xem lịch sử ứng tuyển | P1 | `[DONE]` |
| GET | `/applications/:id` | Chi tiết đơn ứng tuyển | P1 | `[DONE]` |
| DELETE | `/applications/:id` | Rút đơn trước khi được nhận | P1 | `[DONE]` |
| GET | `/applications/:jobId/check` | Kiểm tra đã ứng tuyển job chưa | P1 | `[DONE]` |
| GET | `/applications/:id/status` | Trạng thái nhanh của đơn ứng tuyển | P1 | `[DONE]` |
| GET | `/employers/jobs/:id/applications` | Employer xem applicants của job | P1 | `[DONE]` |
| PUT | `/employers/applications/:id/view` | Đánh dấu đã xem | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/shortlist` | Đưa vào shortlist | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/accept` | Nhận ứng viên cho ca | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/reject` | Từ chối ứng viên | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/complete` | Xác nhận ứng viên hoàn thành job | P1 | `[TODO]` |
| PUT | `/employers/applications/:id/no-show` | Báo ứng viên bỏ ca | P1 | `[TODO]` |

> **Ghi chú triển khai:** `GET /applications/me` trong code là `GET /applications/my`. Toàn bộ luồng employer-side (view/shortlist/accept/reject/complete/no-show) chưa có. Xem mục 0.

---

## 8. Rating, Review & Trust Score

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/reviews` | Đánh giá sau job | P1 | `[TODO]` |
| GET | `/reviews/candidates/:candidateId` | Lịch sử đánh giá của ứng viên | P1 | `[TODO]` |
| GET | `/reviews/employers/:employerId` | Lịch sử đánh giá employer | P2 | `[TODO]` |
| GET | `/trust-score/me` | User xem trust score của mình | P1 | `[TODO]` |
| GET | `/trust-score/users/:userId/history` | Lịch sử cộng/trừ điểm uy tín | P1 | `[TODO]` |
| POST | `/trust-score/admin/adjust` | Admin điều chỉnh trust score | P1 | `[TODO]` |

---

## 9. Chat & Notification

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/notifications` | Danh sách thông báo | P1 | `[TODO]` |
| GET | `/notifications/unread-count` | Số thông báo chưa đọc | P1 | `[TODO]` |
| PUT | `/notifications/:id/read` | Đánh dấu đã đọc | P1 | `[TODO]` |
| PUT | `/notifications/read-all` | Đánh dấu tất cả đã đọc | P1 | `[TODO]` |
| GET | `/conversations` | Danh sách hội thoại | P2 | `[TODO]` |
| POST | `/conversations` | Tạo hội thoại sau khi match/accept | P2 | `[TODO]` |
| GET | `/conversations/:id/messages` | Tin nhắn | P2 | `[TODO]` |
| POST | `/conversations/:id/messages` | Gửi tin nhắn | P2 | `[TODO]` |
| PUT | `/conversations/:id/messages/:messageId/read` | Đánh dấu đã đọc | P2 | `[TODO]` |

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

---

## 11. Package & Credit

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/packages` | Danh sách gói Basic/Pro/Enterprise | P2 | `[TODO]` |
| GET | `/packages/:id` | Chi tiết gói | P2 | `[TODO]` |
| POST | `/packages/purchase` | Mua gói | P2 | `[TODO]` |
| GET | `/packages/my` | Gói employer đang dùng | P2 | `[TODO]` |
| GET | `/employers/me/credit-balance` | Số dư credit | P2 | `[TODO]` |
| GET | `/employers/me/credit-transactions` | Lịch sử credit | P2 | `[TODO]` |

---

## 12. Reports & Safety

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/reports` | User báo cáo job ảo/scam/bỏ ca/sai lương | P1 | `[TODO]` |
| GET | `/reports/me` | Báo cáo của tôi | P1 | `[TODO]` |
| GET | `/admin/reports` | Admin xem report | P1 | `[TODO]` |
| PUT | `/admin/reports/:id/resolve` | Xử lý report | P1 | `[TODO]` |
| PUT | `/admin/reports/:id/dismiss` | Hủy report sai | P1 | `[TODO]` |

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

> **Ghi chú triển khai:** Module `AdminJobsController/Service` (`src/jobs/admin-jobs.*`) prefix `/admin/jobs`, guard `JwtAuthGuard + RolesGuard + @Roles(ADMIN)`. Workflow duyệt: `pending → approve → active` (tin lên public), `pending → reject → draft` (kèm `rejectionReason`, employer sửa & gửi lại), `any → hide → closed`. `approve/reject` chỉ áp dụng cho job đang `pending` (ngược lại trả 400).

### User & Verification

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/admin/users` | Danh sách user chung | P1 | `[PARTIAL]` |
| GET | `/admin/candidates` | Danh sách ứng viên | P1 | `[PARTIAL]` |
| GET | `/admin/employers` | Danh sách employer | P1 | `[PARTIAL]` |
| PUT | `/admin/users/:id/block` | Khóa user | P1 | `[PARTIAL]` |
| PUT | `/admin/users/:id/unblock` | Mở khóa user | P1 | `[PARTIAL]` |
| GET | `/admin/verifications` | Danh sách xác thực chờ duyệt | P1 | `[TODO]` |
| PUT | `/admin/verifications/:id/approve` | Duyệt xác thực | P1 | `[TODO]` |
| PUT | `/admin/verifications/:id/reject` | Từ chối xác thực | P1 | `[TODO]` |

> **Ghi chú triển khai (mapping path thực tế):**
> - `GET /admin/users` → đang là `GET /users` (ADMIN only).
> - `GET /admin/candidates` → đang là `GET /users/candidates` (ADMIN only).
> - `GET /admin/employers` → đang là `GET /employers` (chưa gắn guard ADMIN).
> - Block/unblock ứng viên: `PUT /users/candidates/:id/block` và `/unblock`. Block employer: `PUT /employers/:id/block`. Chưa có route block/unblock dùng chung `/admin/users/:id/*`.

### Master Data

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| GET | `/admin/event-role-categories` | CRUD danh mục job sự kiện | P1 | `[TODO]` |
| POST | `/admin/event-role-categories` | Tạo danh mục role | P1 | `[TODO]` |
| PUT | `/admin/event-role-categories/:id` | Sửa danh mục role | P1 | `[TODO]` |
| DELETE | `/admin/event-role-categories/:id` | Xóa danh mục role | P1 | `[TODO]` |
| GET | `/admin/skills` | CRUD kỹ năng | P1 | `[TODO]` |
| POST | `/admin/skills` | Tạo skill | P1 | `[TODO]` |
| PUT | `/admin/skills/:id` | Sửa skill | P1 | `[TODO]` |
| DELETE | `/admin/skills/:id` | Xóa skill | P1 | `[TODO]` |
| GET | `/admin/locations/provinces` | Danh sách tỉnh/thành | P1 | `[TODO]` |
| GET | `/admin/locations/:provinceId/districts` | Danh sách quận/huyện | P1 | `[TODO]` |

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

---

## 14. Referral & Payout — P3

| Method | Endpoint | Mô tả | Phase | Status |
|---|---|---|---|---|
| POST | `/referrals/apply` | Áp dụng mã giới thiệu | P3 | `[TODO]` |
| GET | `/referrals/my` | Thông tin referral của tôi | P3 | `[TODO]` |
| GET | `/referrals/history` | Lịch sử hoa hồng referral | P3 | `[TODO]` |
| GET | `/referrals/balance` | Số dư hoa hồng | P3 | `[TODO]` |
| POST | `/payouts/request` | Yêu cầu rút tiền | P3 | `[TODO]` |
| GET | `/payouts/my` | Danh sách payout của tôi | P3 | `[TODO]` |
| GET | `/payouts/my/:id` | Chi tiết payout | P3 | `[TODO]` |
| PUT | `/payouts/my/settings` | Cập nhật tài khoản ngân hàng | P3 | `[TODO]` |

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

> **Ghi chú triển khai:** Endpoint duy nhất đang expose là `GET /api/health`. `MetricsService` và cấu hình Prometheus/Grafana/AlertManager đã có trong repo (`src/services/metrics.service.ts`, `data/`) nhưng **chưa có controller** mount các route `/monitoring/*`.

---

## Tổng hợp theo Phase

| Phase | API trọng tâm | Mức ưu tiên |
|---|---|---|
| P1 MVP | Auth role-specific, candidate/employer profile, verification, availability, event jobs, shifts, application, matching basic, rating, trust score, admin moderation | Bắt buộc |
| P2 Growth | Chat, payment employer, packages, credit, commission, CV files, notifications nâng cao | Sau pilot |
| P3 Scale | AI matching nâng cao, referral, payout, analytics/fraud risk | Khi có traction |

---

## Các điểm mạnh F-Job được đảm bảo trong API

| Điểm mạnh | API hỗ trợ |
|---|---|
| Nền tảng chuyên biệt job sự kiện | `/jobs/categories`, `/employers/jobs`, `/employers/jobs/:id/shifts` |
| Match nhanh đúng người đúng ca | `/matching/jobs-for-me`, `/matching/candidates-for-job/:jobId`, `/candidates/me/availability` |
| Hồ sơ nhân sự chuẩn hóa | `/candidates/me/profile`, `/candidates/me/experiences`, `/candidates/me/skills`, `/reviews/candidates/:id` |
| Giảm lừa đảo & bỏ ca | `/verifications/*`, `/reports`, `/trust-score/*`, `/employers/applications/:id/no-show` |
| Tối ưu cho sinh viên | `/jobs/recommended`, `/payments/entry-fee`, `/payments/entry-fee/refund-check`, `/candidates/me/work-history` |
| Dễ scale marketplace | `/packages`, `/commissions`, `/referrals`, `/payouts`, `/matching/ai/jobs/:jobId` |

---

## Ghi chú khác biệt so với API list cũ

1. API được đổi trọng tâm từ job portal chung sang **event gig marketplace**.
2. Thêm module bắt buộc cho P1: `availability`, `job_shift`, `event_role_category`, `verification`, `trust_score`, `review`, `matching`.
3. Payment/package vẫn giữ nhưng chuyển sang P2 trừ **entry fee** cho sinh viên có thể nằm ở P1.
4. Referral/payout chuyển P3 vì chưa cần cho pilot Đà Nẵng.
5. Chat realtime chuyển P2; P1 có thể dùng notification/email trước để giảm scope MVP.
