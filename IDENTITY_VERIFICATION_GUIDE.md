# Identity Verification Implementation Guide

## ✅ Backend DONE

Backend API đã sẵn sàng cho identity verification!

### API Endpoints

#### 1. **POST /verification/verify**
Verify user identity with CCCD data

**Request:**
```json
{
  "fullName": "Nguyễn Văn A",
  "idNumber": "001234567890",
  "dateOfBirth": "1990-01-15",
  "verificationMethod": "cccd_qr",
  "consentGiven": true
}
```

**Response:**
```json
{
  "isVerified": true,
  "verifiedAt": "2025-06-05T10:30:00Z",
  "fullName": "Nguyễn Văn A",
  "idNumberMasked": "001******890",
  "dateOfBirth": "1990-01-15",
  "verificationMethod": "cccd_qr"
}
```

#### 2. **GET /verification/status**
Get current verification status

**Response:**
```json
{
  "isVerified": true,
  "verifiedAt": "2025-06-05T10:30:00Z",
  "fullName": "Nguyễn Văn A",
  "idNumberMasked": "001******890"
}
```

#### 3. **DELETE /verification/remove**
Remove verification (for testing)

---

## 📱 Frontend Implementation Options

### Option 1: QR Code Scanner (Recommended)

**Libraries:**
- `html5-qrcode`: https://github.com/mebjas/html5-qrcode
- `react-qr-scanner`: https://github.com/JodusNodus/react-qr-scanner

**QR Code Format in CCCD:**
```
001234567890|123456789012|Nguyễn Văn A|15011990|Nam|Đà Nẵng...
```

**Implementation:**
```typescript
import { Html5Qrcode } from 'html5-qrcode';

const scanQRCode = async () => {
  const html5QrCode = new Html5Qrcode("reader");
  
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      // Parse QR data
      const parts = decodedText.split('|');
      const data = {
        idNumber: parts[0],
        oldIdNumber: parts[1],
        fullName: parts[2],
        dateOfBirth: parseDateFromQR(parts[3]), // 15011990 -> 1990-01-15
        gender: parts[4],
      };
      
      // Send to backend
      verifyIdentity(data);
      
      // Stop scanner
      html5QrCode.stop();
    }
  );
};
```

### Option 2: OCR (Tesseract.js)

**Library:** `tesseract.js`

**Implementation:**
```typescript
import Tesseract from 'tesseract.js';

const scanCCCDImage = async (imageFile: File) => {
  const { data: { text } } = await Tesseract.recognize(
    imageFile,
    'vie', // Vietnamese
    {
      logger: m => console.log(m)
    }
  );
  
  // Parse text and extract info
  const extractedData = parseOCRText(text);
  
  // Send to backend
  verifyIdentity(extractedData);
};
```

### Option 3: Google Vision API (Backend Processing)

**More accurate but requires backend**

---

## 🔐 Environment Variables

Add to `.env`:

```env
# Identity Verification
IDENTITY_ENCRYPTION_KEY=your-super-secret-encryption-key-min-32-chars
```

**Generate strong key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🎨 UI Components Needed

### 1. Consent Modal
```typescript
<Modal>
  <h3>Xác thực danh tính</h3>
  <p>
    Chúng tôi cần xác thực CCCD/CMND của bạn để:
    - Tăng độ tin cậy của hồ sơ
    - Bảo vệ bạn khỏi tài khoản giả mạo
    - Đáp ứng quy định pháp luật
  </p>
  <Checkbox>
    Tôi đồng ý cho F-Job xử lý thông tin CCCD của tôi
    theo Chính sách bảo mật
  </Checkbox>
  <Button onClick={startVerification}>Bắt đầu xác thực</Button>
</Modal>
```

### 2. Scanner Component
```typescript
<VerificationScanner>
  <div id="qr-reader" style={{ width: '100%' }} />
  <p>Đưa mã QR trên CCCD vào khung hình</p>
  <Button variant="secondary">Hoặc chọn ảnh từ thư viện</Button>
</VerificationScanner>
```

### 3. Success Badge
```typescript
{user.identityVerification?.isVerified && (
  <Badge variant="success">
    <CheckCircle /> Đã xác thực danh tính
  </Badge>
)}
```

---

## 📊 Testing

### Test with Sample Data

```bash
# 1. Login
POST /auth/login
{
  "email": "test@example.com",
  "password": "password"
}

# 2. Verify
POST /verification/verify
Authorization: Bearer <token>
{
  "fullName": "Nguyễn Văn A",
  "idNumber": "001234567890",
  "dateOfBirth": "1990-01-15",
  "verificationMethod": "cccd_qr"
}

# 3. Check status
GET /verification/status
Authorization: Bearer <token>
```

---

## 🔒 Security & Privacy

### ✅ What we do:
1. ✅ Encrypt ID number before storing
2. ✅ Only store minimal verified data
3. ✅ Never store images
4. ✅ Mask ID number in responses
5. ✅ Require user consent
6. ✅ Clear privacy policy
7. ✅ Allow data deletion

### ❌ What we DON'T do:
1. ❌ Store CCCD images
2. ❌ Store QR code raw data
3. ❌ Share data with third parties
4. ❌ Use data for marketing

---

## 🚀 Next Steps

### Backend:
- [x] User schema updated
- [x] Verification module created
- [x] API endpoints implemented
- [x] Encryption implemented
- [ ] Add to .env: `IDENTITY_ENCRYPTION_KEY`

### Frontend:
- [ ] Install QR scanner library: `npm install html5-qrcode`
- [ ] Create VerificationModal component
- [ ] Create QR Scanner component
- [ ] Add consent form
- [ ] Implement API integration
- [ ] Show verification badge on profile
- [ ] Add Privacy Policy page

### Testing:
- [ ] Test QR code scanning
- [ ] Test OCR extraction
- [ ] Test API endpoints
- [ ] Test with real CCCD images
- [ ] Security audit

---

## 📚 Resources

### QR Scanner:
- html5-qrcode: https://github.com/mebjas/html5-qrcode
- Tutorial: https://blog.minhazav.dev/research/html5-qrcode

### OCR:
- Tesseract.js: https://github.com/naptha/tesseract.js
- Google Vision API: https://cloud.google.com/vision/docs/ocr

### Privacy:
- Nghị định 13/2023/NĐ-CP: https://thuvienphapluat.vn/

---

## 🎯 Demo Flow

```
User clicks "Xác thực danh tính"
    ↓
Show consent modal with Privacy Policy
    ↓
User accepts consent
    ↓
Open QR scanner / Camera
    ↓
Scan CCCD QR code
    ↓
Parse QR data (client-side)
    ↓
Send to API: POST /verification/verify
    ↓
Backend: Validate + Encrypt + Save minimal data
    ↓
Show success: "✅ Đã xác thực danh tính"
    ↓
Profile shows verification badge
```

---

## 💰 Cost

### Free Options:
- **QR Scanner**: Free (html5-qrcode)
- **OCR Client-side**: Free (Tesseract.js)
- **Backend**: Free (your server)

### If you need better accuracy:
- **Google Vision API**: $1.50/1,000 requests
- **FPT.AI**: Contact for pricing

---

## ⚠️ Important Notes

1. **No images stored**: Images are processed and immediately discarded
2. **Encryption required**: Set `IDENTITY_ENCRYPTION_KEY` in production
3. **User consent**: Always get explicit consent before verification
4. **Privacy policy**: Must have a clear privacy policy page
5. **Optional feature**: Verification is optional but recommended
6. **One-time only**: Users can only verify once (prevents abuse)

---

Ready to implement? Start with adding `IDENTITY_ENCRYPTION_KEY` to `.env`!
