#Requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateRange(1, 20)][int]$TopN = 20,
  [string]$ProjectRoot = '',
  [string]$HubDbPath = '',
  [ValidateRange(5000, 120000)][int]$TimeoutMs = 25000,
  [ValidateRange(250, 5000)][int]$PerfSampleMs = 900,
  [ValidateRange(1, 365)][int]$RetentionDays = 30,
  [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
} else {
  $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
}

function Resolve-Node24 {
  $candidates = @()
  if ($env:GAMERQA_NODE_BIN) { $candidates += $env:GAMERQA_NODE_BIN }
  $codexNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $codexNode) { $candidates += $codexNode }
  $pathNode = Get-Command node -ErrorAction SilentlyContinue
  if ($pathNode) { $candidates += $pathNode.Source }

  foreach ($bin in $candidates) {
    if (-not (Test-Path -LiteralPath $bin)) { continue }
    try {
      $ver = (& $bin -v 2>$null).Trim()
      if ($ver -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24) {
        return $bin
      }
    } catch {}
  }
  throw 'Node.js 24 or newer is required for GamerQA daily runner. Set GAMERQA_NODE_BIN to a Node 24+ binary.'
}

$nodeBin = Resolve-Node24
$cliPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\bin\gamerqa.mjs'))
$dailyDir = Join-Path $ProjectRoot 'artifacts\gamerqa\daily'
$logsDir = Join-Path $dailyDir 'logs'
[void](New-Item -ItemType Directory -Path $logsDir -Force)

$nowKst = [DateTime]::UtcNow.AddHours(9)
$logFile = Join-Path $logsDir ("daily-" + $nowKst.ToString('yyyy-MM-dd') + '.log')

$cliArgs = @(
  $cliPath,
  'daily',
  '--project-root', $ProjectRoot,
  '--top', "$TopN",
  '--timeout-ms', "$TimeoutMs",
  '--perf-sample-ms', "$PerfSampleMs",
  '--retention-days', "$RetentionDays"
)
if ($HubDbPath) { $cliArgs += @('--hub-db', $HubDbPath) }
if ($SkipBrowser) { $cliArgs += '--skip-browser' }

$header = "[{0}] START PlayHub GamerQA Daily Top-{1} E2E (node={2}, root={3})" -f $nowKst.ToString('yyyy-MM-dd HH:mm:ss KST'), $TopN, $nodeBin, $ProjectRoot
Add-Content -LiteralPath $logFile -Value $header -Encoding utf8
Write-Host $header

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $output = & $nodeBin @cliArgs 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $prevEap
}

foreach ($line in $output) {
  $text = "$line"
  Add-Content -LiteralPath $logFile -Value $text -Encoding utf8
  Write-Host $text
}

$footer = "[{0}] END exitCode={1}" -f [DateTime]::UtcNow.AddHours(9).ToString('yyyy-MM-dd HH:mm:ss KST'), $exitCode
Add-Content -LiteralPath $logFile -Value $footer -Encoding utf8
Write-Host $footer
exit $exitCode
