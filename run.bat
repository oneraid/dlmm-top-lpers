@echo off
title DLMM Top LPers Finder
echo ========================================================
echo        Memulai DLMM Top LPers Finder (Meteora DLMM)
echo ========================================================
echo.

cd /d "%~dp0"

set PG_BIN=D:\PostgreSQL\18\bin
set PG_DATA=%~dp0data\pgdata
set PG_LOG=%~dp0data\postgres.log

if not exist "%PG_DATA%" (
    echo [INFO] Menginisialisasi database PostgreSQL lokal...
    mkdir "%~dp0data" 2>nul
    "%PG_BIN%\initdb.exe" -D "%PG_DATA%" -U postgres -A trust -E UTF8
)

echo [INFO] Memastikan service PostgreSQL lokal berjalan di port 5432...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" status >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Menjalankan server PostgreSQL lokal...
    "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -o "-p 5432" -l "%PG_LOG%" start
    timeout /t 2 /nobreak >nul
)

if not exist ".env" (
    echo [INFO] Membuat file .env...
    copy .env.example .env >nul
    copy .env packages\db\.env >nul
    copy .env workers\.env >nul
    copy .env apps\web\.env >nul
)

if not exist "node_modules" (
    echo [INFO] Menginstal dependensi NPM...
    call npm install
    call npm run db:generate
    call npm run db:migrate
    call npm run db:seed
)

echo.
echo [INFO] Menjalankan Web UI di http://localhost:3000 ...
echo [INFO] Browser akan terbuka otomatis dalam 3 detik...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

call npm run dev
pause
