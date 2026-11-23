param(
  [string]$ConversationId = "",
  [string]$TranscriptPath = "",
  [string]$SinceIso = "",
  [string]$RepoPath = "",
  [switch]$SinceLastCommit,
  [switch]$ShowBypassDetails
)

$ErrorActionPreference = "Stop"

if (-not $RepoPath) {
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

if (-not $TranscriptPath) {
  $brainRoot = Join-Path $env:USERPROFILE ".gemini\antigravity\brain"
  if ($ConversationId) {
    $TranscriptPath = Join-Path $brainRoot "$ConversationId\.system_generated\logs\transcript.jsonl"
  } elseif (Test-Path $brainRoot) {
    $latest = Get-ChildItem -Path $brainRoot -Directory |
      ForEach-Object {
        $p = Join-Path $_.FullName ".system_generated\logs\transcript.jsonl"
        if (Test-Path $p) { Get-Item $p }
      } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($latest) { $TranscriptPath = $latest.FullName }
  }
}

if (-not $TranscriptPath -or -not (Test-Path -LiteralPath $TranscriptPath)) {
  Write-Error "transcript.jsonl 파일을 찾을 수 없습니다: $TranscriptPath"
  exit 1
}

$sinceFilter = $null
if ($SinceIso) {
  $sinceFilter = [DateTimeOffset]::Parse($SinceIso)
} elseif ($SinceLastCommit) {
  try {
    $lastCommitIso = (& git -C $RepoPath log -1 --format=%cI 2>$null | Out-String).Trim()
    if ($lastCommitIso) {
      $sinceFilter = [DateTimeOffset]::Parse($lastCommitIso)
    }
  } catch {}
}

$rawLines = Get-Content -LiteralPath $TranscriptPath -Encoding UTF8

function Measure-Window($filterTime) {
  $uReqs = 0
  $fTs = $null
  $lTs = $null
  $pReqs = 0
  $dReqs = 0
  $mOrder = New-Object System.Collections.Generic.List[string]
  $mMap = @{}
  $bList = New-Object System.Collections.Generic.List[string]

  foreach ($line in $rawLines) {
    if (-not $line.Trim()) { continue }
    try { $obj = $line | ConvertFrom-Json } catch { continue }
    $ts = $null
    if ($obj.created_at) {
      try { $ts = [DateTimeOffset]::Parse([string]$obj.created_at) } catch {}
    }
    if ($filterTime -and $ts -and $ts -le $filterTime) {
      continue
    }
    if ($ts) {
      if (-not $fTs -or $ts -lt $fTs) { $fTs = $ts }
      if (-not $lTs -or $ts -gt $lTs) { $lTs = $ts }
    }
    if ($obj.type -eq "USER_INPUT" -and $obj.source -eq "USER_EXPLICIT") {
      $uReqs++
    }
    if ($obj.type -eq "PLANNER_RESPONSE") {
      $m = if ($obj.model) { [string]$obj.model } else { "" }
      if ($m) {
        if (-not $mMap.ContainsKey($m)) {
          $mMap[$m] = @{ in = [int64]0; cache = [int64]0; out = [int64]0 }
          $mOrder.Add($m)
        }
        if ($null -ne $obj.input_tokens) { $mMap[$m].in += [int64]$obj.input_tokens }
        if ($null -ne $obj.cache_read_tokens) { $mMap[$m].cache += [int64]$obj.cache_read_tokens }
        if ($null -ne $obj.output_tokens) { $mMap[$m].out += [int64]$obj.output_tokens }
      }
      if ($obj.tool_calls) {
        foreach ($tc in $obj.tool_calls) {
          if ($tc.name -eq "ask_question") {
            $dReqs++
          }
          if ($tc.name -eq "run_command" -and $tc.args) {
            $bp = $tc.args.BypassSandbox
            if ($bp -eq $true -or $bp -eq "true" -or $bp -eq "True") {
              $pReqs++
              $cmdText = ([string]$tc.args.CommandLine -replace "\r?\n", " ").Trim()
              if ($cmdText.Length -gt 110) { $cmdText = $cmdText.Substring(0, 110) + "..." }
              $bList.Add("step=$($obj.step_index) time=$($obj.created_at) summary=$($tc.args.toolSummary) cmd=$cmdText")
            }
          }
        }
      }
    }
  }
  return @{
    userReqs = $uReqs
    firstTs = $fTs
    lastTs = $lTs
    permReqs = $pReqs
    decisionReqs = $dReqs
    modelOrder = $mOrder
    models = $mMap
    bypassList = $bList
  }
}

$w = Measure-Window $sinceFilter
if ($sinceFilter -and $w.modelOrder.Count -eq 0) {
  $w = Measure-Window $null
}

$elapsedSec = if ($w.firstTs -and $w.lastTs) { [int][Math]::Max(1, [Math]::Round(($w.lastTs - $w.firstTs).TotalSeconds)) } else { 0 }
$elapsedMin = [int][Math]::Floor($elapsedSec / 60)
$elapsedRem = $elapsedSec % 60
$elapsedFormatted = if ($elapsedMin -gt 0) { "${elapsedMin}m ${elapsedRem}s (${elapsedSec}s)" } else { "${elapsedRem}s (${elapsedSec}s)" }

$totalIn = [int64]0
$totalCache = [int64]0
$totalOut = [int64]0
$modelParts = New-Object System.Collections.Generic.List[string]
foreach ($m in $w.modelOrder) {
  $v = $w.models[$m]
  $totalIn += $v.in
  $totalCache += $v.cache
  $totalOut += $v.out
  $mTot = $v.in + $v.cache + $v.out
  $modelParts.Add(("{0} | {1:N0} (in: {2:N0} / cache: {3:N0} / out: {4:N0})" -f $m, $mTot, $v.in, $v.cache, $v.out))
}
$grandTotal = $totalIn + $totalCache + $totalOut
$modelNames = if ($w.modelOrder.Count -gt 0) { $w.modelOrder -join ", " } else { "N/A" }
$tokensTotalStr = if ($grandTotal -gt 0) { ("{0:N0} (in: {1:N0} / cache: {2:N0} / out: {3:N0})" -f $grandTotal, $totalIn, $totalCache, $totalOut) } else { "N/A" }
$tokensModelStr = if ($modelParts.Count -gt 0) { $modelParts -join "; " } else { "N/A" }

Write-Output "사용 모델 및 작업 시간"
Write-Output "- 사용 모델: $modelNames"
Write-Output "- 작업 시간: ${elapsedMin}m ${elapsedRem}s (${elapsedSec}s)"
Write-Output ""
Write-Output "Agent-User-Requests: $($w.userReqs)"
Write-Output "Agent-Elapsed: $elapsedFormatted"
Write-Output "Agent-Permission-Requests: $($w.permReqs)"
Write-Output "Agent-Decision-Requests: $($w.decisionReqs)"
Write-Output "Agent-Tokens-Total: $tokensTotalStr"
Write-Output "Agent-Tokens-Model: $tokensModelStr"

if ($ShowBypassDetails) {
  Write-Output ""
  Write-Output "=== BypassSandbox Commands ($($w.bypassList.Count)) ==="
  foreach ($item in $w.bypassList) { Write-Output $item }
}
