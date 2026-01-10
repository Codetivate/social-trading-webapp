$ErrorActionPreference = "Stop"
Write-Host "Hydra Launcher Starting..." -ForegroundColor Cyan

# 1. Activate Venv
if (Test-Path .\.venv\Scripts\Activate.ps1) {
    . .\.venv\Scripts\Activate.ps1
    Write-Host "Venv Active." -ForegroundColor Green
}

# 2. Parse .env (Safe Pipeline + Quote Stripping)
if (Test-Path .env) {
    Get-Content .env | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
        $parts = $_.Split('=', 2)
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()
        # Remove surrounding quotes if present
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
    Write-Host "Env Loaded." -ForegroundColor Green
}

# 3. Config
$MT5 = $env:MT5_PATH_ARG
if (-not $MT5) {
    # USER REQUEST: Use specific terminal for HFT Swarm (Follower)
    # Leaving "EXNESS" and "EXNESS 002" for Masters.
    $MT5 = "C:\Program Files\MetaTrader 5 EXNESS 003\terminal64.exe"
}
Write-Host "Using MT5: $MT5" -ForegroundColor Gray

# 4. Launch
Write-Host "Launching Processes..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& python src/engine/orchestrator.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& python src/engine/executor.py --mode TURBO --mt5-path '$MT5' --user-id '270766441'"

Write-Host "Done! Check new windows." -ForegroundColor Green
