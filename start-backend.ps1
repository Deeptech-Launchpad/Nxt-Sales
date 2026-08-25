# ── NXT MarketWiz — Start Backend ──────────────────────────
$serverDir = Join-Path $PSScriptRoot "server"

# Kill any node process using port 4000
Write-Host "Clearing port 4000..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start server from correct directory
Write-Host "Starting backend..." -ForegroundColor Cyan
Set-Location $serverDir
node src/index.js
