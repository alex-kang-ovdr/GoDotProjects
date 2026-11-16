#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
Authoring validation: NOT_RUN on Windows. This script was provided without
executing Windows PowerShell, IIS observation or a real browser in the authoring
environment. Running this file produces a new report from actual observations.
It never performs database restoration or assumes manual acceptance is complete.
#>
[CmdletBinding()]
param(
    [string]$InstallRoot='C:\PlayHubPoC',
    [switch]$SkipBrowser,
    [Alias('install-tools')][switch]$InstallTools,
    [switch]$Headed,
    [string]$Channel='',
    [string]$BrowserExecutable=''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$ReportDirectory=Join-Path $InstallRoot 'reports'
$ReportPath=Join-Path $ReportDirectory 'poc-acceptance.json'
$HtmlPath=Join-Path $ReportDirectory 'poc-acceptance.html'
$RunId=[Guid]::NewGuid().ToString('N')
$StartedAt=[DateTime]::UtcNow
$Utf8=New-Object System.Text.UTF8Encoding($false)
$Checks=New-Object 'System.Collections.Generic.List[object]'
$ChildReports=New-Object 'System.Collections.Generic.List[object]'
$ManualChecks=@(
    @{id='MANUAL-GOOGLE';status='pending';title='Real Google OAuth';message='Use the configured real Google client and verify successful sign-in, cancellation, explicit guest merge and logout. This automated gate does not perform real Google authentication.'},
    @{id='MANUAL-LAN';status='pending';title='A second LAN computer';message='From another physical LAN computer, verify the user site and gameplay. Verify that administrator site/API access remains unavailable from that computer.'},
    @{id='MANUAL-REBOOT';status='pending';title='Windows reboot';message='Reboot the Windows host, then verify IIS and the scheduled API task start automatically and saved progress remains available.'}
)
$Report=[ordered]@{
    schemaVersion=1;kind='poc-windows-acceptance';runId=$RunId;startedAt=$StartedAt.ToString('o');generatedAt=$StartedAt.ToString('o')
    status='not_run';automatedPassed=$false;overallFullyAccepted=$false
    environment=@{windowsObserved=$false;powerShellVersion=$PSVersionTable.PSVersion.ToString();edition=[string]$PSVersionTable.PSEdition}
    scope=@{iisObservation=$true;authenticatedHttp=$true;browserRequested=(-not [bool]$SkipBrowser);databaseRestoreExecuted=$false;coreRegression='Run the separate Node acceptance suite';credentialsRecorded=$false;screenshotsRecorded=$false}
    impact='The child tools create server-classified QA traffic and may temporarily toggle a game, restoring its original state. No database restore is performed. Administrator credentials may be requested twice by independent child processes.'
    installation=$null;automatedChecks=@();childReports=@();manualChecks=$ManualChecks;manualPendingCount=3
    summary=@{pass=0;fail=0;partial=0;not_run=0}
}

function Safe-Require([bool]$Condition,[string]$Message){
    if(-not $Condition){
        $Failure=New-Object System.InvalidOperationException($Message)
        $Failure.Data['PlayHubSafeMessage']=$true
        throw $Failure
    }
}
function Normalize-Path([string]$Value){
    return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Value)).TrimEnd('\')
}
function Is-Within([string]$Candidate,[string]$Directory){
    $A=Normalize-Path $Candidate;$B=Normalize-Path $Directory
    return $A.Equals($B,[StringComparison]::OrdinalIgnoreCase) -or $A.StartsWith($B+'\',[StringComparison]::OrdinalIgnoreCase)
}
function Is-Loopback([string]$Value){
    $Parsed=$null
    if(-not [Net.IPAddress]::TryParse($Value.Trim([char[]]'[]'),[ref]$Parsed)){return $false}
    return [Net.IPAddress]::IsLoopback($Parsed)
}
function Html([object]$Value){return [Net.WebUtility]::HtmlEncode([string]$Value)}
function Run-Observation([string]$Id,[string]$Title,[scriptblock]$Action){
    $Clock=[Diagnostics.Stopwatch]::StartNew()
    try{
        $Evidence=& $Action
        $Checks.Add(@{id=$Id;title=$Title;status='pass';durationMs=$Clock.ElapsedMilliseconds;evidence=$Evidence})
        Write-Host "PASS $Id"
        return $true
    }catch{
        $Message='The Windows observation could not be completed. Check the named resource, administrative permission and the required Windows management component.'
        if($_.Exception.Data.Contains('PlayHubSafeMessage')){$Message=$_.Exception.Message}
        $Checks.Add(@{id=$Id;title=$Title;status='fail';durationMs=$Clock.ElapsedMilliseconds;message=$Message})
        Write-Warning "FAIL $Id - $Message"
        return $false
    }finally{$Clock.Stop()}
}
function Site-Bindings([string]$Name){
    $Rows=@()
    foreach($Binding in @(Get-WebBinding -Name $Name -ErrorAction Stop)){
        $Info=[string]$Binding.bindingInformation
        Safe-Require ($Info -match '^(?<address>.*):(?<port>[0-9]+):(?<host>.*)$') 'An IIS binding could not be interpreted.'
        $Rows+=@{protocol=[string]$Binding.protocol;address=$Matches.address;port=[int]$Matches.port;hostHeader=$Matches.host}
    }
    return $Rows
}
function Snapshot-ChildChecks([object]$Data){
    $Rows=@()
    foreach($Check in @($Data.checks)){
        $Code=''
        if($Check.PSObject.Properties['error'] -and $Check.error -and $Check.error.PSObject.Properties['code']){
            if([string]$Check.error.code -match '^[A-Z0-9_]{1,80}$'){$Code=[string]$Check.error.code}
        }
        # Only schema fields are copied, never raw request/response data, exception
        # stacks, cookie/CSRF values, passwords or saved game payloads.
        $Rows+=@{id=[string]$Check.id;title=[string]$Check.title;status=[string]$Check.status;errorCode=$Code}
    }
    return $Rows
}
function Run-ChildGate([string]$Gate,[string]$ScriptFile,[string]$JsonFile,[string[]]$ExtraArguments){
    $CheckId='POC-'+$Gate.ToUpperInvariant()
    $ChildExit=$null;$Fresh=$false;$Data=$null;$ChildStatus='not_run'
    $SafeChecks=@();$DeferredChecks=@();$RequiredIds=@();$RequiredMissing=@();$RequiredNotPassed=@();$Failures=0;$Incomplete=0
    $Started=[DateTime]::UtcNow
    try{
        Safe-Require (Test-Path -LiteralPath $ScriptFile -PathType Leaf) 'The installed release is missing a required validation wrapper.'
        # Move old evidence aside before execution. An old successful report can
        # never stand in for a child that fails or does not write a new report.
        foreach($Previous in @($JsonFile,([regex]::Replace($JsonFile,'(?i)\.json$','')+'.html'))){
            if(Test-Path -LiteralPath $Previous){Move-Item -LiteralPath $Previous -Destination ($Previous+'.previous-'+$RunId) -ErrorAction Stop}
        }
        $PowerShell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        Safe-Require (Test-Path -LiteralPath $PowerShell -PathType Leaf) 'Windows PowerShell 5.1 executable is unavailable.'
        $ChildArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$ScriptFile,'-InstallRoot',$InstallRoot,'-WithAdmin')+$ExtraArguments
        Write-Host "Running $Gate in an independent Windows PowerShell process..."
        $SavedPreference=$ErrorActionPreference
        try{
            $ErrorActionPreference='Continue'
            # Native execution updates the global automatic variable. A local
            # assignment here would shadow it and leave the observed exit null.
            $global:LASTEXITCODE=$null
            & $PowerShell @ChildArguments | ForEach-Object {Write-Host $_}
            $ChildExit=$global:LASTEXITCODE
        }finally{$ErrorActionPreference=$SavedPreference}
        Safe-Require ($null -ne $ChildExit) 'The child process did not return an exit code.'
        Safe-Require (Test-Path -LiteralPath $JsonFile -PathType Leaf) 'The child did not create a new JSON report.'
        $Data=Get-Content -LiteralPath $JsonFile -Raw -Encoding UTF8 | ConvertFrom-Json
        Safe-Require ($Data.PSObject.Properties['checks'] -and @($Data.checks).Count -gt 0) 'The child report contains no executed or pending checks.'
        Safe-Require ($Data.PSObject.Properties['generatedAt']) 'The child report has no generation timestamp.'
        $Generated=[DateTimeOffset]::Parse([string]$Data.generatedAt)
        Safe-Require ($Generated.UtcDateTime -ge $Started.AddSeconds(-2)) 'The child report is older than this validation attempt.'
        $Fresh=$true
        $SafeChecks=@(Snapshot-ChildChecks $Data)
        Safe-Require (@($SafeChecks|Where-Object {$_.status -notin @('pass','fail','skip','warning','not_run','partial')}).Count -eq 0) 'The child report contains an unknown check status.'
        $Failures=@($SafeChecks|Where-Object {$_.status -eq 'fail'}).Count
        $Incomplete=@($SafeChecks|Where-Object {$_.status -in @('skip','warning','not_run','partial')}).Count
        if($Gate -eq 'http'){
            Safe-Require ($Data.kind -eq 'poc-http-smoke') 'The HTTP wrapper produced a different kind of report.'
            Safe-Require ($Data.environment.platform -eq 'win32' -and $Data.environment.iisTargetDeclared -eq $true) 'The HTTP report is not an actual Windows IIS-target execution.'
            Safe-Require ($Data.environment.adminCredentialsProvided -eq $true) 'The HTTP child did not include authenticated administrator checks.'
            # These exact HTTP exclusions belong to other acceptance gates.
            # Preserve their original skip rows; no other incomplete check is
            # exempt, and even one of these IDs reported as fail still fails.
            $DeferredDefinitions=@{
                'SMOKE-BROWSER'=@{deferredTo='POC-BROWSER';reason='Actual browser execution is evaluated by the independent browser gate.'}
                'SMOKE-IIS'=@{deferredTo='POC-WINDOWS,POC-IIS-SITES,POC-WEBROOTS,POC-IIS-BINDINGS,POC-API-LOOPBACK,POC-TASK,POC-CONFIG-ACL';reason='Installed IIS, bindings, task and ACL evidence is evaluated by the Windows observations.'}
                'SMOKE-GOOGLE'=@{deferredTo='MANUAL-GOOGLE';reason='Real Google OAuth remains manual pending and prevents full service acceptance.'}
            }
            foreach($Check in $SafeChecks){
                if($Check.status -eq 'skip' -and $DeferredDefinitions.ContainsKey($Check.id)){
                    $Definition=$DeferredDefinitions[$Check.id]
                    $DeferredChecks+=@{id=$Check.id;title=$Check.title;status=$Check.status;deferredTo=$Definition.deferredTo;reason=$Definition.reason}
                }
            }
            $Incomplete=@($SafeChecks|Where-Object {$_.status -in @('skip','warning','not_run','partial') -and -not ($_.status -eq 'skip' -and $DeferredDefinitions.ContainsKey($_.id))}).Count
            $RequiredIds=@('SMOKE-HEALTH-PUBLIC','SMOKE-HEALTH-ADMIN','SMOKE-STATIC-USER','SMOKE-STATIC-ADMIN','SMOKE-CATALOG','SMOKE-GUEST','SMOKE-QA-SESSION','SMOKE-SAVE','SMOKE-SAVE-RESTORE','SMOKE-METRICS-DATASETS','SMOKE-METRICS-FILTERS','SMOKE-ADMIN-LOGIN','SMOKE-ADMIN-LOGOUT','SMOKE-ADMIN-ISOLATION')
            foreach($RequiredId in $RequiredIds){
                $RequiredMatches=@($SafeChecks|Where-Object {$_.id -eq $RequiredId})
                if($RequiredMatches.Count -ne 1){$RequiredMissing+=$RequiredId}
                elseif($RequiredMatches[0].status -ne 'pass'){$RequiredNotPassed+=$RequiredId}
            }
            $RequiredComplete=($RequiredMissing.Count -eq 0 -and $RequiredNotPassed.Count -eq 0)
            $Confirmed=($ChildExit -eq 0 -and $Data.ok -eq $true -and $Failures -eq 0 -and $Incomplete -eq 0 -and $RequiredComplete)
            if($Confirmed){$ChildStatus='pass'}elseif($ChildExit -ne 0 -or $Failures -gt 0 -or $Data.ok -ne $true -or $RequiredMissing.Count -gt 0){$ChildStatus='fail'}else{$ChildStatus='partial'}
        }else{
            Safe-Require ($Data.tool -eq 'playhub-browser-e2e') 'The browser wrapper produced a different kind of report.'
            $Confirmed=($ChildExit -eq 0 -and $Data.status -eq 'passed' -and $Data.passed -eq $true -and $Data.browserExecuted -eq $true -and $Failures -eq 0 -and $Incomplete -eq 0)
            if($Confirmed){$ChildStatus='pass'}elseif($Failures -gt 0 -or $Data.status -eq 'failed'){$ChildStatus='fail'}elseif($Data.status -eq 'not_run'){$ChildStatus='not_run'}else{$ChildStatus='partial'}
        }
        $ChildReports.Add(@{gate=$Gate;status=$ChildStatus;exitCode=$ChildExit;freshReport=$Fresh;reportFile=[IO.Path]::GetFileName($JsonFile);generatedAt=[string]$Data.generatedAt;checks=$SafeChecks;deferredChecks=$DeferredChecks;requiredChecks=$RequiredIds;requiredMissingOrDuplicate=$RequiredMissing;requiredNotPassed=$RequiredNotPassed;checkCounts=@{pass=@($SafeChecks|Where-Object {$_.status -eq 'pass'}).Count;fail=$Failures;incomplete=$Incomplete;deferred=$DeferredChecks.Count}})
        $Checks.Add(@{id=$CheckId;title=($Gate+' acceptance child process');status=$ChildStatus;evidence=@{exitCode=$ChildExit;freshReport=$Fresh;reportFile=[IO.Path]::GetFileName($JsonFile);checks=$SafeChecks.Count;deferred=$DeferredChecks.Count;requiredMissingOrDuplicate=$RequiredMissing;requiredNotPassed=$RequiredNotPassed};message='Exit zero alone is insufficient. Fresh report contents and required HTTP checks were evaluated. Only the three explicitly recorded HTTP exclusions belong to separate browser, IIS observation or manual Google gates.'})
    }catch{
        $Message='The child process or its fresh JSON report could not be validated. It is not a pass.'
        if($_.Exception.Data.Contains('PlayHubSafeMessage')){$Message=$_.Exception.Message}
        $Checks.Add(@{id=$CheckId;title=($Gate+' acceptance child process');status='fail';message=$Message;evidence=@{exitCode=$ChildExit;freshReport=$Fresh}})
        $ChildReports.Add(@{gate=$Gate;status='fail';exitCode=$ChildExit;freshReport=$Fresh;reportFile=[IO.Path]::GetFileName($JsonFile);checks=$SafeChecks;deferredChecks=$DeferredChecks;requiredChecks=$RequiredIds;requiredMissingOrDuplicate=$RequiredMissing;requiredNotPassed=$RequiredNotPassed;checkCounts=@{pass=@($SafeChecks|Where-Object {$_.status -eq 'pass'}).Count;fail=$Failures;incomplete=$Incomplete;deferred=$DeferredChecks.Count}})
        Write-Warning "$CheckId - $Message"
    }
}
function Save-AcceptanceReport{
    $Report.generatedAt=[DateTime]::UtcNow.ToString('o')
    $Report.automatedChecks=@($Checks.ToArray())
    $Report.childReports=@($ChildReports.ToArray())
    $Report.summary=@{}
    foreach($State in @('pass','fail','partial','not_run')){$Report.summary[$State]=@($Checks|Where-Object {$_.status -eq $State}).Count}
    if($Report.summary.fail -gt 0){$Report.status='failed'}
    elseif($Report.summary.partial -gt 0 -or $Report.summary.not_run -gt 0 -or $Checks.Count -eq 0){$Report.status='partial'}
    else{$Report.status='automated_passed_manual_pending'}
    $Report.automatedPassed=($Report.status -eq 'automated_passed_manual_pending')
    # This automated script has no option to silently sign off manual checks.
    $Report.overallFullyAccepted=$false
    New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
    [IO.File]::WriteAllText($ReportPath,($Report|ConvertTo-Json -Depth 14),$Utf8)
    $Rows=($Report.automatedChecks|ForEach-Object{
        $Details=if($_.ContainsKey('message')){$_.message}else{($_.evidence|ConvertTo-Json -Depth 6 -Compress)}
        '<tr><td>'+(Html $_.id)+'</td><td>'+(Html $_.status)+'</td><td>'+(Html $_.title)+'</td><td>'+(Html $Details)+'</td></tr>'
    }) -join "`n"
    $Manual=($ManualChecks|ForEach-Object{'<tr><td>'+(Html $_.id)+'</td><td>pending</td><td>'+(Html $_.title)+'</td><td>'+(Html $_.message)+'</td></tr>'}) -join "`n"
    $ChildTables=($Report.childReports|ForEach-Object{
        $Child=$_
        $Items=if($Child.ContainsKey('checks')){($Child.checks|ForEach-Object{'<tr><td>'+(Html $_.id)+'</td><td>'+(Html $_.status)+'</td><td>'+(Html $_.title)+'</td><td>'+(Html $_.errorCode)+'</td></tr>'}) -join "`n"}else{''}
        $DeferredItems=if($Child.ContainsKey('deferredChecks')){($Child.deferredChecks|ForEach-Object{'<tr><td>'+(Html $_.id)+'</td><td>'+(Html $_.status)+'</td><td>'+(Html $_.deferredTo)+'</td><td>'+(Html $_.reason)+'</td></tr>'}) -join "`n"}else{''}
        $DeferredTable=if($DeferredItems){'<h4>Explicit exclusions from the HTTP gate</h4><p>The original child statuses above remain unchanged. These checks are covered by the named separate gates or remain manual pending.</p><table><tr><th>ID</th><th>Original status</th><th>Separate gate</th><th>Reason</th></tr>'+$DeferredItems+'</table>'}else{''}
        '<h3>'+(Html $Child.gate)+' child: '+(Html $Child.status)+'</h3><p>Exit '+(Html $Child.exitCode)+' / Fresh report '+(Html $Child.freshReport)+' / '+(Html $Child.reportFile)+'</p><table><tr><th>ID</th><th>Status</th><th>Check</th><th>Error code</th></tr>'+$Items+'</table>'+$DeferredTable
    }) -join "`n"
    $Document=@"
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PlayHub Windows PoC acceptance</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#193a32;max-width:1200px;margin:36px auto;padding:0 22px}h1{font-size:28px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #c8d8d2;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf4ef}.notice{background:#fff3d7;border-left:4px solid #c79834;padding:16px}h2{margin-top:32px}code{background:#edf4ef;padding:3px 6px}</style></head><body>
<h1>Windows / IIS PoC acceptance</h1><p><strong>Status: $(Html $Report.status)</strong></p><p>Automated passed: $(Html $Report.automatedPassed) / Overall fully accepted: false</p><p>$(Html $Report.generatedAt) / Run $(Html $RunId)</p>
<p class="notice">$(Html $Report.impact)</p><p>Automatic observations and child tests are recorded only when performed. An absent report, child failure, skipped browser or unexecuted condition is never treated as a pass.</p>
<h2>Automated gates</h2><table><tr><th>ID</th><th>Status</th><th>Check</th><th>Observed evidence / result</th></tr>$Rows</table>
<h2>Child results</h2>$ChildTables
<h2>Manual acceptance remains pending</h2><p>These three checks cannot be signed off by this script. Automated success is <code>automated_passed_manual_pending</code>, not complete service acceptance.</p><table><tr><th>ID</th><th>Status</th><th>Check</th><th>Required observation</th></tr>$Manual</table>
<p>No database restore was performed. Backup/restore CLI regression is handled by the separate Node acceptance suite. Credentials, configuration contents, screenshots, cookies and saved game payloads are not included in this report.</p></body></html>
"@
    [IO.File]::WriteAllText($HtmlPath,$Document,$Utf8)
}

$Marker=$null;$UserSite=$null;$AdminSite=$null;$Ready=$false
try{
    New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
    # Clear the meaning of a previous consolidated success as soon as a run starts.
    [IO.File]::WriteAllText($ReportPath,($Report|ConvertTo-Json -Depth 14),$Utf8)
    $EnvironmentReady=Run-Observation 'POC-WINDOWS' 'Elevated Windows PowerShell 5.1' {
        Safe-Require ($env:OS -eq 'Windows_NT' -and $PSVersionTable.PSEdition -eq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5) 'Run Windows PowerShell 5.1 (powershell.exe), not pwsh, on the installed Windows host.'
        $Principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
        Safe-Require ($Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Run this validation from an elevated Administrator session.'
        $Report.environment.windowsObserved=$true
        return @{platform='Windows';edition='Desktop';powerShell=$PSVersionTable.PSVersion.ToString();administrator=$true}
    }
    Safe-Require $EnvironmentReady 'The required Windows administrator environment was not observed.'
    $MarkerReady=Run-Observation 'POC-MARKER' 'Recorded installation marker' {
        $MarkerPath=Join-Path $InstallRoot 'installation.json'
        Safe-Require (Test-Path -LiteralPath $MarkerPath -PathType Leaf) 'The installation marker is missing.'
        $script:Marker=Get-Content -LiteralPath $MarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Safe-Require ($Marker.product -eq 'playhub-iis-poc') 'The marker belongs to another product.'
        foreach($Name in @('releaseDir','configPath','nodePath','userSite','adminSite','taskName')){Safe-Require ($Marker.PSObject.Properties[$Name] -and [string]$Marker.$Name) 'The marker is missing a required resource identifier.'}
        foreach($Name in @('userPort','adminUiPort','publicPort','adminPort')){Safe-Require ($Marker.PSObject.Properties[$Name] -and [int]$Marker.$Name -ge 1024 -and [int]$Marker.$Name -le 65535) 'The marker contains an invalid service port.'}
        Safe-Require (@($Marker.userPort,$Marker.adminUiPort,$Marker.publicPort,$Marker.adminPort|Select-Object -Unique).Count -eq 4) 'The four recorded service ports are not distinct.'
        Safe-Require ($Marker.userSite -ne $Marker.adminSite) 'The marker does not identify separate user and administrator sites.'
        $Report.installation=@{releaseDir=(Normalize-Path $Marker.releaseDir);userSite=[string]$Marker.userSite;adminSite=[string]$Marker.adminSite;taskName=[string]$Marker.taskName;userPort=[int]$Marker.userPort;adminUiPort=[int]$Marker.adminUiPort;publicPort=[int]$Marker.publicPort;adminPort=[int]$Marker.adminPort}
        return $Report.installation
    }
    Safe-Require $MarkerReady 'A valid installation marker is required to select the actual resources.'
    $IisReady=Run-Observation 'POC-IIS-SITES' 'Two installed IIS sites are running' {
        Import-Module WebAdministration -ErrorAction Stop
        $script:UserSite=Get-Website -Name $Marker.userSite -ErrorAction Stop
        $script:AdminSite=Get-Website -Name $Marker.adminSite -ErrorAction Stop
        Safe-Require ($null -ne $UserSite -and $null -ne $AdminSite) 'One or both recorded IIS sites are missing.'
        Safe-Require ([string]$UserSite.State -eq 'Started' -and [string]$AdminSite.State -eq 'Started') 'Both recorded IIS sites must be Started.'
        return @{user=@{name=[string]$UserSite.Name;state=[string]$UserSite.State};admin=@{name=[string]$AdminSite.Name;state=[string]$AdminSite.State}}
    }
    $PathsReady=Run-Observation 'POC-WEBROOTS' 'Distinct physical web roots match this release' {
        Safe-Require $IisReady 'Observe both IIS sites before validating their physical paths.'
        $UserRoot=Normalize-Path ([string]$UserSite.PhysicalPath);$AdminRoot=Normalize-Path ([string]$AdminSite.PhysicalPath)
        $ExpectedUser=Normalize-Path (Join-Path $Marker.releaseDir 'dist\user');$ExpectedAdmin=Normalize-Path (Join-Path $Marker.releaseDir 'dist\admin')
        Safe-Require ($UserRoot -ieq $ExpectedUser -and $AdminRoot -ieq $ExpectedAdmin) 'The actual IIS physical paths do not match the selected release.'
        Safe-Require (-not (Is-Within $UserRoot $AdminRoot) -and -not (Is-Within $AdminRoot $UserRoot)) 'User and administrator web roots overlap.'
        Safe-Require ((Test-Path -LiteralPath $UserRoot -PathType Container) -and (Test-Path -LiteralPath $AdminRoot -PathType Container)) 'One or both physical web roots do not exist.'
        return @{userPhysicalPath=$UserRoot;adminPhysicalPath=$AdminRoot;overlap=$false}
    }
    $null=Run-Observation 'POC-IIS-BINDINGS' 'User port and loopback-only administrator IIS bindings' {
        Safe-Require $IisReady 'Observe both IIS sites before reading their bindings.'
        $UserBindings=@(Site-Bindings $Marker.userSite);$AdminBindings=@(Site-Bindings $Marker.adminSite)
        Safe-Require (@($UserBindings|Where-Object {$_.port -eq [int]$Marker.userPort -and $_.protocol -eq 'http'}).Count -gt 0) 'The user site has no HTTP binding on its recorded port.'
        Safe-Require (@($AdminBindings|Where-Object {$_.port -eq [int]$Marker.adminUiPort -and $_.protocol -eq 'http'}).Count -gt 0) 'The administrator site has no HTTP binding on its recorded port.'
        Safe-Require ($AdminBindings.Count -gt 0) 'The administrator site has no observed bindings.'
        foreach($Binding in $AdminBindings){Safe-Require (Is-Loopback $Binding.address) 'An administrator IIS binding is not restricted to a loopback IP address.'}
        return @{userBindings=$UserBindings;adminBindings=$AdminBindings;adminLoopbackOnly=$true}
    }
    $null=Run-Observation 'POC-API-LOOPBACK' 'Actual administrator API listening addresses are loopback-only' {
        $Sockets=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$Marker.adminPort) -ErrorAction SilentlyContinue)
        Safe-Require ($Sockets.Count -gt 0) 'No administrator API listening socket was observed.'
        foreach($Socket in $Sockets){Safe-Require (Is-Loopback ([string]$Socket.LocalAddress)) 'The administrator API is listening on a non-loopback address.'}
        return @{port=[int]$Marker.adminPort;sockets=@($Sockets|ForEach-Object{@{address=[string]$_.LocalAddress;port=[int]$_.LocalPort;owningProcess=[int]$_.OwningProcess}});loopbackOnly=$true}
    }
    $null=Run-Observation 'POC-TASK' 'Recorded scheduled API task is Running' {
        $Task=Get-ScheduledTask -TaskPath '\' -TaskName $Marker.taskName -ErrorAction Stop
        Safe-Require ([string]$Task.State -eq 'Running') 'The recorded scheduled API task is not Running.'
        Safe-Require (@($Task.Actions).Count -eq 1) 'The recorded API task has an unexpected action count.'
        Safe-Require ((Normalize-Path ([string]$Task.Actions[0].Execute)) -ieq (Normalize-Path $Marker.nodePath)) 'The running task does not execute the recorded Node.js runtime.'
        return @{taskName=[string]$Task.TaskName;taskPath=[string]$Task.TaskPath;state=[string]$Task.State;recordedNodeExecutableMatches=$true}
    }
    $AclReady=Run-Observation 'POC-CONFIG-ACL' 'Private configuration is outside web roots and has restricted DACLs' {
        Safe-Require $PathsReady 'Validate actual web roots before checking private configuration placement.'
        $ConfigPath=Normalize-Path $Marker.configPath;$ConfigDirectory=Split-Path $ConfigPath -Parent
        Safe-Require (Test-Path -LiteralPath $ConfigPath -PathType Leaf) 'The recorded private configuration file does not exist.'
        Safe-Require (-not (Is-Within $ConfigPath ([string]$UserSite.PhysicalPath)) -and -not (Is-Within $ConfigPath ([string]$AdminSite.PhysicalPath))) 'The private configuration is located inside a public IIS web root.'
        $Allowed=@('S-1-5-32-544','S-1-5-18','S-1-5-19')
        $Mutating=[Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::AppendData -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
        $Evidence=@()
        foreach($Item in @($ConfigDirectory,$ConfigPath)){
            $Acl=Get-Acl -LiteralPath $Item -ErrorAction Stop
            if($Item -eq $ConfigDirectory){Safe-Require $Acl.AreAccessRulesProtected 'The configuration directory still inherits its parent permissions.'}
            $Rules=@($Acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object {$_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow})
            Safe-Require ($Rules.Count -gt 0) 'The configuration DACL has no verifiable allowed access rules.'
            foreach($Rule in $Rules){
                Safe-Require ($Rule.IdentityReference.Value -in $Allowed) 'The configuration DACL permits an identity outside Administrators, SYSTEM or LOCAL SERVICE.'
                if($Rule.IdentityReference.Value -eq 'S-1-5-19'){Safe-Require (([int64]$Rule.FileSystemRights -band [int64]$Mutating) -eq 0) 'LOCAL SERVICE can modify the private configuration.'}
            }
            foreach($RequiredSid in $Allowed){Safe-Require (@($Rules|Where-Object {$_.IdentityReference.Value -eq $RequiredSid}).Count -gt 0) 'A required protected configuration access rule was not observed.'}
            $Evidence+=@{kind=$(if($Item -eq $ConfigDirectory){'directory'}else{'file'});protectedDacl=[bool]$Acl.AreAccessRulesProtected;allowRules=@($Rules|ForEach-Object{@{sid=$_.IdentityReference.Value;rights=[string]$_.FileSystemRights;inherited=[bool]$_.IsInherited}})}
        }
        return @{outsideBothWebRoots=$true;configurationContentsRead=$false;aclObservations=$Evidence}
    }
    $Ready=$true
    Write-Host ''
    Write-Host 'The HTTP check and browser check run independently; administrator password may be requested twice.'
    Write-Host 'No credentials are captured by this aggregate script. No database restore will be executed.'
    Run-ChildGate 'http' (Join-Path $Marker.releaseDir 'scripts\Test-IIS.ps1') (Join-Path $ReportDirectory 'iis-smoke.json') @()
    if($SkipBrowser){
        $Checks.Add(@{id='POC-BROWSER';title='Authenticated browser acceptance';status='not_run';message='Skipped explicitly with -SkipBrowser. The overall result remains partial.'})
        $ChildReports.Add(@{gate='browser';status='not_run';exitCode=$null;freshReport=$false;reportFile='browser-e2e.json'})
    }else{
        $BrowserArguments=@()
        if($InstallTools){$BrowserArguments+='-InstallTools'}
        if($Headed){$BrowserArguments+='-Headed'}
        if($Channel){$BrowserArguments+=@('-Channel',$Channel)}
        if($BrowserExecutable){$BrowserArguments+=@('-BrowserExecutable',$BrowserExecutable)}
        Run-ChildGate 'browser' (Join-Path $Marker.releaseDir 'scripts\Test-Browser.ps1') (Join-Path $ReportDirectory 'browser-e2e.json') $BrowserArguments
    }
}catch{
    $Message='The acceptance run stopped before all requested gates could be executed. Missing results are not a pass.'
    if($_.Exception.Data.Contains('PlayHubSafeMessage')){$Message=$_.Exception.Message}
    $Checks.Add(@{id='POC-PREPARATION';title='Acceptance preparation';status='fail';message=$Message})
    if(-not $Ready){
        $Checks.Add(@{id='POC-HTTP';title='Authenticated HTTP acceptance';status='not_run';message='Preparation did not complete.'})
        $Checks.Add(@{id='POC-BROWSER';title='Authenticated browser acceptance';status='not_run';message='Preparation did not complete.'})
    }
}finally{
    Save-AcceptanceReport
}
Write-Host ''
Write-Host "Acceptance status: $($Report.status)"
Write-Host 'Overall fully accepted: false. Real Google login, another LAN computer and Windows reboot remain manual pending checks.'
Write-Host "JSON report: $ReportPath"
Write-Host "HTML report: $HtmlPath"
if($Report.status -eq 'automated_passed_manual_pending'){exit 0}
if($Report.status -eq 'failed'){exit 1}
exit 2
