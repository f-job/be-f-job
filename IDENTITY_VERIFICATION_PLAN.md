# Identity Verification System - CCCD/CMND Verification

## Mục tiêu
- Xác thực danh tính người dùng (CANDIDATE) và doanh nghiệp (EMPLOYER)
- **KHÔNG lưu ảnh CCCD/CMND** (tuân thủ Nghị định 13/2023/NĐ-CP)
- Chỉ lưu thông tin đã được verify: Họ tên, Số CCCD, trạng thái xác thực
- Phân biệt tài khoản đã/chưa xác thực

---

## Architecture Overview

```
┌─────────────┐        ┌──────────────┐         ┌─────────────┐
│   Client    │──(1)──▶│   Backend    │──(2)───▶│   OCR API   │
│  (Upload)   │        │  (Process)   │         │  (Extract)  │
└─────────────┘        └──────────────┘         └─────────────┘
                              │
                              │ (3) Save minimal data
                              ▼
                       ┌──────────────┐
                       │   Database   │
                       │  (verified)  │
                       └──────────────┘
```

---

## Database Schema Changes

### User Schema Addition
```typescript
// Add to User schema
@Prop({ type: Object })
identityVerification?: {
  isVerified: boolean;
  verifiedAt?: Date;
  fullName?: string;        // Từ CCCD
  idNumber?: string;        // Số CCCD/CMND (encrypted)
  dateOfBirth?: Date;       // Ngày sinh
  verificationMethod: 'cccd_qr' | 'cccd_ocr' | 'manual';
  // KHÔNG LƯU: ảnh, QR raw data, địa chỉ chi tiết
};
```

---

## Implementation Steps

### Phase 1: OCR Service Integration
**Options:**
1. **Google Vision API** (Free tier: 1,000 requests/month)
2. **Tesseract.js** (Free, open-source, client-side)
3. **FPT.AI** (Paid, trial available)

**Recommended**: Start with **Tesseract.js** or **Google Vision API**

### Phase 2: Backend API

#### Endpoint: `POST /users/verify-identity`
- Upload ảnh CCCD → Process → Extract info → Save minimal data
- Return: `{ verified: true, fullName, idNumber (masked) }`

#### Endpoint: `GET /users/me/verification-status`
- Return verification status của user hiện tại

---

## Security & Privacy Compliance

### ✅ Tuân thủ Nghị định 13/2023/NĐ-CP:

1. **Consent Form**: User phải đồng ý trước khi upload
2. **Purpose Limitation**: Chỉ dùng để xác thực danh tính
3. **Data Minimization**: Chỉ lưu thông tin cần thiết
4. **No Storage**: Không lưu ảnh gốc
5. **Encryption**: Mã hóa số CCCD trước khi lưu
6. **Auto-delete**: Có thể xóa verification data khi cần

### Workflow:
```typescript
1. User clicks "Xác thực danh tính"
2. Show consent dialog với Privacy Policy
3. User uploads ảnh CCCD
4. Client/Server extract info (OCR)
5. Compare với thông tin đã nhập
6. Save verified flag + minimal info
7. DELETE ảnh ngay lập tức
8. Show "✅ Đã xác thực" badge
```

---

## API Structure

```
src/
├── verification/
│   ├── verification.module.ts
│   ├── verification.controller.ts
│   ├── verification.service.ts
│   ├── dto/
│   │   ├── verify-identity.dto.ts
│   │   └── verification-status.dto.ts
│   └── providers/
│       ├── ocr.provider.interface.ts
│       ├── google-vision.provider.ts
│       └── tesseract.provider.ts
```

---

## Environment Variables Needed

```env
# OCR Provider
OCR_PROVIDER=google_vision # or tesseract
GOOGLE_VISION_API_KEY=your_api_key

# Encryption
IDENTITY_ENCRYPTION_KEY=your_secure_key_here
```

---

## Frontend Flow

```typescript
// Frontend: Upload & Verify Component
1. Show "Xác thực CCCD" button
2. User clicks → Show consent modal
3. User accepts → Open camera/file picker
4. Upload to backend
5. Backend processes & returns result
6. Show success/error message
7. Update UI with "✅ Đã xác thực" badge
```

---

## Cost Estimation

### Free Options:
- **Tesseract.js**: Completely free (client-side)
- **Google Vision API**: 1,000 requests/month free

### Paid Options (nếu scale):
- **Google Vision**: $1.50/1,000 requests
- **FPT.AI**: Contact for pricing

---

## Next Steps

1. ✅ Choose OCR provider
2. ✅ Update User schema
3. ✅ Create verification module
4. ✅ Implement OCR service
5. ✅ Create API endpoints
6. ✅ Add frontend UI
7. ✅ Test with real CCCD images
8. ✅ Add Privacy Policy page

---

## Notes
- Chỉ áp dụng cho CANDIDATE và EMPLOYER
- ADMIN không cần verify
- Verification là **optional** nhưng có badge hiển thị
- Có thể yêu cầu verify bắt buộc cho một số tính năng (VD: ứng tuyển job lương cao)
