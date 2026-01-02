
Write-Host "🚀 Starting Social Trading Engine..." -ForegroundColor Cyan

# 1. Start Broadcaster (Master)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& C:/Users/nesnk/AppData/Local/Programs/Python/Python311/python.exe c:/Users/nesnk/Desktop/social-trading-webapp/my-copy-app/src/engine/broadcaster.py"
Write-Host "✅ Broadcaster Launched" -ForegroundColor Green

# 2. Start Executor (Follower)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& C:/Users/nesnk/AppData/Local/Programs/Python/Python311/python.exe c:/Users/nesnk/Desktop/social-trading-webapp/my-copy-app/src/engine/executor.py"
Write-Host "✅ Executor Launched" -ForegroundColor Green

Write-Host "⚠️  Please ensure 'Algo Trading' is ENABLED in your MT5 Toolbar!" -ForegroundColor Yellow
