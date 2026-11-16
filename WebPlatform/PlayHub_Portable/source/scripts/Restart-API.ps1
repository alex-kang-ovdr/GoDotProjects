#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$InstallRoot='C:\PlayHubPoC')
$ErrorActionPreference='Stop'
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
Stop-ScheduledTask -TaskName $Marker.taskName
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $Marker.taskName
Write-Host 'API restart requested. Run Test-IIS.ps1 to verify service readiness.'
