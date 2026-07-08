# NXT MarketingWiz - Server Restart Script
# This script cleanly kills any existing processes and restarts both frontend and backend

Write-Host "🔄 NXT MarketingWiz - Restarting Servers" -ForegroundColor Cyan
Write-Host ""

# Kill processes on port 5000 (backend)
Write-Host "Cleaning up port 5000..." -ForegroundColor Yellow
$proc5000 = Get-NetTcpConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($proc5000) {
  $proc5000 | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "✓ Port 5000 cleared" -ForegroundColor Green
} else {
  Write-Host "✓ Port 5000 is free" -ForegroundColor Green
}

# Kill processes on port 3000 (frontend)
Write-Host "Cleaning up port 3000..." -ForegroundColor Yellow
$proc3000 = Get-NetTcpConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($proc3000) {
  $proc3000 | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "✓ Port 3000 cleared" -ForegroundColor Green
} else {
  Write-Host "✓ Port 3000 is free" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "server")
Start-Process -NoNewWindow npm -ArgumentList "run dev" -PassThru | Out-Null
Write-Host "✓ Backend starting on http://localhost:5000" -ForegroundColor Green

Start-Sleep -Seconds 3

Write-Host "Starting frontend server..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "client")
Start-Process -NoNewWindow npm -ArgumentList "run dev" -PassThru | Out-Null
Write-Host "✓ Frontend starting on http://localhost:3000" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Both servers are starting!" -ForegroundColor Cyan
Write-Host "   Backend:  http://localhost:5000" -ForegroundColor Gray
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "Wait 5-10 seconds for servers to fully initialize..." -ForegroundColor Yellow
