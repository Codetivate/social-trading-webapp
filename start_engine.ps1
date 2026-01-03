
# 🚀 Social Trading Engine Launcher
# Starts both the Master Broadcaster and Follower Executor in parallel.

Write-Host "🚀 Starting Social Trading Engine..." -ForegroundColor Cyan

# 1. Start Orchestrator (The Cloud Manager) ☁️
# This will automatically spawn broadcsters/executors based on DB state.
Write-Host "   - Launching Hydra Orchestrator..." -ForegroundColor Green
Start-Process ".\.venv\Scripts\python.exe" -ArgumentList "src/engine/orchestrator.py" -NoNewWindow:($false)

Write-Host "✅ Orchestrator Started!" -ForegroundColor Yellow
Write-Host "   (It will manage all worker processes dynamically)"
