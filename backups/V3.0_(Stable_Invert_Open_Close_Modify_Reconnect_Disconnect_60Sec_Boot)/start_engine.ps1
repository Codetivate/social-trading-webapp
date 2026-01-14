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
    $MT5 = "C:\Program Files\Vantage International MT5\terminal64.exe"
}
# 🌟 EXPORT FOR WORKER SERVICE
$env:MT5_PATH = $MT5
Write-Host "Using MT5: $MT5" -ForegroundColor Gray

# 4. Launch
# 4. Launch Stack
Write-Host "Launching Antigravity Engine (Executor Architecture)..." -ForegroundColor Magenta

# Set Dev Identity
$env:CONTAINER_ID = "node-default"

# A. The Eyes (Orchestrator - Masters)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& python src/engine/orchestrator.py"

# B. The Muscle (Executor - Followers / Turbo Mode)
# Runs in TURBO mode to handle ALL followers dynamically + High Frequency Loop
# We explicitly pass the MT5 Path ensuring it connects to the right terminal.
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& python src/engine/executor.py --mode TURBO --mt5-path '$MT5'"

Write-Host "Done! Orchestrator and Executor are live." -ForegroundColor Green
