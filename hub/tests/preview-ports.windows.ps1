#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../tools/preview-ports.ps1'
. $helper

$previewRoot = 'C:\PlayHub Checkout\source'
$configured = @{ userPort = 18080; adminUiPort = 18081; publicPort = 18090; adminPort = 18091 }
$preview = [pscustomobject]@{
  ProcessId = 7000; Name = 'node.exe'; ExecutablePath = 'C:\Program Files\nodejs\node.exe'
  CreationDate = (Get-Date).AddMinutes(-1)
  CommandLine = '"C:\Program Files\nodejs\node.exe" "C:\PlayHub Checkout\source\tools\dev.mjs" --config local.json'
}
$foreign = [pscustomobject]@{
  ProcessId = 8000; Name = 'node.exe'; ExecutablePath = $preview.ExecutablePath
  CreationDate = $preview.CreationDate
  CommandLine = '"C:\Program Files\nodejs\node.exe" other.mjs "C:\PlayHub Checkout\source\tools\dev.mjs"'
}

function Assert-Equal($Actual, $Expected) {
  if ($Actual -cne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}
function Assert-Failure([scriptblock]$Action, [string]$Expected) {
  try { & $Action } catch {
    if ($_.Exception.Message -match $Expected) { return }
    throw
  }
  throw "Expected failure matching '$Expected'."
}
function Set-TestListeners([int]$ProcessId, [int[]]$Ports) {
  $script:listenerRows = @(foreach ($port in $Ports) { [pscustomobject]@{Port = $port; ProcessId = $ProcessId} })
}
function Get-PlayHubPortListeners([int[]]$Ports) {
  Assert-Equal ($Ports -join ',') '18080,18081,18090,18091'
  $script:listenerRows
}
function Get-PlayHubPortProcess([int]$ProcessId) { $script:owners[$ProcessId] }
function Read-Host($Prompt) {
  if ($Prompt -notmatch 'same ports.*\[y/N\]') { throw 'The prompt does not show the requested choices.' }
  $script:promptCount++
  if ($script:onPrompt) { & $script:onPrompt }
  $script:answer
}
function Get-Process($Id, $ErrorAction) {
  $mock = [pscustomobject]@{ Id = $Id; Handle = 1 }
  $mock | Add-Member ScriptMethod WaitForExit { return $true }
  $mock | Add-Member ScriptMethod Dispose {}
  return $mock
}
function Stop-Process($InputObject, [switch]$Force, $ErrorAction) {
  if (-not $Force) { throw 'The stop lacks the approved force option.' }
  $script:stops += $InputObject.Id
  $script:listenerRows = @()
}

$script:owners = @{7000 = $preview; 8000 = $foreign}
$script:stops = @()
$script:promptCount = 0
$script:onPrompt = $null
$script:answer = ''
Set-TestListeners 7000 18080,18081,18090,18091
$invokePreview = { Assert-PlayHubPreviewPorts -Config $configured -SourceRoot $previewRoot }

Assert-Failure $invokePreview 'left running'
Assert-Equal $script:stops.Count 0
Assert-Equal $script:promptCount 1
Assert-Failure { Assert-PlayHubPreviewPorts -Config $configured -SourceRoot $previewRoot -NonInteractive } 'left running'
Assert-Equal $script:promptCount 1
Assert-Equal $script:listenerRows.Count 4

$script:answer = 'Y'
Set-TestListeners 8000 18080
Assert-Failure $invokePreview 'Close the listed process manually'
Assert-Equal $script:stops.Count 0
Assert-Equal $script:promptCount 1

Set-TestListeners 7000 18080,18081,18090,18091
$script:onPrompt = { $script:owners[7000] = $preview.PSObject.Copy(); $script:owners[7000].CreationDate = Get-Date }
Assert-Failure $invokePreview 'process at PID 7000 changed'
Assert-Equal $script:stops.Count 0
$script:owners[7000] = $preview
$script:onPrompt = $null
& $invokePreview
Assert-Equal ($script:stops -join ',') '7000'
Assert-Equal $script:listenerRows.Count 0

$temporary = Join-Path ([IO.Path]::GetTempPath()) ('playhub-port-policy-test-' + [guid]::NewGuid())
try {
  $null = New-Item -ItemType Directory -Path (Join-Path $temporary 'private'), (Join-Path $temporary 'reports')
  $exe = 'C:\PlayHub\PlayHub.exe'
  $launchTime = Get-Date
  $script:owners[9000] = [pscustomobject]@{
    ProcessId = 9000; ExecutablePath = $exe; CommandLine = ('"' + $exe + '"'); CreationDate = $launchTime.AddSeconds(-1)
  }
  $script:owners[9001] = [pscustomobject]@{
    ProcessId = 9001; ParentProcessId = 9000; Name = 'PlayHub.exe'; ExecutablePath = $exe
    CommandLine = ('"' + $exe + '" --worker=api --data-dir "' + $temporary + '"'); CreationDate = $launchTime.AddSeconds(1)
  }
  $guardPath = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe'
  $script:owners[9002] = [pscustomobject]@{
    ProcessId = 9002; ParentProcessId = 9000; ExecutablePath = $guardPath; CreationDate = $launchTime.AddSeconds(1)
    CommandLine = ('"' + $guardPath + '" -NoProfile -File "' + (Join-Path $previewRoot 'portable/rebex-guard.ps1') + '"')
  }
  $script:owners[9003] = [pscustomobject]@{
    ProcessId = 9003; ParentProcessId = 9002; Name = 'RebexTinyWebServer.exe'; CreationDate = $launchTime.AddSeconds(2)
    ExecutablePath = (Join-Path $temporary 'servers/user/RebexTinyWebServer.exe')
  }
  @{product='playhub-portable'; runId='test-run'; pid=9000; startedAt=$launchTime.ToUniversalTime().ToString('o')} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $temporary 'private/launcher.lock')
  @{runId='test-run'; mainPid=9000; mode='portable-rebex'; status='running'; paths=@{instanceRoot=$temporary; executable=$exe; appRoot=$previewRoot};
    children=@(@{pid=9001; role='api'; status='ready'}, @{pid=9002; role='rebex-supervisor'; status='ready'}, @{pid=9003; role='rebex-user'; status='ready'})} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $temporary 'reports/startup-report.json')
  Set-TestListeners 9001 18090,18091
  $script:listenerRows += [pscustomobject]@{Port = 18080; ProcessId = 9003}
  Assert-PlayHubPreviewPorts -Config $configured -SourceRoot $previewRoot -InstanceRoot $temporary -LauncherExecutable $exe
  Assert-Equal ($script:stops -join ',') '7000,9000'
  Assert-Equal $script:listenerRows.Count 0
} finally {
  $resolved = (Resolve-Path -LiteralPath $temporary -ErrorAction SilentlyContinue).Path
  if ($resolved -eq [IO.Path]::GetFullPath($temporary)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
Write-Output 'PlayHub port policy passed.'
