#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$InstallRoot='C:\PlayHubPoC')
$ErrorActionPreference='Stop'
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
Import-Module WebAdministration
Stop-ScheduledTask -TaskName $Marker.taskName
Stop-Website -Name $Marker.userSite
Stop-Website -Name $Marker.adminSite
Write-Host 'PlayHub user site, administrator site and API have been stopped. Data and installation files were preserved.'
