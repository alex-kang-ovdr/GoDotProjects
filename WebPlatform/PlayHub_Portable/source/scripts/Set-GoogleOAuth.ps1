#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$InstallRoot='C:\PlayHubPoC',[Parameter(Mandatory=$true)][string]$ClientId,[string]$RedirectUri='')
$ErrorActionPreference='Stop'
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
if(-not $RedirectUri){$RedirectUri="http://localhost:$($Marker.publicPort)/api/auth/google/callback"}
$Uri=[Uri]$RedirectUri
if($Uri.AbsolutePath -ne '/api/auth/google/callback' -or $Uri.Query -or $Uri.Fragment){throw 'The redirect URI must end with /api/auth/google/callback and contain no query or fragment.'}
if($Uri.Scheme -ne 'https' -and -not($Uri.Scheme -eq 'http' -and $Uri.Host -in @('localhost','127.0.0.1','[::1]','::1'))){throw 'Google web redirects require HTTPS, except on localhost.'}
$Config=Get-Content $Marker.configPath -Encoding UTF8 -Raw|ConvertFrom-Json
$Secret=Read-Host 'Google OAuth client secret (kept only in the private server configuration)' -AsSecureString
$Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
try{$ClientSecret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)}
if(-not $ClientSecret){throw 'A client secret is required.'}
$Config.google.clientId=$ClientId
$Config.google.clientSecret=$ClientSecret
$Config.google.redirectUri=$RedirectUri
$Temporary=$Marker.configPath+'.new'
$Serialized=$Config|ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($Temporary,$Serialized,(New-Object Text.UTF8Encoding($false)))
Move-Item $Temporary $Marker.configPath -Force
$ClientSecret=$null;$Serialized=$null
Write-Host 'Google OAuth settings saved. Register this exact redirect URI in your Google web client:'
Write-Host $RedirectUri
Write-Host 'Open the user site using the same hostname. LAN IP addresses cannot use a localhost callback on a different PC.'
& (Join-Path $PSScriptRoot 'Restart-API.ps1') -InstallRoot $InstallRoot
