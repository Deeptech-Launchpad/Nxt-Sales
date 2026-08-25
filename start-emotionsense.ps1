# Start EmotionSense AI Python service on port 8000
# Run this BEFORE starting the CRM backend/frontend.
# CRM backend talks to this service at http://localhost:8000

$ES_DIR = Join-Path $PSScriptRoot "EmotionSense_AI_v2\EmotionSense_AI_v2\ai-service"

Write-Host "Starting EmotionSense AI service at http://localhost:8000 ..." -ForegroundColor Cyan
Write-Host "Directory: $ES_DIR" -ForegroundColor Gray
Write-Host ""

# Check Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found in PATH. Install Python 3.8+ and try again." -ForegroundColor Red
    exit 1
}

Set-Location $ES_DIR

# Install dependencies if needed
if (-not (Test-Path "installed.flag")) {
    Write-Host "Installing Python dependencies (first run only)..." -ForegroundColor Yellow

    # Step 1: Install uvicorn + fastapi first (always needed to run the service)
    Write-Host "  -> uvicorn, fastapi..." -ForegroundColor Gray
    python -m pip install uvicorn fastapi python-multipart --upgrade

    # Step 2: Try requirements.txt (pinned versions may fail on newer Python)
    Write-Host "  -> requirements.txt..." -ForegroundColor Gray
    python -m pip install -r requirements.txt

    # Step 3: If torch pinned version failed, install latest compatible torch
    $torchCheck = python -c "import torch; print('ok')" 2>$null
    if ($torchCheck -ne "ok") {
        Write-Host "  -> torch (pinned version unavailable, installing latest)..." -ForegroundColor Yellow
        python -m pip install torch torchvision torchaudio --upgrade
    }

    # Step 4: If transformers pinned version failed, install latest
    $transCheck = python -c "import transformers; print('ok')" 2>$null
    if ($transCheck -ne "ok") {
        Write-Host "  -> transformers (installing latest)..." -ForegroundColor Yellow
        python -m pip install transformers --upgrade
    }

    # Step 5: librosa
    $librosaCheck = python -c "import librosa; print('ok')" 2>$null
    if ($librosaCheck -ne "ok") {
        Write-Host "  -> librosa (installing latest)..." -ForegroundColor Yellow
        python -m pip install librosa --upgrade
    }

    # Step 6: google-genai
    $genaiCheck = python -c "import google.genai; print('ok')" 2>$null
    if ($genaiCheck -ne "ok") {
        Write-Host "  -> google-genai (installing latest)..." -ForegroundColor Yellow
        python -m pip install google-genai --upgrade
    }

    New-Item -ItemType File -Path "installed.flag" -Force | Out-Null
    Write-Host "  -> Dependencies installed." -ForegroundColor Green
}

Write-Host ""
Write-Host "EmotionSense AI running at http://localhost:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

# Start the FastAPI service with uvicorn on port 8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
