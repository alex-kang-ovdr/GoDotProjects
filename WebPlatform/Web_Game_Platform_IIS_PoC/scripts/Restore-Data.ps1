#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding(DefaultParameterSetName='Backup')]
param(
    [string]$InstallRoot='C:\PlayHubPoC',
    [Parameter(Mandatory=$true,ParameterSetName='Backup')][string]$BackupPath,
    [Parameter(Mandatory=$true,ParameterSetName='Interrupted')][switch]$RecoverInterrupted,
    [Parameter(ParameterSetName='Backup')][switch]$VerifyOnly,
    [switch]$KeepStopped
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess){throw 'Use 64-bit Windows PowerShell 5.1 for installed IIS data recovery.'}
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
$Prefix='PlayHubPoC-'+$Marker.userPort
if($Marker.taskName -ne ($Prefix+'-API') -or $Marker.userSite -ne ($Prefix+'-User') -or $Marker.adminSite -ne ($Prefix+'-Admin')){throw 'Installation resource ownership does not match the recorded prefix.'}
if([IO.Path]::GetFullPath($Marker.configPath) -ne (Join-Path $InstallRoot 'config\local.json')){throw 'The private configuration is outside this installation.'}
if(-not [IO.Path]::GetFullPath($Marker.releaseDir).StartsWith((Join-Path $InstallRoot 'releases').TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'The active release is outside this installation.'}
$Config=Get-Content $Marker.configPath -Encoding UTF8 -Raw|ConvertFrom-Json
$DataDirectory=[IO.Path]::GetFullPath($Config.dataDir)
if($DataDirectory -ne (Join-Path $InstallRoot 'data')){throw 'Installed recovery requires the recorded data directory inside InstallRoot.'}
$Tool=Join-Path $Marker.releaseDir 'tools\restore-data.mjs'
if(-not(Test-Path -LiteralPath $Tool -PathType Leaf)){throw 'This release does not contain the data restoration tool. Update to version 0.2.0 or newer first.'}
$Reports=Join-Path $InstallRoot 'reports'
New-Item -ItemType Directory -Force -Path $Reports|Out-Null
$Stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$NodeReportPath=Join-Path $Reports ('data-restore-'+$Stamp+'.json')
$WindowsReportPath=Join-Path $Reports 'data-restore-iis-latest.json'
$BaseArgs=@($Tool,'--config',$Marker.configPath)
if(-not $RecoverInterrupted){
    $BackupPath=[IO.Path]::GetFullPath($BackupPath)
    & $Marker.nodePath @BaseArgs --from $BackupPath --report $NodeReportPath
    if($LASTEXITCODE -ne 0){throw 'Backup verification failed; services and data were not changed. See the restoration report.'}
    if($VerifyOnly){Write-Host "Verified without stopping the service: $NodeReportPath";return}
}
Import-Module WebAdministration
$Task=Get-ScheduledTask -TaskName $Marker.taskName -TaskPath '\'
$ExpectedArguments='"'+(Join-Path $Marker.releaseDir 'server\index.mjs')+'" --config "'+$Marker.configPath+'"'
if(@($Task.Actions).Count -ne 1 -or [IO.Path]::GetFullPath($Task.Actions[0].Execute) -ne [IO.Path]::GetFullPath($Marker.nodePath) -or $Task.Actions[0].Arguments -ne $ExpectedArguments){throw 'The scheduled task does not run this installation. No service was stopped.'}
$WasEnabled=[bool]$Task.Settings.Enabled
$WasRunning=$Task.State -eq 'Running'
$SiteStates=@{}
foreach($SiteName in @($Marker.userSite,$Marker.adminSite)){
    $Site=Get-Website -Name $SiteName
    $ExpectedRoot=if($SiteName -eq $Marker.userSite){Join-Path $Marker.releaseDir 'dist\user'}else{Join-Path $Marker.releaseDir 'dist\admin'}
    if([IO.Path]::GetFullPath($Site.physicalPath) -ne [IO.Path]::GetFullPath($ExpectedRoot)){throw 'An IIS site is not owned by the active release. No service was stopped.'}
    $SiteStates[$SiteName]=$Site.State -eq 'Started'
}
function Set-RecoveryDirectoryAcl([string]$Directory){
    New-Item -ItemType Directory -Force -Path $Directory|Out-Null
    if((Get-Item -LiteralPath $Directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Recovery directory must not be a link or junction.'}
    $Acl=New-Object System.Security.AccessControl.DirectorySecurity
    $Acl.SetAccessRuleProtection($true,$false)
    foreach($SidText in @('S-1-5-32-544','S-1-5-18')){
        $Identity=New-Object System.Security.Principal.SecurityIdentifier($SidText)
        $Rule=New-Object System.Security.AccessControl.FileSystemAccessRule($Identity,[System.Security.AccessControl.FileSystemRights]::FullControl,([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)
        $Acl.AddAccessRule($Rule)
    }
    Set-Acl -LiteralPath $Directory -AclObject $Acl
    if(@(Get-ChildItem -LiteralPath $Directory -Force).Count -gt 0){
        & icacls.exe (Join-Path $Directory '*') /reset /T /C|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Unable to restrict retained recovery files to administrators and SYSTEM.'}
    }
}
function Reset-DatabaseFileAcl {
    # A candidate moved out of the protected recovery directory must regain the
    # private data directory's LOCALSERVICE permission before the API can open it.
    $AllowedSids=@('S-1-5-32-544','S-1-5-18','S-1-5-19')
    $DataAcl=Get-Acl -LiteralPath $DataDirectory
    if(-not $DataAcl.AreAccessRulesProtected){throw 'The data directory still inherits permissions; repair installation ACLs before starting the API.'}
    foreach($Rule in $DataAcl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){
        if($Rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $Rule.IdentityReference.Value -notin $AllowedSids){throw 'The data directory contains an unexpected access grant.'}
    }
    foreach($Suffix in @('','-wal','-shm','-journal')){
        $File=Join-Path $DataDirectory ('platform.sqlite'+$Suffix)
        if(Test-Path -LiteralPath $File){& icacls.exe $File /reset|Out-Null;if($LASTEXITCODE -ne 0){throw 'Unable to restore the private runtime database permissions.'}}
    }
}
function Wait-ApiStopped {
    for($Attempt=0;$Attempt -lt 40;$Attempt++){
        $Listening=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object{$_.LocalPort -in @([int]$Config.publicPort,[int]$Config.adminPort)})
        if($Listening.Count -eq 0){return}
        Start-Sleep -Milliseconds 250
    }
    throw 'The API ports remain in use. No unrelated process was terminated and no database was replaced.'
}
function Wait-ApiHealthy {
    for($Attempt=0;$Attempt -lt 20;$Attempt++){
        try{
            $Public=Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.publicPort)/api/health" -TimeoutSec 2
            $Admin=Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.adminPort)/api/health" -TimeoutSec 2
            if($Public.ok -and $Public.service -eq 'public' -and $Admin.ok -and $Admin.service -eq 'admin'){return}
        }catch{}
        Start-Sleep -Seconds 1
    }
    throw 'The restored API did not become healthy. Data and recovery files were retained; inspect the scheduled task.'
}
$Stopped=$false;$ApplyAttempted=$false;$NodeResult=$null;$Failure=$null;$RuntimeReady=$false;$FullIisCheck=$false;$RestartAllowed=$false
try{
    Set-RecoveryDirectoryAcl (Join-Path $DataDirectory 'recovery')
    # Disable startup/restart triggers for the entire file replacement window.
    Disable-ScheduledTask -TaskName $Marker.taskName -TaskPath '\'|Out-Null
    $Stopped=$true
    Stop-ScheduledTask -TaskName $Marker.taskName -TaskPath '\'
    foreach($SiteName in @($Marker.userSite,$Marker.adminSite)){if($SiteStates[$SiteName]){Stop-Website -Name $SiteName}}
    Wait-ApiStopped
    $ApplyArgs=@($BaseArgs)
    if($RecoverInterrupted){$ApplyArgs+=@('--rollback-interrupted')}else{$ApplyArgs+=@('--from',$BackupPath)}
    $ApplyArgs+=@('--apply','--report',$NodeReportPath)
    $ApplyAttempted=$true
    & $Marker.nodePath @ApplyArgs
    $NodeExit=$LASTEXITCODE
    if(Test-Path -LiteralPath $NodeReportPath){$NodeResult=Get-Content $NodeReportPath -Encoding UTF8 -Raw|ConvertFrom-Json}
    $RestartAllowed=($null -ne $NodeResult -and $NodeResult.mode -ne 'verify' -and [bool]$NodeResult.serviceRestartAllowed -and -not(Test-Path -LiteralPath (Join-Path $DataDirectory 'maintenance.lock')))
    if(-not $RestartAllowed){throw 'Recovery is incomplete or the original database remains damaged. The scheduled task and sites are left stopped. See the report and maintenance.lock.'}
    Reset-DatabaseFileAcl
    if($NodeExit -ne 0 -or -not $NodeResult.ok){throw 'Data replacement failed and the original was recovered. See the report; the prior running service will be resumed.'}
}catch{$Failure=$_}
finally{
    if($Stopped){
        if(-not $ApplyAttempted -and -not(Test-Path -LiteralPath (Join-Path $DataDirectory 'maintenance.lock'))){$RestartAllowed=$true}
        if($RestartAllowed -and -not $KeepStopped){
            try{
                if($ApplyAttempted){Reset-DatabaseFileAcl}
                if($WasEnabled){Enable-ScheduledTask -TaskName $Marker.taskName -TaskPath '\'|Out-Null}
                $ShouldStart=$WasRunning -or ($WasEnabled -and $null -ne $NodeResult -and [bool]$NodeResult.ok)
                if($ShouldStart){Start-ScheduledTask -TaskName $Marker.taskName -TaskPath '\';Wait-ApiHealthy;$RuntimeReady=$true}
                foreach($SiteName in @($Marker.userSite,$Marker.adminSite)){if($SiteStates[$SiteName]){Start-Website -Name $SiteName}}
                if($RuntimeReady -and $SiteStates[$Marker.userSite] -and $SiteStates[$Marker.adminSite]){
                    $SmokeStarted=[DateTime]::UtcNow
                    & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Marker.releaseDir 'scripts\Test-IIS.ps1') -InstallRoot $InstallRoot
                    if($LASTEXITCODE -ne 0){throw 'The restored service failed its separate IIS HTTP check. See iis-smoke.json.'}
                    $SmokeReportPath=Join-Path $Reports 'iis-smoke.json'
                    if(-not(Test-Path -LiteralPath $SmokeReportPath)){throw 'The IIS HTTP check did not produce a report.'}
                    $SmokeReport=Get-Content $SmokeReportPath -Encoding UTF8 -Raw|ConvertFrom-Json
                    if(-not $SmokeReport.ok -or [DateTime]::Parse($SmokeReport.generatedAt).ToUniversalTime() -lt $SmokeStarted -or -not $SmokeReport.environment.iisTargetDeclared){throw 'The IIS HTTP result is stale, unsuccessful, or not marked as this IIS target.'}
                    $FullIisCheck=$true
                }
            }catch{
                if($null -eq $Failure){$Failure=$_}else{Write-Warning ('The recovery restart check also failed: '+$_.Exception.Message)}
            }
        }elseif($KeepStopped -and $RestartAllowed){Write-Host 'Data recovery finished with -KeepStopped. The API task remains disabled and sites remain stopped for the next release-recovery step.'}
        else{Write-Warning 'API task and sites remain stopped. Do not remove maintenance.lock without explicit recovery.'}
    }
    $WindowsReport=@{schemaVersion=1;tool='Restore-Data.ps1';appVersion='0.2.0';finishedAt=[DateTime]::UtcNow.ToString('o');windowsExecuted=$true;ok=($null -eq $Failure);nodeReport=$NodeReportPath;dataApplied=($null -ne $NodeResult -and [bool]$NodeResult.applied);apiHealth=$RuntimeReady;iisSmoke=$FullIisCheck;restartAllowed=$RestartAllowed;keptStopped=[bool]$KeepStopped;wasEnabled=$WasEnabled;wasRunning=$WasRunning}
    $Encoding=New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($WindowsReportPath,($WindowsReport|ConvertTo-Json -Depth 6)+[Environment]::NewLine,$Encoding)
}
Write-Host "Data operation report: $NodeReportPath"
Write-Host "Windows operation report: $WindowsReportPath"
if($null -ne $Failure){throw $Failure}
Write-Host 'Database recovery completed. Retained originals remain in the protected data\recovery directory. Google and administrator accounts must sign in again.'
