$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$results = Join-Path $PSScriptRoot 'TestResults'
New-Item -ItemType Directory -Path $results -Force | Out-Null
Push-Location $PSScriptRoot
try {
    & $python -X utf8 -m pip check *> (Join-Path $results 'pip-check.log')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency check failed. See TestResults/pip-check.log.' }
    & $python -X utf8 '.\gamescaling\tests\test_core.py' *> (Join-Path $results 'core-tests.log')
    if ($LASTEXITCODE -ne 0) { throw 'Core tests failed. See TestResults/core-tests.log.' }
    & $python -X utf8 '.\gamescaling\examples\run_example.py' --offline *> (Join-Path $results 'offline-example.log')
    if ($LASTEXITCODE -ne 0) { throw 'Offline example failed. See TestResults/offline-example.log.' }
    Get-Content (Join-Path $results 'core-tests.log')
    Get-Content (Join-Path $results 'offline-example.log')
    Write-Output 'PASS: client dependencies and offline checks. No model inference or game control was performed.'
} finally {
    Pop-Location
}
