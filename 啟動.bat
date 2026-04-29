@echo off
chcp 65001 >nul 2>&1
title SEO 基礎邏輯模擬器

cd /d "%~dp0"

if not exist node_modules (
    echo [INFO] 首次啟動，正在安裝依賴...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install 失敗，請確認已安裝 Node.js
        pause
        exit /b 1
    )
)

if not exist dist (
    echo [INFO] 正在建置專案...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] 建置失敗
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo   SEO 基礎邏輯模擬器 - GLM-5-Turbo
echo   http://localhost:3000
echo ============================================
echo.

start http://localhost:3000
call npx vite preview --port 3000 --host
if errorlevel 1 (
    echo.
    echo [ERROR] 伺服器啟動失敗，嘗試使用 npm run dev...
    echo.
    call npm run dev
)
pause
