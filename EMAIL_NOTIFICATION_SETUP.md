# 📧 Hướng dẫn cấu hình Email Notification cho Job Postings

## Tổng quan

Hệ thống đã được cấu hình để **tự động gửi email thông báo đến admin.fjob@gmail.com** mỗi khi có bài đăng tuyển dụng mới được tạo bởi nhà tuyển dụng.

## Tính năng

- ✅ Tự động gửi email khi employer tạo job mới qua endpoint `POST /employers/jobs`
- ✅ Email được gửi đến: **admin.fjob@gmail.com**
- ✅ Email template đẹp với đầy đủ thông tin job
- ✅ Không ảnh hưởng đến flow tạo job (email được gửi async)

## Cấu trúc đã tạo

### 1. Email Module
- **File**: `src/email/email.module.ts`
- **Mô tả**: Module quản lý việc gửi email sử dụng `@nestjs-modules/mailer`

### 2. Email Service
- **File**: `src/email/email.service.ts`
- **Methods**:
  - `sendNewJobNotificationToAdmin()`: Gửi email thông báo job mới đến admin
  - `generateNewJobEmailTemplate()`: Tạo HTML template đẹp cho email

### 3. Tích hợp vào Jobs Module
- **File**: `src/jobs/employer-jobs.service.ts`
- **Thay đổi**: Thêm logic gửi email trong method `create()`

### 4. Template Email

Email template bao gồm:
- 🎨 Design đẹp với gradient header
- 📋 Thông tin đầy đủ: Title, Company, Location, Salary, Job Type, Industry
- 📧 Email của employer
- 🕐 Thời gian tạo
- 📝 Mô tả công việc (300 ký tự đầu)
- 🔗 Link xem chi tiết job
- 🆔 Job ID

## Cấu hình SMTP

### Bước 1: Tạo App Password cho Gmail

**LƯU Ý QUAN TRỌNG**: Gmail không cho phép sử dụng mật khẩu thông thường để gửi email qua SMTP. Bạn cần tạo **App Password**.

#### Hướng dẫn tạo App Password:

1. Đăng nhập vào Gmail account: **khoafac@gmail.com**

2. Truy cập: https://myaccount.google.com/security

3. Bật **2-Step Verification** (nếu chưa bật):
   - Click "2-Step Verification"
   - Làm theo hướng dẫn để thiết lập

4. Tạo App Password:
   - Quay lại https://myaccount.google.com/security
   - Tìm "App passwords" (Mật khẩu ứng dụng)
   - Click vào "App passwords"
   - Chọn app: "Mail"
   - Chọn device: "Other" và nhập "F-Job Backend"
   - Click "Generate"
   - **Copy mật khẩu 16 ký tự** (dạng: xxxx xxxx xxxx xxxx)

### Bước 2: Cập nhật file .env

Mở file `.env` và cập nhật phần Email:

\`\`\`env
# ─── Email Configuration ──────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=khoafac@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # <-- Thay bằng App Password vừa tạo (giữ nguyên dấu cách hoặc xóa hết dấu cách)
SMTP_FROM="F-Job Notification <khoafac@gmail.com>"
SMTP_REPLY_TO=admin.fjob@gmail.com
\`\`\`

### Bước 3: Khởi động lại server

\`\`\`bash
cd /Users/mac/Documents/FPTU/EXE/be-f-job
npm run start:dev
\`\`\`

## Kiểm tra hoạt động

### Test 1: Tạo job mới qua API

\`\`\`bash
curl -X POST http://localhost:4300/employers/jobs \\
  -H "Authorization: Bearer YOUR_EMPLOYER_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Nhân viên phục vụ part-time",
    "description": "Cần tuyển nhân viên phục vụ part-time tại quán cafe",
    "location": "Hồ Chí Minh",
    "district": "Quận 1",
    "salaryAmount": 30000,
    "jobType": "Part-time",
    "industry": "F&B"
  }'
\`\`\`

### Test 2: Kiểm tra logs

Sau khi tạo job thành công, kiểm tra logs server:

- ✅ Thành công: `✅ Email thông báo job mới đã được gửi đến admin.fjob@gmail.com - Job ID: xxx`
- ❌ Lỗi: `❌ Lỗi khi gửi email thông báo job mới đến admin: [error details]`

### Test 3: Kiểm tra inbox

Đăng nhập vào **admin.fjob@gmail.com** và kiểm tra:
- Email có subject: `🆕 Bài đăng tuyển dụng mới: [Job Title] - [Company Name]`
- Email có đầy đủ thông tin job
- Link "Xem chi tiết bài đăng" hoạt động

## Troubleshooting

### Lỗi: "Invalid login: 535-5.7.8 Username and Password not accepted"

**Nguyên nhân**: Đang sử dụng mật khẩu thông thường thay vì App Password

**Giải pháp**: Làm theo Bước 1 để tạo App Password

### Lỗi: "Connection timeout"

**Nguyên nhân**: Firewall hoặc network blocking port 587

**Giải pháp**:
1. Kiểm tra firewall
2. Thử đổi port sang 465 và set `secure: true` trong `email.module.ts`

### Email không gửi nhưng không có lỗi

**Nguyên nhân**: Email service không throw error để không ảnh hưởng job creation

**Giải pháp**:
1. Kiểm tra logs để xem lỗi chi tiết
2. Test SMTP credentials bằng tool khác (như Postman, Mailtrap)

### Lỗi: "Less secure app access"

**Nguyên nhân**: Gmail block app không an toàn

**Giải pháp**: Phải sử dụng App Password (không có cách khác)

## Tùy chỉnh

### Thay đổi email admin nhận thông báo

Mở file `src/email/email.service.ts` và sửa:

\`\`\`typescript
private readonly adminEmail = 'admin.fjob@gmail.com'; // Đổi email ở đây
\`\`\`

### Tùy chỉnh template email

Chỉnh sửa method `generateNewJobEmailTemplate()` trong file `src/email/email.service.ts`

### Gửi email cho nhiều admin

\`\`\`typescript
// Trong email.service.ts
private readonly adminEmails = [
  'admin.fjob@gmail.com',
  'admin2@example.com',
  'admin3@example.com',
];

// Trong sendNewJobNotificationToAdmin()
await this.mailerService.sendMail({
  to: this.adminEmails.join(','), // Multiple recipients
  // ...
});
\`\`\`

## Môi trường Production

Khi deploy lên production, cần:

1. **Sử dụng email service chuyên nghiệp**:
   - SendGrid (https://sendgrid.com/)
   - AWS SES (https://aws.amazon.com/ses/)
   - Mailgun (https://www.mailgun.com/)

2. **Cập nhật .env.production**:
\`\`\`env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
SMTP_FROM="F-Job <noreply@fjob.vn>"
\`\`\`

3. **Cấu hình domain email**:
   - Setup SPF, DKIM, DMARC records
   - Verify domain với email provider

## Mở rộng thêm

Các email notification khác có thể thêm:

1. **Email xác nhận job đã được duyệt** (gửi cho employer)
2. **Email từ chối job** (gửi cho employer kèm lý do)
3. **Email nhắc nhở job sắp hết hạn** (gửi cho employer)
4. **Email tổng hợp applications mới** (gửi cho employer hàng ngày)
5. **Email welcome** khi employer mới đăng ký

## Support

Nếu gặp vấn đề, liên hệ:
- Email: khoafac@gmail.com
- Document: [Link to this file]

---

**Tạo bởi**: Kiro AI Assistant
**Ngày tạo**: ${new Date().toLocaleDateString('vi-VN')}
**Version**: 1.0.0
