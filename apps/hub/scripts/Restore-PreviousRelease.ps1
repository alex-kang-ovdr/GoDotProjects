#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$InstallRoot='C:\PlayHubPoC')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess){throw 'Use 64-bit Windows PowerShell 5.1 for IIS recovery.'}
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$PreviousMarker=Join-Path $InstallRoot 'installation.previous.json'
if(-not(Test-Path $PreviousMarker)){throw 'No previous release is recorded.'}
$Previous=Get-Content $PreviousMarker -Raw -Encoding UTF8|ConvertFrom-Json
if($Previous.product -ne 'playhub-iis-poc'){throw 'Invalid previous installation marker.'}
$Prefix='PlayHubPoC-'+$Previous.userPort
$FirewallName=$Prefix+'-Public-LAN'
$FirewallGroup='PlayHubPoC'
if($Previous.userSite -ne ($Prefix+'-User') -or $Previous.adminSite -ne ($Prefix+'-Admin') -or $Previous.taskName -ne ($Prefix+'-API') -or $Previous.firewallName -ne $FirewallName){throw 'Previous resource names do not match this installation; refusing unrelated changes.'}
if(-not [IO.Path]::GetFullPath($Previous.releaseDir).StartsWith((Join-Path $InstallRoot 'releases').TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'The previous release is outside this installation.'}
if([IO.Path]::GetFullPath($Previous.configPath) -ne (Join-Path $InstallRoot 'config\local.json')){throw 'The previous private configuration is outside the expected path.'}
$PreviousConfig=Join-Path $InstallRoot 'config\previous.json'
if(-not(Test-Path $PreviousConfig)){throw 'No previous configuration snapshot exists.'}
foreach($Relative in @('dist\user\index.html','dist\admin\index.html','server\index.mjs')){if(-not(Test-Path (Join-Path $Previous.releaseDir $Relative) -PathType Leaf)){throw 'The previous release files are missing.'}}
if(-not(Test-Path $Previous.nodePath -PathType Leaf)){throw 'The previous Node.js runtime is missing.'}
$Config=Get-Content $PreviousConfig -Raw -Encoding UTF8|ConvertFrom-Json
if($Config.adminHost -ne '127.0.0.1' -or $Config.publicHost -notin @('127.0.0.1','0.0.0.0')){throw 'Previous configuration is outside the supported HTTP PoC binding profile.'}
if([IO.Path]::GetFullPath($Config.dataDir) -ne (Join-Path $InstallRoot 'data')){throw 'Previous database path is outside this installation.'}
if(Test-Path -LiteralPath (Join-Path $Config.dataDir 'maintenance.lock')){throw 'Database maintenance must be recovered before switching application releases.'}
$PreviousPackage=Get-Content (Join-Path $Previous.releaseDir 'package.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($PreviousPackage.PSObject.Properties.Name -contains 'playhubDatabaseSchemaVersion'){
    if([string]$PreviousPackage.playhubDatabaseSchemaVersion -notmatch '^(0|[1-9][0-9]{0,3})$'){throw 'The previous release has an invalid supported database schema declaration.'}
    $SupportedSchema=[int]$PreviousPackage.playhubDatabaseSchemaVersion
}elseif($PreviousPackage.version -match '^0\.1\.'){$SupportedSchema=0}
else{throw 'The previous release does not declare a known supported database schema. No resources were changed.'}
$DatabaseFile=Join-Path $Config.dataDir 'platform.sqlite'
if(Test-Path -LiteralPath $DatabaseFile -PathType Leaf){
    $SchemaProbe="const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});try{console.log(db.prepare('PRAGMA user_version').get().user_version)}finally{db.close()}"
    $CurrentSchema=& $Previous.nodePath -e $SchemaProbe $DatabaseFile
    if($LASTEXITCODE -ne 0 -or [string]$CurrentSchema -notmatch '^[0-9]+$'){throw 'The current database schema could not be checked. No resources were changed.'}
    if([int]$CurrentSchema -gt $SupportedSchema){throw "Current database schema $CurrentSchema is newer than the previous release supports ($SupportedSchema). Restore the verified pre-update database with the current Restore-Data.ps1 -KeepStopped first, then run this code recovery again. No resources were changed."}
}
Import-Module WebAdministration
foreach($SiteName in @($Previous.userSite,$Previous.adminSite)){
    $OtherPoolUsers=@(Get-Website|Where-Object{$_.applicationPool -eq $SiteName -and $_.Name -ne $SiteName})
    if($OtherPoolUsers.Count -gt 0){throw "Pool $SiteName is shared with another site; recovery will not modify it."}
}
$NamedRules=@(Get-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -ErrorAction SilentlyContinue)
$DisplayRules=@(Get-NetFirewallRule -PolicyStore PersistentStore -DisplayName $FirewallName -ErrorAction SilentlyContinue)
if(@($NamedRules|Where-Object{$_.Group -ne $FirewallGroup}).Count -gt 0 -or @($DisplayRules|Where-Object{$_.Name -ne $FirewallName}).Count -gt 0){throw 'A firewall rule lacks the expected Name/Group ownership; recovery will not remove it.'}
Stop-ScheduledTask -TaskName $Previous.taskName -ErrorAction SilentlyContinue
foreach($SiteName in @($Previous.userSite,$Previous.adminSite)){Stop-Website -Name $SiteName -ErrorAction SilentlyContinue}
Start-Sleep -Seconds 2
Copy-Item $PreviousConfig $Previous.configPath -Force
foreach($SiteName in @($Previous.userSite,$Previous.adminSite)){
    if(Test-Path "IIS:\Sites\$SiteName"){Remove-Website -Name $SiteName}
    if(-not(Test-Path "IIS:\AppPools\$SiteName")){New-WebAppPool -Name $SiteName|Out-Null}
    Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ''
    Set-ItemProperty "IIS:\AppPools\$SiteName" -Name processModel.identityType -Value 4
}
$UserBinding=if($Config.publicHost -eq '127.0.0.1'){'127.0.0.1'}else{'*'}
New-Website -Name $Previous.userSite -Port $Previous.userPort -IPAddress $UserBinding -PhysicalPath (Join-Path $Previous.releaseDir 'dist\user') -ApplicationPool $Previous.userSite|Out-Null
New-Website -Name $Previous.adminSite -Port $Previous.adminUiPort -IPAddress '127.0.0.1' -PhysicalPath (Join-Path $Previous.releaseDir 'dist\admin') -ApplicationPool $Previous.adminSite|Out-Null
foreach($SiteName in @($Previous.userSite,$Previous.adminSite)){
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name userName -Value ''
    Start-Website -Name $SiteName
}
$Action=New-ScheduledTaskAction -Execute $Previous.nodePath -Argument ('"'+(Join-Path $Previous.releaseDir 'server\index.mjs')+'" --config "'+$Previous.configPath+'"') -WorkingDirectory $Previous.releaseDir
$Principal=New-ScheduledTaskPrincipal -UserId 'LOCALSERVICE' -LogonType ServiceAccount -RunLevel Limited
$Settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Previous.taskName -Action $Action -Principal $Principal -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $Settings -Force|Out-Null
# Restore the previous sharing mode, not merely the previous code/configuration.
if($NamedRules.Count -gt 0){Remove-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName}
if($Config.publicHost -eq '0.0.0.0'){
    New-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -Group $FirewallGroup -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort @($Previous.userPort,$Previous.publicPort) -RemoteAddress LocalSubnet -Profile Private,Domain|Out-Null
}
Start-ScheduledTask -TaskName $Previous.taskName
Copy-Item $PreviousMarker (Join-Path $InstallRoot 'installation.json') -Force
$Healthy=$false
for($Attempt=0;$Attempt -lt 15;$Attempt++){
    try{$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Previous.publicPort)/api/health" -TimeoutSec 2;if($Health.ok -and $Health.service -eq 'public'){$Healthy=$true;break}}catch{}
    Start-Sleep -Seconds 1
}
if(-not $Healthy){throw 'Previous release was selected, but API health did not recover. Inspect its scheduled task before reporting recovery complete.'}
Write-Host 'Previous HTTP application, configuration and owned LAN firewall policy restored. User data was preserved; run Test-IIS.ps1 for the complete IIS service check.'
