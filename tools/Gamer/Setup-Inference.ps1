$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Path 'TestResults' -Force | Out-Null
    if (-not (Test-Path '.venv-inference\Scripts\python.exe')) {
        python -m venv .venv-inference
        if ($LASTEXITCODE -ne 0) { throw 'Could not create inference environment.' }
    }
    $python = Join-Path $PSScriptRoot '.venv-inference\Scripts\python.exe'
    & $python -m pip install --disable-pip-version-check --no-cache-dir torch==2.11.0 torchvision==0.26.0 --index-url https://download.pytorch.org/whl/cu128
    if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed.' }
    & $python -m pip install --disable-pip-version-check --no-cache-dir transformers==5.14.1 accelerate requests Pillow
    if ($LASTEXITCODE -ne 0) { throw 'Transformers installation failed.' }
    & $python -X utf8 download_model.py
    if ($LASTEXITCODE -ne 0) { throw 'Checkpoint download/verification failed.' }
    & $python -m pip freeze | Set-Content requirements-inference.lock.txt -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Could not record installed versions.' }
    & $python -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Inference dependency consistency failed.' }
} finally { Pop-Location }
