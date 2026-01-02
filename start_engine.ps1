
# 🚀 Social Trading Engine Launcher
# Starts both the Master Broadcaster and Follower Executor in parallel.

Write-Host "🚀 Starting Social Trading Engine..." -ForegroundColor Cyan

# 1. Start Broadcaster (Master)
# Path: C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe
$env:MT5_PATH = "C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe"
Write-Host "   - Launching Broadcaster (Master) -> $env:MT5_PATH" -ForegroundColor Green
Start-Process python -ArgumentList "src/engine/broadcaster.py" -NoNewWindow:($false) -PassThru

# Small delay to ensure env var clears or just reset it
Start-Sleep -Seconds 2

# 2. Start Executor (Follower)
# Path: C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe
$env:MT5_PATH = "C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"
Write-Host "   - Launching Executor (Follower) -> $env:MT5_PATH" -ForegroundColor Magenta
Start-Process python -ArgumentList "src/engine/executor.py" -NoNewWindow:($false)

Write-Host "✅ Engine Started! Keep these windows open." -ForegroundColor Yellow
Write-Host "   (Press Ctrl+C in those windows to stop them individualy)"
