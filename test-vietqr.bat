@echo off
chcp 65001 >nul
echo ========================================================
echo   BAT DAU KIEM THU HE THONG THANH TOAN VIETQR (F-JOB)
echo ========================================================
echo.
echo Kich ban:
echo 1. Tao giao dich moi va sinh QR code
echo 2. Kiem tra tinh Idempotent cua API Create
echo 3. Poll API lay trang thai PENDING
echo 4. Gia lap Webhook loi (Thieu tien)
echo 5. Gia lap Webhook thanh cong
echo 6. Kiem tra so du duoc cap nhat (ACID Transaction)
echo.

npx ts-node -r tsconfig-paths/register scripts/test-vietqr-payment.ts

echo.
echo ========================================================
echo   KIEM THU HOAN TAT
echo ========================================================
pause
