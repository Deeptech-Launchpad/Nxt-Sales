# ── NXT MarketWiz — Start Frontend ─────────────────────────
$clientDir = Join-Path $PSScriptRoot "client"

Write-Host "Starting frontend..." -ForegroundColor Cyan
Set-Location $clientDir
npm run dev
