param(
    [ValidateSet('auto','cuda','cpu')][string]$Device = 'auto',
    [int]$Port = 8765,
    [int]$HistoryFrames = 0,
    [int]$MaxNewTokens = 96,
    [int]$MaxWidth = 640,
    [int]$MaxHeight = 360,
    [double]$Temperature = 0,
    [int]$Seed = 42
)
$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv-inference\Scripts\python.exe'
$server = Join-Path $PSScriptRoot 'inference_server.py'
$model = Join-Path $PSScriptRoot 'models\GameScaling-0.8B-S3'
& $python -X utf8 -u $server --model $model --device $Device --port $Port --history-frames $HistoryFrames --max-width $MaxWidth --max-height $MaxHeight --max-new-tokens $MaxNewTokens --cpu-threads 8 --temperature $Temperature --seed $Seed
if ($LASTEXITCODE -ne 0) { throw "Inference service exited with code $LASTEXITCODE" }
