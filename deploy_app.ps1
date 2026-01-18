# 1. Config
$ServerIP = "43.160.249.159"
$User = "root"
$RemoteDir = "/root/hydra-app"
$Payload = "payload.tar.gz"

Write-Host "--- PACKAGING APP ---" -ForegroundColor Cyan

# Cleanup Old
if (Test-Path $Payload) { Remove-Item $Payload -Force }

# 2. Create Tarball
# Windows 10+ has tar.exe built-in
$Includes = "src", "deployment", "public", ".env", "Dockerfile", "docker-compose.yml", "package.json", "requirements.txt"

# Verify items exist
foreach ($Item in $Includes) {
    if (-not (Test-Path $Item)) { Write-Warning "Missing item: $Item" }
}

# Run tar
tar -czf $Payload $Includes

if (-not (Test-Path $Payload)) {
    Write-Error "TAR FAILED. File not created."
    exit
}

Write-Host "Created payload.tar.gz" -ForegroundColor Green

# 3. Upload
Write-Host "--- UPLOADING TO $ServerIP ---" -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no $Payload ${User}@${ServerIP}:/root/$Payload

if ($LASTEXITCODE -ne 0) { 
    Write-Error "Upload Failed!"
    exit 
}

# 4. Deploy Remote
Write-Host "--- LAUNCHING REMOTE ---" -ForegroundColor Cyan

$RemoteScript = @"
echo "[Remote] Unpacking..."
rm -rf $RemoteDir && mkdir -p $RemoteDir
tar -xzf /root/$Payload -C $RemoteDir

echo "[Remote] Starting Docker..."
cd $RemoteDir
docker compose down
docker compose up -d --build
docker ps
"@

# Base64 Encode to prevent CRLF issues
$RemoteScriptUnix = $RemoteScript -replace "`r`n", "`n"
$Bytes = [System.Text.Encoding]::UTF8.GetBytes($RemoteScriptUnix)
$Encoded = [Convert]::ToBase64String($Bytes)

ssh -o StrictHostKeyChecking=no ${User}@${ServerIP} "echo $Encoded | base64 -d | bash"

# Cleanup
Remove-Item $Payload
Write-Host "--- DEPLOYMENT COMPLETE ---" -ForegroundColor Green
