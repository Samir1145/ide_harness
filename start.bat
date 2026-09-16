@echo off
REM Hayagriva Sovereign IDE Launcher for Windows
echo [INFO] Starting Hayagriva Sovereign IDE for Windows...

set "ROOT_DIR=%~dp0"
set "HAYAGRIVA_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "THEIA_DIR=%ROOT_DIR%frontend\applications\electron"

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js ^>= 22.5 from https://nodejs.org
    pause
    exit /b 1
)

REM Verify Node.js has built-in node:sqlite support (Node >= 22.5 required for Level 1 Core Engine)
node -e "try { require('node:sqlite'); process.exit(0); } catch(e) { process.exit(1); }" >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js version is too old. Hayagriva Level 1 Core Engine requires Node.js ^>= 22.5 with built-in node:sqlite.
    echo Current version:
    node --version
    echo Please install Node.js 22 LTS or 24 from https://nodejs.org
    pause
    exit /b 1
)

REM Check Yarn
where yarn >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Yarn is not found in PATH. Please install Yarn via: npm install -g yarn
    pause
    exit /b 1
)

REM Clean up any dangling processes on ports 3210 and 8090
if exist "%ROOT_DIR%stop.bat" (
    call "%ROOT_DIR%stop.bat" >nul 2>nul
)

REM 1. Install backend dependencies if missing
if not exist "%HAYAGRIVA_DIR%\node_modules" (
    echo [INFO] Installing backend dependencies...
    cd /d "%HAYAGRIVA_DIR%"
    call yarn install
)

REM 2. Start backend daemon on port 3210
echo [INFO] Starting Hayagriva backend daemon on port 3210...
cd /d "%HAYAGRIVA_DIR%"
start "Hayagriva Backend" /B node cli.js --watch-all

REM 3. Install frontend monorepo dependencies if missing
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [INFO] Installing frontend monorepo dependencies...
    cd /d "%FRONTEND_DIR%"
    call yarn install
)

REM 4. Build Theia extensions & Electron bundle if lib/ is missing (fresh git clone)
if not exist "%THEIA_DIR%\lib" (
    echo [INFO] Fresh clone detected: Compiling Theia extensions and building Electron bundle...
    echo [INFO] 1/3 Compiling product extension...
    cd /d "%FRONTEND_DIR%\theia-extensions\product"
    call yarn build
    echo [INFO] 2/3 Compiling Hayagriva extension...
    cd /d "%FRONTEND_DIR%\theia-extensions\hayagriva"
    call yarn build
    echo [INFO] 3/3 Packaging Electron application...
    cd /d "%THEIA_DIR%"
    call yarn build
    echo [INFO] Frontend compilation completed successfully.
)

REM 5. Wait for backend daemon to be responsive on port 3210
echo [INFO] Verifying backend daemon on port 3210...
powershell -NoProfile -Command "for ($i=1; $i -le 15; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3210/api/hayagriva/cases' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Backend daemon verified and responsive.
) else (
    echo [WARN] Backend daemon starting up; proceeding to launch IDE...
)

REM 6. Launch Hayagriva Electron IDE
echo [INFO] Launching Hayagriva Electron IDE (Level 1 Core Engine)...
cd /d "%THEIA_DIR%"
set ELECTRON_RUN_AS_NODE=
call yarn start
