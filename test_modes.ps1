param (
    [string]$Mode = "TURBO",
    [string]$UserId = "",
    [int]$BatchId = 0,
    [string]$MT5Path = "C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe"
)

# 🔄 Activate Venv
$VenvScript = ".\.venv\Scripts\Activate.ps1"
if (Test-Path $VenvScript) {
    . $VenvScript
} else {
    Write-Host "⚠️ Virtual Environment not found. Assuming Python is in global path." -ForegroundColor Yellow
}

Write-Host "🧪 Starting Hydra Executor in TEST Mode: $Mode" -ForegroundColor Cyan

if ($Mode -eq "SINGLE") {
    if (-not $UserId) {
        Write-Error "❌ Error: SINGLE mode requires -UserId <GUID>"
        exit 1
    }
    Write-Host "   👤 User Target: $UserId"
    python src/engine/executor.py --mode SINGLE --user-id $UserId --mt5-path $MT5Path
}
elseif ($Mode -eq "BATCH") {
    Write-Host "   🚌 Batch Shard: $BatchId"
    python src/engine/executor.py --mode BATCH --batch-id $BatchId --mt5-path $MT5Path
}
elseif ($Mode -eq "TURBO") {
    Write-Host "   🏎️ Turbo Swarm (Universal)"
    python src/engine/executor.py --mode TURBO --mt5-path $MT5Path
}
else {
    Write-Error "❌ Invalid Mode. Use SINGLE, BATCH, or TURBO."
}
