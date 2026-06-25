# 📧 Email Notification - Quick Start

## 🎯 Chức năng
Tự động gửi email đến **admin.fjob@gmail.com** khi có job mới được tạo.

## ⚡ Quick Setup (3 bước)

### 1. Tạo App Password
```
1. Vào: https://myaccount.google.com/apppasswords
2. Bật 2-Step Verification (nếu chưa)
3. Tạo App Password cho "F-Job Backend"
4. Copy mật khẩu 16 ký tự
```

### 2. Cập nhật .env
```env
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Paste App Password vào đây
```

### 3. Restart server
```bash
npm run start:dev
```

## ✅ Test
1. Tạo job mới: `POST /employers/jobs`
2. Check logs: `✅ Email thông báo job mới...`
3. Check inbox: **admin.fjob@gmail.com**

## 📚 Tài liệu đầy đủ
- [CHECKLIST_EMAIL_SETUP.md](./CHECKLIST_EMAIL_SETUP.md) - Checklist từng bước
- [EMAIL_NOTIFICATION_SETUP.md](./EMAIL_NOTIFICATION_SETUP.md) - Hướng dẫn chi tiết
- [FEATURE_AUTO_EMAIL_SUMMARY.md](./FEATURE_AUTO_EMAIL_SUMMARY.md) - Tổng quan tính năng

## 🐛 Lỗi thường gặp?
➡️ Xem [CHECKLIST_EMAIL_SETUP.md](./CHECKLIST_EMAIL_SETUP.md) phần Troubleshooting

---
**Quick Start** | Created: 5/6/2026 | v1.0.0
