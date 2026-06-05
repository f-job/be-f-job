# ✅ Checklist: Setup Email Notification cho Job Posts

## Bước 1: Tạo App Password (Gmail) ⚠️ BẮT BUỘC

- [ ] Truy cập https://myaccount.google.com/security
- [ ] Bật **2-Step Verification** (nếu chưa có)
- [ ] Vào **App passwords**: https://myaccount.google.com/apppasswords
- [ ] Chọn app: **Mail**, device: **Other** (nhập "F-Job Backend")
- [ ] Click **Generate**
- [ ] Copy mật khẩu 16 ký tự (dạng: `xxxx xxxx xxxx xxxx`)

## Bước 2: Cập nhật file .env

- [ ] Mở file `/Users/mac/Documents/FPTU/EXE/be-f-job/.env`
- [ ] Tìm section `Email Configuration`
- [ ] Thay `SMTP_PASSWORD` bằng App Password vừa tạo:

```env
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # <-- Paste App Password vào đây
```

- [ ] Save file `.env`

## Bước 3: Restart Server

- [ ] Mở Terminal
- [ ] Chạy lệnh:

```bash
cd /Users/mac/Documents/FPTU/EXE/be-f-job
npm run start:dev
```

- [ ] Đợi server khởi động thành công
- [ ] Kiểm tra không có error trong logs

## Bước 4: Test chức năng

### Test 1: Tạo job mới qua REST Client

- [ ] Mở file `requests/jobs/test-email-notification.rest`
- [ ] Thay `YOUR_EMPLOYER_JWT_TOKEN_HERE` bằng JWT token thật của employer
- [ ] Click **Send Request** ở phần "1. Tạo job mới"
- [ ] Kiểm tra response: status `201 Created`

### Test 2: Kiểm tra Server Logs

- [ ] Xem terminal server logs
- [ ] Tìm dòng: **`✅ Email thông báo job mới đã được gửi đến admin.fjob@gmail.com - Job ID: xxx`**
- [ ] Nếu có lỗi sẽ hiện: **`❌ Lỗi khi gửi email...`** → Xem phần Troubleshooting

### Test 3: Kiểm tra Email

- [ ] Đăng nhập vào **admin.fjob@gmail.com**
- [ ] Tìm email mới với subject: **`🆕 Bài đăng tuyển dụng mới: [Job Title] - [Company Name]`**
- [ ] Kiểm tra email có design đẹp và đầy đủ thông tin
- [ ] Click button **"Xem chi tiết bài đăng"** để test link

## ✅ Hoàn thành!

Nếu tất cả các bước trên đều ✅, chức năng đã hoạt động thành công!

---

## 🐛 Troubleshooting (nếu có lỗi)

### ❌ Lỗi: "Invalid login: 535-5.7.8 Username and Password not accepted"

**Nguyên nhân**: Chưa dùng App Password hoặc App Password sai

**Giải pháp**:
- [ ] Kiểm tra lại đã tạo App Password đúng chưa
- [ ] Copy App Password chính xác (16 ký tự, có hoặc không có dấu cách đều được)
- [ ] Paste vào `.env` file chính xác
- [ ] Restart server

### ❌ Lỗi: "Connection timeout" hoặc "ETIMEDOUT"

**Nguyên nhân**: Firewall hoặc network block port 587

**Giải pháp**:
- [ ] Kiểm tra firewall/antivirus
- [ ] Thử đổi cấu hình trong `src/email/email.module.ts`:

```typescript
port: 465,  // Đổi từ 587 sang 465
secure: true,  // Đổi từ false sang true
```

- [ ] Restart server và test lại

### ❌ Không nhận được email (không có lỗi)

**Nguyên nhân**: Email service hoạt động nhưng email bị filter

**Giải pháp**:
- [ ] Kiểm tra **Spam/Junk folder** của admin.fjob@gmail.com
- [ ] Kiểm tra **All Mail** folder
- [ ] Đợi vài phút (đôi khi Gmail delay)
- [ ] Test gửi email đến email khác để xác nhận SMTP hoạt động

### ❌ Lỗi: "Error: self signed certificate in certificate chain"

**Nguyên nhân**: SSL certificate issue

**Giải pháp**:
- [ ] Thêm vào `email.module.ts`:

```typescript
transport: {
  // ...existing config
  tls: {
    rejectUnauthorized: false
  }
}
```

## 📚 Tài liệu chi tiết

Nếu vẫn gặp vấn đề, xem:
- [`EMAIL_NOTIFICATION_SETUP.md`](./EMAIL_NOTIFICATION_SETUP.md) - Hướng dẫn đầy đủ
- [`FEATURE_AUTO_EMAIL_SUMMARY.md`](./FEATURE_AUTO_EMAIL_SUMMARY.md) - Tóm tắt tính năng

## 💡 Tips

- **App Password chỉ tạo 1 lần**, nếu quên phải tạo lại
- **Không share App Password** với ai, nó như mật khẩu tài khoản
- Nếu deploy production, nên dùng **SendGrid** hoặc **AWS SES** thay vì Gmail
- Email được gửi **async**, không ảnh hưởng tốc độ tạo job

---

**Created**: 5/6/2026  
**By**: Kiro AI Assistant  
**Status**: Ready ✅
