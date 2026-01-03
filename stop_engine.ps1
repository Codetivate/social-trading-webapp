# 🛑 Social Trading Engine KILL SWITCH
# Use this to force-close all Python Terminals (Broadcaster & Executor)
# Warning: This kills ALL python.exe processes on the machine.

Write-Host "🛑 Stopping Social Trading Engine..." -ForegroundColor Red

try {
    # Force Kill Python Processes
    Stop-Process -Name "python" -Force -ErrorAction SilentlyContinue
    Write-Host "   - Killed all active Python processes." -ForegroundColor Yellow
}
catch {
    Write-Host "   - No Python processes found." -ForegroundColor Gray
}

# Optional: Flush Redis Logic?
# No, let the keys expire naturally (30s).
# If we flush Redis, we might delete critical state. 
# The Lock will expire in 30s max if process is dead.

Write-Host "✅ Engine Stopped. Please wait 30 seconds for Redis locks to clear before restarting." -ForegroundColor Cyan
