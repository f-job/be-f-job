@echo off
chcp 65001 >nul
echo ========================================================
echo   BAT DAU KIEM THU HE THONG CREDIT/POINT (F-JOB)
echo ========================================================
echo.
echo Kich ban:
echo 1. Nap tien (Basic + Standard)
echo 2. Tru diem tu dong (FIFO) khi Refresh Job
echo 3. Tu dong don dep diem (Lazy Evaluation) khi het han
echo.

npx ts-node -r tsconfig-paths/register scripts/test-credit-api.ts

echo.
echo ========================================================
echo   KIEM THU HOAN TAT
echo ========================================================
pause
