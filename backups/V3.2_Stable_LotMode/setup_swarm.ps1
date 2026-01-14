
<#
.SYNOPSIS
    Hydra Swarm Setup Script - 4GB RAM Optimization
.DESCRIPTION
    Clones the Base MT5 installation into 20 Lightweight Instances.
    Required for HFT TURBO Mode.
    
    Logic:
    1. Takes a Source MT5 Folder (e.g. "C:\Program Files\MetaTrader 5")
    2. Creates 20 Copies at "C:\MT5_Instance_XX"
    3. Sets them to /portable mode
    
    ⚠️ WARNING: Requires Administrator Privileges
#>

param (
    [string]$SourcePath = "C:\Program Files\MetaTrader 5",
    [int]$Count = 20
)

$BaseTarget = "C:\MT5_Instance_"

Write-Host "🚀 Hydra Swarm Setup initiated..." -ForegroundColor Cyan
Write-Host "   Source: $SourcePath"
Write-Host "   Target: $BaseTarget{01..$Count}"
Write-Host "   Mode:   Lightweight Clone"
Write-Host ""

if (-not (Test-Path $SourcePath)) {
    Write-Error "❌ Source Path not found! Please install MT5 or correct the path."
    exit
}

for ($i = 1; $i -le $Count; $i++) {
    $id = "{0:D2}" -f $i
    $target = "$BaseTarget$id"
    
    Write-Host "   [$i/$Count] Provisioning Instance $id..." -NoNewline
    
    if (Test-Path $target) {
        Write-Host " [SKIPPED] (Exists)" -ForegroundColor Yellow
        continue
    }
    
    try {
        # 1. Copy the Folder
        # Optimization: We exclude 'Bases' (History) to save space? 
        # No, we need History for charts? Actually HFT disables charts.
        # But we need 'terminal64.exe' and dlls.
        
        Copy-Item -Path $SourcePath -Destination $target -Recurse -Force
        
        # 2. Add /portable flag? 
        # We don't add it to the binary, we launch it with the flag in python.
        # But we can create a shortcut for easier manual debug.
        
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$target\Terminal_Portable.lnk")
        $Shortcut.TargetPath = "$target\terminal64.exe"
        $Shortcut.Arguments = "/portable /config:common.ini"
        $Shortcut.Save()
        
        # 3. Optimization: Clean up unnecessary folders to save disk space
        # Remove 'Help', 'Sounds', 'Examples'
        Remove-Item "$target\Help" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item "$target\Sounds" -Recurse -Force -ErrorAction SilentlyContinue
        
        Write-Host " [OK] Created at $target" -ForegroundColor Green
        
    }
    catch {
        Write-Host " [FAILED] $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ Swarm Setup Complete!" -ForegroundColor Cyan
Write-Host "   You can now run: python src/engine/executor.py --mode TURBO"
