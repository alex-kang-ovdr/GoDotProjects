#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$TaskName = 'PlayHub-GamerQA-Daily-Top20-0400KST',
  [ValidatePattern('^\d{2}:\d{2}$')][string]$Time = '04:00',
  [ValidateRange(1, 20)][int]$TopN = 20,
  [string]$ProjectRoot = '',
  [switch]$Status,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
} else {
  $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
}

if ($Status) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Output ([ordered]@{ registered = $false; taskName = $TaskName } | ConvertTo-Json -Depth 4)
    exit 0
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Output ([ordered]@{
    registered = $true
    taskName = $task.TaskName
    state = "$($task.State)"
    nextRunTime = "$($info.NextRunTime)"
    lastRunTime = "$($info.LastRunTime)"
    lastTaskResult = $info.LastTaskResult
    execute = $task.Actions[0].Execute
    arguments = $task.Actions[0].Arguments
  } | ConvertTo-Json -Depth 4)
  exit 0
}

if ($Unregister) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Unregistered scheduled task: $TaskName"
  } else {
    Write-Host "Scheduled task not found: $TaskName"
  }
  exit 0
}

$runnerScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'Run-DailyGamerQA.ps1'))
if (-not (Test-Path -LiteralPath $runnerScript)) {
  throw "Runner script not found: $runnerScript"
}

$argLine = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runnerScript`" -TopN $TopN -ProjectRoot `"$ProjectRoot`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argLine -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "PlayHub GamerQA Daily Top-$TopN Popular Games E2E Performance/Memory/Response Profiler ($Time KST)" `
  -Force | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Output ([ordered]@{
  ok = $true
  taskName = $TaskName
  schedule = "Daily at $Time"
  topN = $TopN
  projectRoot = $ProjectRoot
  runnerScript = $runnerScript
  nextRunTime = "$($info.NextRunTime)"
} | ConvertTo-Json -Depth 4)
