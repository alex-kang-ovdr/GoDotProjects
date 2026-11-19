param([string]$BaseUrl = 'http://127.0.0.1:8765')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$resultDir = Join-Path $root 'TestResults'
New-Item -ItemType Directory -Path $resultDir -Force | Out-Null
$health = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/health') -TimeoutSec 30
$health | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $resultDir 'inference-health.json') -Encoding utf8
$sourceImage = Join-Path $root 'gamescaling/examples/doom_battle1.jpg'
$imagePath = Join-Path $resultDir 'doom-smoke.png'
& (Join-Path $root '.venv/Scripts/python.exe') -c 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])' $sourceImage $imagePath
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the example PNG.' }
$promptPath = Join-Path $root 'gamescaling/prompts/example_doom_battle1.txt'
$body = @{
    game = 'doom-smoke'
    image = [Convert]::ToBase64String([IO.File]::ReadAllBytes($imagePath))
    system_prompt = [IO.File]::ReadAllText($promptPath)
    reset = $true
} | ConvertTo-Json -Depth 5 -Compress
$result = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/act') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 600
$result | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $resultDir 'inference-smoke.json') -Encoding utf8
$result | Select-Object device,latency_ms,finish_reason,text | Format-List
if (-not $result.action.parsed -or $result.action.truncated) { throw 'Model output did not form a complete valid action. See TestResults/inference-smoke.json.' }
Write-Output 'PASS: real model-generated action parsed. No game input was executed in this smoke test.'
