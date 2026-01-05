
# 🚀 Social Trading Engine Launcher
# Starts the COMPLETE ecosystem (Masters + Followers).

Write-Host "🚀 Starting Hydra Social Trading Ecosystem..." -ForegroundColor Cyan

# 1. Start Master Manager (Orchestrator) 📡
# This manages the Broadcasters that LISTEN to Master Terminals.
Write-Host "   - Launching Master Signal Manager..." -ForegroundColor Green
# We launch a new PowerShell instance with -NoExit so the window stays open if it crashes
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& .\.venv\Scripts\python.exe src/engine/orchestrator.py"

# 2. Start HFT Follower Swarm (Executor) ⚡
# This manages the 20-Terminal Swarm that EXECUTES trades for 100+ Followers.
# We explicitly point it to terminal 002
Write-Host "   - Launching HFT Follower Swarm (Terminal 002)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& .\.venv\Scripts\python.exe src/engine/executor.py --mode TURBO --mt5-path 'C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe'"

Write-Host "✅ Ecosystem Live!" -ForegroundColor Yellow
Write-Host "   [Window 1] Master Manager (Broadcasters)"
Write-Host "   [Window 2] HFT Swarm (Followers)"
Write-Host "   (Windows will now stay open for debugging)"
