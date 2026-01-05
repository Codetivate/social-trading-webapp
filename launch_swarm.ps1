# 🚀 HYDRA SWARM LAUNCHER
# Starts Multiple Executors for "Fast Lane" + "Mass Market" Scaling

Write-Host "Starting Hydra Swarm..." -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. VIP TURBO LANE (Dedicated Terminal)
# ---------------------------------------------------------
# This terminal ONLY handles "PAID" users.
Write-Host "[TURBO] Starting VIP Lane on Terminal 1..." -ForegroundColor Green
Start-Process python -ArgumentList "src/engine/executor.py --mode TURBO --mt5-path 'C:\Users\nesnk\Desktop\MetaTrader 5\terminal64.exe'" -NoNewWindow
# Note: You should point --mt5-path to a SPECIFIC terminal folder (e.g. C:\MT5_VIP\terminal64.exe)

Start-Sleep -Seconds 5

# ---------------------------------------------------------
# 2. STANDARD LANES (Free Tier Sharding)
# ---------------------------------------------------------
# These terminals handle the 10,000 Free Users distributed by ID.

# Lane 1 (Handles User IDs ending in 0, 1, 2)
Write-Host "[BATCH] Starting Standard Lane 1 (Shards 0-2)..." -ForegroundColor Yellow
Start-Process python -ArgumentList "src/engine/executor.py --mode BATCH --batch-id 0 --mt5-path 'C:\Users\nesnk\Desktop\MT5_1\terminal64.exe'" -NoNewWindow
Start-Process python -ArgumentList "src/engine/executor.py --mode BATCH --batch-id 1 --mt5-path 'C:\Users\nesnk\Desktop\MT5_1\terminal64.exe'" -NoNewWindow
Start-Process python -ArgumentList "src/engine/executor.py --mode BATCH --batch-id 2 --mt5-path 'C:\Users\nesnk\Desktop\MT5_1\terminal64.exe'" -NoNewWindow
# Note: In reality, you cannot run 3 scripts on 1 terminal path effectively unless locked. 
# Ideally, you run: --batch-id 0 on Terminal 2, --batch-id 1 on Terminal 3...

# ---------------------------------------------------------
# 3. Example of correct Multi-Terminal Pathing
# ---------------------------------------------------------
# Write-Host "[BATCH] Lane 2 (Shards 3-4)..."
# Start-Process python "src/engine/executor.py --mode BATCH --batch-id 3 --mt5-path 'C:\MT5_2\terminal64.exe'"

Write-Host "✅ Swarm Deployed. Check logs for activity." -ForegroundColor White
