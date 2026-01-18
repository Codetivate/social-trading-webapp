# Config
$ServerIP = "43.160.249.159"
$User = "root"

Write-Host "Connecting to Server Logs..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop watching." -ForegroundColor Gray

ssh -o StrictHostKeyChecking=no ${User}@${ServerIP} docker logs -f --tail 100 hydra-engine
