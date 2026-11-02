@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   Bsky-Spider - Bluesky 媒体下载器
echo   ---------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 20 或更高版本。
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo 正在安装依赖，请稍候...
  call npm install --no-fund --no-audit
  if errorlevel 1 goto :error
)

if not exist dist\server\index.cjs (
  echo 正在构建应用，请稍候...
  if not exist .tmp mkdir .tmp
  set TEMP=%~dp0.tmp
  set TMP=%~dp0.tmp
  call npm run build
  if errorlevel 1 goto :error
)

set BSKY_SPIDER_OPEN=1
echo 正在启动 Bsky-Spider...
echo 关闭此窗口即可停止应用。
echo.
call npm start
goto :eof

:error
echo.
echo [错误] 启动失败，请检查上方错误信息。
echo 也可以手动运行：npm install ^&^& npm run build ^&^& npm start
pause
exit /b 1
