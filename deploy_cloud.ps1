
# 1. Configuration
$ServerIP = "43.160.249.159"
$User = "root"

# 2. Setup Script Content
$SetupScript = @"
#!/bin/bash
set -e
echo "[1/5] Updating System..."
apt update && apt upgrade -y
echo "[2/5] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
echo "[3/5] Installing Dependencies..."
apt install -y git curl wget sudo htop tmux ufw zram-tools
echo "[4/5] Configuring ZRAM..."
echo -e "ALGO=lz4\nPERCENT=50" | tee /etc/default/zramswap
service zramswap restart
echo "[5/5] Docker Check..."
docker --version
echo "✅ SUCCESS: Server is ready!"
"@

$ScriptPath = "$env:TEMP\setup_server.sh"
Set-Content -Path $ScriptPath -Value $SetupScript

# 3. Connection with Auto-Accept Host Key
Write-Host "--- ATTEMPTING CONNECTION ---" -ForegroundColor Cyan
Write-Host "Target: $User@$ServerIP"
Write-Host "-----------------------------"

# Upload
Write-Host "1. Uploading script (Enter Password if asked)..."
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $ScriptPath ${User}@${ServerIP}:/root/setup_server.sh

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ UPLOAD FAILED. Please check your password or IP."
    exit
}

# Execute
Write-Host "2. Running setup (Enter Password again)..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${User}@${ServerIP} "chmod +x /root/setup_server.sh && /root/setup_server.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ EXECUTION FAILED."
    exit
}

Write-Host "🎉 DONE! Server Verified." -ForegroundColor Green
