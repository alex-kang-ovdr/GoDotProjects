#Requires -Version 5.1
param(
  [string]$Ports,
  [string]$SourceRoot,
  [string]$InstanceRoot,
  [string[]]$LauncherExecutable,
  [switch]$NonInteractive
)

function Get-PlayHubPortListeners {
  param([int[]]$Ports)

  $netstat = Join-Path ([Environment]::SystemDirectory) 'netstat.exe'
  $rows = & $netstat -ano
  if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate TCP listeners. PlayHub startup stopped.' }
  foreach ($row in $rows) {
    if ($row -match '^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$' -and [int]$Matches[2] -in $Ports) {
      [pscustomobject]@{ Address = $Matches[1]; Port = [int]$Matches[2]; ProcessId = [int]$Matches[3] }
    }
  }
}

function Get-PlayHubPortProcess {
  param([int]$ProcessId)

  if ($ProcessId -le 0) { return }
  try { Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + $ProcessId) -ErrorAction Stop }
  catch { return }
}

function Test-PlayHubProcessPath {
  param([string]$Observed, [string]$Expected)

  if ($Observed -notmatch '^(?:[A-Za-z]:[\\/]|\\\\)' -or -not $Expected) { return $false }
  try {
    return [string]::Equals([IO.Path]::GetFullPath($Observed), [IO.Path]::GetFullPath($Expected), [StringComparison]::OrdinalIgnoreCase)
  } catch { return $false }
}

function Get-PlayHubScriptArgument {
  param([string]$CommandLine)

  if ($CommandLine -match '^\s*(?:"[^"]+"|[^\s"]+)\s+(?:"([^"]+)"|([^\s"]+))(?:\s|$)') {
    return ($Matches[1] + $Matches[2])
  }
}

function Test-PlayHubPreviewProcess {
  param($Owner, [string]$SourceRoot)

  return ($null -ne $Owner -and $Owner.CreationDate -and $Owner.Name -eq 'node.exe' -and
    [IO.Path]::GetFileName([string]$Owner.ExecutablePath) -eq 'node.exe' -and
    (Test-PlayHubProcessPath (Get-PlayHubScriptArgument $Owner.CommandLine) (Join-Path $SourceRoot 'tools/dev.mjs')))
}

function Get-PlayHubPortableInstance {
  param([string]$InstanceRoot, [string[]]$LauncherExecutable)

  if (-not $InstanceRoot -or -not $LauncherExecutable) { return }
  try {
    $lock = Get-Content -LiteralPath (Join-Path $InstanceRoot 'private/launcher.lock') -Raw -ErrorAction Stop | ConvertFrom-Json
    $report = Get-Content -LiteralPath (Join-Path $InstanceRoot 'reports/startup-report.json') -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($lock.product -ne 'playhub-portable' -or -not $lock.runId -or $lock.runId -ne $report.runId -or
        $lock.pid -ne $report.mainPid -or $report.mode -ne 'portable-rebex' -or $report.status -ne 'running' -or
        -not (Test-PlayHubProcessPath $report.paths.instanceRoot $InstanceRoot) -or
        -not @($LauncherExecutable | Where-Object { Test-PlayHubProcessPath $report.paths.executable $_ }).Count) { return }

    $launcher = Get-PlayHubPortProcess ([int]$lock.pid)
    if (-not $launcher -or -not $launcher.CreationDate -or
        -not (Test-PlayHubProcessPath $launcher.ExecutablePath $report.paths.executable)) { return }
    $startedAt = ([DateTimeOffset]$lock.startedAt).UtcDateTime
    if ($launcher.CreationDate.ToUniversalTime() -gt $startedAt.AddSeconds(1)) { return }
    return @{ Launcher = $launcher; Children = $report.children; AppRoot = $report.paths.appRoot; InstanceRoot = $InstanceRoot }
  } catch { return }
}

function Get-PlayHubPortableStopTarget {
  param($Owner, $Portable)

  if (-not $Owner -or -not $Owner.CreationDate -or -not $Portable) { return }
  $launcher = $Portable.Launcher
  if ($Owner.CreationDate -lt $launcher.CreationDate) { return }
  $child = @($Portable.Children | Where-Object { $_.pid -eq $Owner.ProcessId -and $_.status -eq 'ready' })
  if ($child.Count -ne 1) { return }
  $role = $child[0].role
  if ($role -in 'api', 'admin') {
    $script = Get-PlayHubScriptArgument $Owner.CommandLine
    if ($Owner.ParentProcessId -eq $launcher.ProcessId -and
        (Test-PlayHubProcessPath $Owner.ExecutablePath $launcher.ExecutablePath) -and
        $Owner.CommandLine -match ('(?:^|\s)"?--worker=' + $role + '"?(?:\s|$)') -and
        ($script -eq ('--worker=' + $role) -or (Test-PlayHubProcessPath $script (Join-Path $Portable.AppRoot 'portable/launch.mjs')))) {
      return $launcher
    }
  } elseif ($role -eq 'rebex-user' -and
      (Test-PlayHubProcessPath $Owner.ExecutablePath (Join-Path $Portable.InstanceRoot 'servers/user/RebexTinyWebServer.exe'))) {
    $guard = Get-PlayHubPortProcess $Owner.ParentProcessId
    if ($guard -and $guard.CreationDate -ge $launcher.CreationDate -and $guard.CreationDate -le $Owner.CreationDate -and
        $guard.ParentProcessId -eq $launcher.ProcessId -and
        @($Portable.Children | Where-Object { $_.role -eq 'rebex-supervisor' -and $_.pid -eq $guard.ProcessId }).Count -eq 1 -and
        (Test-PlayHubProcessPath $guard.ExecutablePath (Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe')) -and
        $guard.CommandLine -match '(?:^|\s)-File\s+(?:"([^"]+)"|([^\s"]+))(?:\s|$)' -and
        (Test-PlayHubProcessPath ($Matches[1] + $Matches[2]) (Join-Path $Portable.AppRoot 'portable/rebex-guard.ps1'))) {
      return $launcher
    }
  }
}

function Stop-VerifiedPlayHubProcess {
  param($Original)

  $processId = [int]$Original.ProcessId
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  try {
    # Retain a handle while verifying identity and stopping the process.
    $null = $process.Handle
    $current = Get-PlayHubPortProcess $processId
    if (-not $current -or $current.CreationDate -ne $Original.CreationDate -or
        $current.ExecutablePath -cne $Original.ExecutablePath -or $current.CommandLine -cne $Original.CommandLine) {
      throw ('The process at PID {0} changed. Check the conflicting processes before retrying.' -f $processId)
    }
    Stop-Process -InputObject $process -Force -ErrorAction Stop
    if (-not $process.WaitForExit(5000)) { throw ('PlayHub PID {0} did not stop.' -f $processId) }
  } finally { $process.Dispose() }
}

function Assert-PlayHubPreviewPorts {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [string]$InstanceRoot,
    [string[]]$LauncherExecutable,
    [switch]$NonInteractive
  )

  $ports = @($Config.userPort, $Config.adminUiPort, $Config.publicPort, $Config.adminPort)
  if (@($ports | Where-Object { $_ -isnot [ValueType] -or $_ -lt 1024 -or $_ -gt 65535 -or $_ -ne [int]$_ }).Count -or
      @($ports | Sort-Object -Unique).Count -ne 4) {
    throw 'PlayHub requires four distinct configured TCP ports between 1024 and 65535.'
  }

  $listeners = @(Get-PlayHubPortListeners $ports)
  if (-not $listeners.Count) { return }

  Write-Host 'ERROR: Configured PlayHub TCP ports are occupied.' -ForegroundColor Red
  $targetsByListener = @{}
  $portable = Get-PlayHubPortableInstance $InstanceRoot $LauncherExecutable
  $hasUnknownOwner = $false
  foreach ($group in ($listeners | Group-Object ProcessId)) {
    $groupPorts = ($group.Group.Port | Sort-Object -Unique) -join ', '
    $processId = [int]$group.Name
    $owner = Get-PlayHubPortProcess $processId
    $name = 'unknown process'
    if ($owner -and $owner.Name) { $name = $owner.Name }
    Write-Host ('  TCP {0} - PID {1} ({2})' -f $groupPorts, $processId, $name)
    $target = if (Test-PlayHubPreviewProcess $owner $SourceRoot) { $owner } else { Get-PlayHubPortableStopTarget $owner $portable }
    if ($target) { $targetsByListener[$processId] = $target }
    else { $hasUnknownOwner = $true }
  }
  if ($hasUnknownOwner) { throw 'Close the listed process manually and retry. PlayHub could not verify every owner as a PlayHub server.' }
  if ($NonInteractive -or ([string](Read-Host 'Force-stop the listed PlayHub server and retry the same ports? [y/N]')).Trim() -ine 'y') {
    throw 'PlayHub startup stopped. The current server was left running.'
  }

  $targets = @{}
  foreach ($listener in @(Get-PlayHubPortListeners $ports)) {
    $target = $targetsByListener[$listener.ProcessId]
    if (-not $target) { throw 'A new process took a configured TCP port. Check the listed ports before retrying.' }
    $targets[$target.ProcessId] = $target
  }
  foreach ($target in $targets.Values) { Stop-VerifiedPlayHubProcess $target }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not @(Get-PlayHubPortListeners $ports).Count) { return }
    Start-Sleep -Milliseconds 250
  }
  throw 'Configured PlayHub ports remain occupied. Close the listed processes manually and retry.'
}

if ($MyInvocation.InvocationName -ne '.') {
  $ErrorActionPreference = 'Stop'
  try {
    $values = $Ports -split ','
    if ($values.Count -ne 4 -or @($values | Where-Object { $_ -notmatch '^\d{1,5}$' }).Count) {
      throw 'PlayHub requires four configured TCP ports.'
    }
    $config = @{ userPort = [int]$values[0]; adminUiPort = [int]$values[1]; publicPort = [int]$values[2]; adminPort = [int]$values[3] }
    Assert-PlayHubPreviewPorts -Config $config -SourceRoot $SourceRoot -InstanceRoot $InstanceRoot -LauncherExecutable $LauncherExecutable -NonInteractive:$NonInteractive
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
  }
}
