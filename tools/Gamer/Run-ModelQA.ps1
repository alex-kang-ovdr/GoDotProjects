param(
    [ValidateSet('all','fortress-blue','besiege')][string]$Game = 'all',
    [ValidateRange(1,600)][int]$Steps = 20,
    [ValidateSet('workshop','play')][string]$BesiegeStart = 'workshop',
    [switch]$GuardPlayMode,
    [ValidateSet('model','guided','hybrid')][string]$Controller = 'model',
    [ValidateSet('none','combat')][string]$Guidance = 'none',
    [ValidateRange(1,60)][int]$GroupTicks = 1,
    [switch]$StopOnObjective,
    [switch]$RequireObjective,
    [string]$RunId = ('model-qa-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
)
$ErrorActionPreference = 'Stop'
$target = Get-Content (Join-Path $PSScriptRoot 'playhub-target.json') -Raw | ConvertFrom-Json
$node = Join-Path $PSScriptRoot $target.nodeRelativePath
& $node (Join-Path $PSScriptRoot 'playhub_model_qa.mjs') --game $Game --steps $Steps --besiege-start $BesiegeStart --guard-play-mode $GuardPlayMode.IsPresent.ToString().ToLowerInvariant() --controller $Controller --guidance $Guidance --group-ticks $GroupTicks --stop-on-objective $StopOnObjective.IsPresent.ToString().ToLowerInvariant() --require-objective $RequireObjective.IsPresent.ToString().ToLowerInvariant() --run-id $RunId
if ($LASTEXITCODE -ne 0) { throw 'QA did not meet gameplay criteria or encountered an error. Read the run summary and raw decisions in TestResults.' }
