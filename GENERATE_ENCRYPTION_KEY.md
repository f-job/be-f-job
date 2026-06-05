# How to Generate IDENTITY_ENCRYPTION_KEY

## ⚡ Quick Method (Recommended)

### Using Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Output example:**
```
79796393c50f228cadc160b0b0ad94e62259b8d6125ac96e0b7b09840940eda7
```

Copy this value to your `.env` file:
```env
IDENTITY_ENCRYPTION_KEY=79796393c50f228cadc160b0b0ad94e62259b8d6125ac96e0b7b09840940eda7
```

---

## 🔐 Alternative Methods

### Method 2: Using OpenSSL (macOS/Linux)
```bash
openssl rand -hex 32
```

### Method 3: Using Python
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Method 4: Online Generator (Less Secure)
Visit: https://www.random.org/strings/
- Generate a 64-character hexadecimal string
- **WARNING:** Only use for development, NOT production

---

## ✅ Requirements

The encryption key MUST be:
- ✅ **Exactly 64 characters** (32 bytes in hex)
- ✅ **Hexadecimal format** (0-9, a-f)
- ✅ **Random and unique**
- ✅ **Secret** (never commit to Git)

---

## 🚨 Security Best Practices

### ✅ DO:
1. ✅ Generate a unique key for each environment (dev, staging, prod)
2. ✅ Store in `.env` file (which is in `.gitignore`)
3. ✅ Use environment variables in production
4. ✅ Keep key secret and secure
5. ✅ Backup key in secure location (password manager)

### ❌ DON'T:
1. ❌ Use the same key across environments
2. ❌ Commit key to Git
3. ❌ Share key in Slack/Email
4. ❌ Use simple/predictable keys
5. ❌ Reuse keys from other projects

---

## 🔄 Key Rotation

If you need to change the key:

1. **Generate new key**
2. **Keep old key** temporarily
3. **Update `.env`** with new key
4. **Migrate existing data** (if needed)
5. **Remove old key** after migration

---

## ⚠️ Important Notes

### For Development:
- Use the generated key in `.env`
- Safe to regenerate if needed (no production data)

### For Production:
- **NEVER** use the development key
- Generate a new, unique key
- Store in secure secret manager (AWS Secrets, Azure Key Vault, etc.)
- Set up key rotation policy

---

## 🧪 Testing

Verify your key is working:

```bash
# Start the server
npm run start:dev

# Check logs - should NOT see warning:
# ⚠️  Using default encryption key. Set IDENTITY_ENCRYPTION_KEY in production!
```

---

## 📋 Checklist

- [x] Generated 32-byte encryption key
- [x] Added to `.env` file
- [x] Verified `.env` is in `.gitignore`
- [x] Key is 64 characters long
- [ ] Backed up key in secure location
- [ ] Different key for production (when deploying)

---

## 🆘 Troubleshooting

### "Key is too short" error:
- Ensure key is exactly 64 characters (32 bytes in hex)

### "Invalid key format" error:
- Use only hexadecimal characters (0-9, a-f)
- Remove any spaces or special characters

### Server won't start:
- Check `.env` file syntax
- Ensure no quotes around the key value
- Restart the server after changes

---

## 📚 Related Files

- `.env` - Your actual environment variables (not committed)
- `.env.example` - Template for environment variables (committed)
- `src/verification/verification.service.ts` - Uses the encryption key

---

✅ **Your key is now ready!** The identity verification system can encrypt CCCD numbers securely.
