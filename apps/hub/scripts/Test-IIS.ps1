#Requires -Version 5.1
[CmdletBinding()]
param([string]$InstallRoot='C:\PlayHubPoC',[switch]$WithAdmin)
$ErrorActionPreference='Stop'
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
$Config=Get-Content $Marker.configPath -Encoding UTF8 -Raw | ConvertFrom-Json
$Report=Join-Path $InstallRoot 'reports\iis-smoke.json'
$SmokeArgs=@((Join-Path $Marker.releaseDir 'tools\smoke.mjs'),'--user',"http://127.0.0.1:$($Marker.userPort)",'--admin',"http://127.0.0.1:$($Marker.adminUiPort)",'--public-api',"http://127.0.0.1:$($Marker.publicPort)",'--admin-api',"http://127.0.0.1:$($Marker.adminPort)",'--report',$Report,'--iis')
$Credentials=@{}
if($WithAdmin){
    $SecurePassword=Read-Host 'Administrator password for the authenticated API check' -AsSecureString
    $Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    try{$Credentials=@{username=$Config.admin.username;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)}
}
$OldEncoding=$OutputEncoding
try{$OutputEncoding=New-Object System.Text.UTF8Encoding($false);($Credentials|ConvertTo-Json -Compress)|& $Marker.nodePath @SmokeArgs;$SmokeExit=$LASTEXITCODE}finally{$OutputEncoding=$OldEncoding;$Credentials=@{}}
Write-Host "Report: $Report"
if($SmokeExit -ne 0){throw 'One or more service checks failed. See the report.'}
