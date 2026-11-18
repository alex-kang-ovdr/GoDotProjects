#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$InstallRoot = 'C:\PlayHubPoC',
    [string]$ShareHost = '',
    [ValidateRange(1024,65535)][int]$UserPort = 8080,
    [ValidateRange(1024,65535)][int]$AdminUiPort = 8081,
    [ValidateRange(1024,65535)][int]$PublicApiPort = 8090,
    [ValidateRange(1024,65535)][int]$AdminApiPort = 8091,
    [string]$NodePath = '',
    [switch]$LocalOnly,
    [switch]$ResetAdminPassword,
    [switch]$SkipFeatureInstall
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($PSVersionTable.PSEdition -ne 'Desktop') { throw 'Run this installer with Windows PowerShell 5.1 (powershell.exe), not pwsh.' }
if (-not [Environment]::Is64BitProcess) { throw 'Use the 64-bit Windows PowerShell executable for IIS installation.' }
if (@($UserPort,$AdminUiPort,$PublicApiPort,$AdminApiPort | Select-Object -Unique).Count -ne 4) { throw 'The four ports must be different.' }
$SourceRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if ($InstallRoot -match '[%&!"<>|]' -or $InstallRoot.Length -lt 6) { throw 'Choose an installation path without shell metacharacters.' }
if ($InstallRoot.TrimEnd('\') -eq $SourceRoot.TrimEnd('\')) { throw 'The installation directory must differ from the extracted source directory.' }
if ($InstallRoot.StartsWith($SourceRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'The installation directory must not be inside the extracted source directory; that would recursively copy the release into itself.' }
$MarkerPath = Join-Path $InstallRoot 'installation.json'
$PendingMarkerPath = Join-Path $InstallRoot 'installation.pending.json'
$Existing = $null
$ExistingConfig = $null
$PreserveExistingOrigins = $false
if (Test-Path $MarkerPath) {
    $Existing = Get-Content $MarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Existing.product -ne 'playhub-iis-poc') { throw 'This folder belongs to another application.' }
} elseif ((Test-Path $InstallRoot) -and @(Get-ChildItem $InstallRoot -Force).Count -gt 0) {
    if (-not (Test-Path $PendingMarkerPath)) { throw 'The destination is not empty and is not a PlayHub installation. Choose a new folder.' }
    $Pending = Get-Content $PendingMarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Pending.product -ne 'playhub-iis-poc' -or [IO.Path]::GetFullPath($Pending.installRoot).TrimEnd('\') -ne $InstallRoot.TrimEnd('\')) { throw 'The unfinished installation marker does not belong to this destination.' }
    Write-Host 'Retrying this installer-owned staging directory. Existing data files will be preserved.'
}
if ($Existing) {
    if (-not $PSBoundParameters.ContainsKey('UserPort')) { $UserPort = [int]$Existing.userPort }
    if (-not $PSBoundParameters.ContainsKey('AdminUiPort')) { $AdminUiPort = [int]$Existing.adminUiPort }
    if (-not $PSBoundParameters.ContainsKey('PublicApiPort')) { $PublicApiPort = [int]$Existing.publicPort }
    if (-not $PSBoundParameters.ContainsKey('AdminApiPort')) { $AdminApiPort = [int]$Existing.adminPort }
    if (@($UserPort,$AdminUiPort,$PublicApiPort,$AdminApiPort | Select-Object -Unique).Count -ne 4 -or @($UserPort,$AdminUiPort,$PublicApiPort,$AdminApiPort | Where-Object { $_ -lt 1024 -or $_ -gt 65535 }).Count -gt 0) { throw 'The recorded installation ports are invalid.' }
}
if ($Existing -and ($Existing.userPort -ne $UserPort -or $Existing.adminUiPort -ne $AdminUiPort -or $Existing.publicPort -ne $PublicApiPort -or $Existing.adminPort -ne $AdminApiPort)) {
    throw 'For an existing installation, keep its recorded ports or use a different installation directory.'
}
if ($Existing) {
    if (-not (Test-Path $Existing.configPath -PathType Leaf)) { throw 'The existing private configuration is missing. Restore it before updating.' }
    $ExistingConfig = Get-Content $Existing.configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $PreviousLocalOnly = ($ExistingConfig.publicHost -eq '127.0.0.1')
    if (-not $PSBoundParameters.ContainsKey('LocalOnly')) { $LocalOnly = ($ExistingConfig.publicHost -eq '127.0.0.1') }
    $SharingModeChanged = ([bool]$LocalOnly -ne $PreviousLocalOnly)
    if (-not $PSBoundParameters.ContainsKey('ShareHost')) {
        if ($SharingModeChanged) { $ShareHost = if ($LocalOnly) { 'localhost' } else { '' } }
        else { $ShareHost = $Existing.shareHost }
    }
    $PreserveExistingOrigins = (-not $PSBoundParameters.ContainsKey('ShareHost') -and -not $SharingModeChanged)
    # This installer reconstructs HTTP PoC bindings; it cannot preserve manually added HTTPS bindings/certificates.
    if ($ExistingConfig.secureCookies -or $ExistingConfig.userBaseUrl -match '^https:' -or $ExistingConfig.publicBaseUrl -match '^https:') { throw 'This installer manages HTTP PoC sites only. An existing HTTPS/custom-proxy installation requires its own deployment procedure; no settings have been changed.' }
}
if (-not $ShareHost) {
    if ($LocalOnly) { $ShareHost = 'localhost' }
    else {
        $Candidate = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
        if ($Candidate) { $ShareHost = $Candidate.IPv4Address[0].IPAddress } else { $ShareHost = 'localhost' }
    }
}
if ($ShareHost -notmatch '^[A-Za-z0-9.-]+$' -or $ShareHost.Contains('..')) { throw 'ShareHost must be a hostname or IPv4 address without http:// or a port.' }
$Prefix = 'PlayHubPoC-' + $UserPort
$UserSite = $Prefix + '-User'
$AdminSite = $Prefix + '-Admin'
$TaskName = $Prefix + '-API'
$FirewallName = $Prefix + '-Public-LAN'
$FirewallGroup = 'PlayHubPoC'
$ConfigDir = Join-Path $InstallRoot 'config'
$DataDir = Join-Path $InstallRoot 'data'
$ReportDir = Join-Path $InstallRoot 'reports'
$RuntimeDir = Join-Path $InstallRoot 'runtime'
$ConfigPath = Join-Path $ConfigDir 'local.json'
if (Test-Path -LiteralPath (Join-Path $DataDir 'maintenance.lock')) { throw 'Database maintenance is active or interrupted. Recover it with Restore-Data.ps1 before installing another release.' }
if ($Existing -and [IO.Path]::GetFullPath($Existing.configPath) -ne $ConfigPath) { throw 'The recorded private configuration is outside this installation.' }
$SourcePackage = Get-Content (Join-Path $SourceRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if ($SourcePackage.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$' -or -not ($SourcePackage.PSObject.Properties.Name -contains 'playhubDatabaseSchemaVersion')) { throw 'The release package does not declare its version and supported database schema.' }
if ([string]$SourcePackage.playhubDatabaseSchemaVersion -notmatch '^(0|[1-9][0-9]{0,3})$') { throw 'The release package database schema declaration is invalid.' }
$ReleaseDir = Join-Path (Join-Path $InstallRoot 'releases') ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
Write-Host "Installing user site at http://${ShareHost}:$UserPort"
Write-Host "Administrator site stays local: http://localhost:$AdminUiPort"

if (-not $SkipFeatureInstall) {
    Write-Host 'Checking IIS static hosting and management features...'
    $WindowsKind = (Get-CimInstance Win32_OperatingSystem).ProductType
    if ($WindowsKind -eq 1) {
        $FeatureNames = @('IIS-WebServerRole','IIS-StaticContent','IIS-DefaultDocument','IIS-HttpErrors','IIS-HttpLogging','IIS-RequestFiltering','IIS-ManagementConsole','IIS-ManagementScriptingTools')
        $MissingFeatures = @($FeatureNames | Where-Object { (Get-WindowsOptionalFeature -Online -FeatureName $_).State -ne 'Enabled' })
        if ($MissingFeatures.Count -gt 0) {
            $FeatureResult = Enable-WindowsOptionalFeature -Online -FeatureName $MissingFeatures -All -NoRestart
            if (@($FeatureResult | Where-Object { $_.RestartNeeded }).Count -gt 0) { throw 'IIS features require a Windows restart. Restart, then run this installer again.' }
        }
    } else {
        $FeatureResult = Install-WindowsFeature Web-Server,Web-Static-Content,Web-Default-Doc,Web-Http-Errors,Web-Http-Logging,Web-Filtering,Web-Mgmt-Console,Web-Scripting-Tools -IncludeManagementTools
        if ($FeatureResult.RestartNeeded -eq 'Yes') { throw 'Restart Windows, then run this installer again.' }
    }
}
Import-Module WebAdministration
foreach ($SiteName in @($UserSite,$AdminSite)) {
    if ((Test-Path "IIS:\Sites\$SiteName") -and -not $Existing) { throw "A site named $SiteName already exists and is not owned by this installation." }
    if ((Test-Path "IIS:\AppPools\$SiteName") -and -not $Existing) { throw "An application pool named $SiteName already exists. This installer will not modify another application's pool." }
    $OtherPoolUsers = @(Get-Website | Where-Object { $_.applicationPool -eq $SiteName -and $_.Name -ne $SiteName })
    if ($OtherPoolUsers.Count -gt 0) { throw "Application pool $SiteName is shared with another site; this installer requires dedicated pools." }
}
foreach ($Task in @(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    if (-not $Existing) { throw "A scheduled task named $TaskName already exists." }
}
$NamedFirewallRules = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -ErrorAction SilentlyContinue)
$DisplayFirewallRules = @(Get-NetFirewallRule -PolicyStore PersistentStore -DisplayName $FirewallName -ErrorAction SilentlyContinue)
if (-not $Existing -and ($NamedFirewallRules.Count -gt 0 -or $DisplayFirewallRules.Count -gt 0)) { throw "A firewall rule named/displayed as $FirewallName already exists. This installer will not replace it." }
if ($Existing) {
    if ($Existing.userSite -ne $UserSite -or $Existing.adminSite -ne $AdminSite -or $Existing.taskName -ne $TaskName -or $Existing.firewallName -ne $FirewallName) { throw 'Existing resource names do not match this installation. Refusing to modify unrelated resources.' }
    if (@($NamedFirewallRules | Where-Object { $_.Group -ne $FirewallGroup }).Count -gt 0 -or @($DisplayFirewallRules | Where-Object { $_.Name -ne $FirewallName }).Count -gt 0) { throw 'An existing firewall rule lacks the expected PlayHub Name/Group ownership. Review it manually before updating.' }
}
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
if (-not $Existing) { @{product='playhub-iis-poc';installRoot=$InstallRoot;startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $PendingMarkerPath -Encoding UTF8 }
foreach ($Directory in @($ConfigDir,$DataDir,$ReportDir,$RuntimeDir,$ReleaseDir)) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }

# Configuration is outside both IIS web roots. Only administrators, SYSTEM and the API service identity read it.
& icacls.exe $ConfigDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)R' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to protect the configuration directory.' }
& icacls.exe $DataDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to set API data permissions.' }

if (-not $NodePath -and $Existing -and (Test-Path $Existing.nodePath -PathType Leaf)) { $NodePath = $Existing.nodePath }
if (-not $NodePath) {
    Write-Host 'Downloading a private Node.js 24 runtime from nodejs.org; no npm packages are required.'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $Distribution = 'https://nodejs.org/dist/latest-v24.x/'
    $Sums = (Invoke-WebRequest -UseBasicParsing -Uri ($Distribution + 'SHASUMS256.txt')).Content
    $Match = [regex]::Match($Sums, '(?m)^([0-9a-f]{64})\s+(node-v24\.[0-9]+\.[0-9]+-win-' + $Architecture + '\.zip)\s*$')
    if (-not $Match.Success) { throw 'Could not resolve the official Node.js 24 Windows archive.' }
    $ArchiveName = $Match.Groups[2].Value
    $ArchivePath = Join-Path $RuntimeDir $ArchiveName
    Invoke-WebRequest -UseBasicParsing -Uri ($Distribution + $ArchiveName) -OutFile $ArchivePath
    if ((Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Match.Groups[1].Value) { throw 'Node.js archive SHA-256 verification failed.' }
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $RuntimeDir -Force
    $NodePath = Join-Path (Join-Path $RuntimeDir ([IO.Path]::GetFileNameWithoutExtension($ArchiveName))) 'node.exe'
}
if (-not (Test-Path $NodePath -PathType Leaf)) { throw 'NodePath does not name node.exe.' }
$NodeMajor = & $NodePath -p 'process.versions.node.match(/[0-9]+/)[0]'
if ($LASTEXITCODE -ne 0 -or [int]$NodeMajor -lt 24) { throw 'Node.js 24 or later is required.' }
& $NodePath -e "import('node:sqlite')"
if ($LASTEXITCODE -ne 0) { throw 'This Node.js installation does not include node:sqlite.' }

Write-Host 'Preparing an isolated application release...'
foreach ($Item in Get-ChildItem -LiteralPath $SourceRoot -Force) {
    if ($Item.Name -in @('data','dist','node_modules','reports','.git')) { continue }
    Copy-Item -LiteralPath $Item.FullName -Destination $ReleaseDir -Recurse -Force
}
$StagedConfig = Join-Path $ConfigDir ('staged-' + [Guid]::NewGuid().ToString('N') + '.json')
if (Test-Path $ConfigPath) { Copy-Item $ConfigPath $StagedConfig }
$SecretPlain = $null
if (-not (Test-Path $ConfigPath) -or $ResetAdminPassword) {
    $SecretValue = Read-Host 'Set administrator password (at least 12 characters)' -AsSecureString
    $SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecretValue)
    try { $SecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
}
$AdminUsername = if ($ExistingConfig) { $ExistingConfig.admin.username } else { 'admin' }
$SetupSettings = @{shareHost=$ShareHost;userPort=$UserPort;adminUiPort=$AdminUiPort;publicPort=$PublicApiPort;adminPort=$AdminApiPort;dataDir=$DataDir;localOnly=[bool]$LocalOnly;adminUsername=$AdminUsername}
if ($SecretPlain) { $SetupSettings.adminPassword = $SecretPlain }
$SetupJson = $SetupSettings | ConvertTo-Json -Compress
$PreviousOutputEncoding = $OutputEncoding
try {
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $SetupJson | & $NodePath (Join-Path $ReleaseDir 'tools\setup.mjs') --config $StagedConfig
    if ($LASTEXITCODE -ne 0) { throw 'Application configuration failed.' }
} finally { $OutputEncoding = $PreviousOutputEncoding; $SecretPlain = $null; $SetupJson = $null; $SetupSettings.Remove('adminPassword') }
if ($ExistingConfig) {
    $PreparedConfig = Get-Content $StagedConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    $PreparedConfig.secureCookies = $ExistingConfig.secureCookies
    $PreparedConfig.searchIndexingEnabled = $ExistingConfig.searchIndexingEnabled
    if ($PreserveExistingOrigins) {
        foreach ($Setting in @('userOrigins','adminOrigins','publicBaseUrl','userBaseUrl','adminBaseUrl')) { $PreparedConfig.$Setting = $ExistingConfig.$Setting }
    }
    [IO.File]::WriteAllText($StagedConfig,($PreparedConfig | ConvertTo-Json -Depth 20),(New-Object Text.UTF8Encoding($false)))
    $PreparedConfig = $null
}
& $NodePath (Join-Path $ReleaseDir 'tools\build.mjs') --config $StagedConfig
if ($LASTEXITCODE -ne 0) { throw 'Static build failed. The existing installation has not been switched.' }
& $NodePath (Join-Path $ReleaseDir 'tools\verify.mjs') --root $ReleaseDir
if ($LASTEXITCODE -ne 0) { throw 'Package verification failed. The existing installation has not been switched.' }

if ($Existing -and (Test-Path -LiteralPath (Join-Path $DataDir 'platform.sqlite') -PathType Leaf)) {
    Write-Host 'Creating a verified online database backup before this update...'
    & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $SourceRoot 'scripts\Backup-Data.ps1') -InstallRoot $InstallRoot
    if ($LASTEXITCODE -ne 0) { throw 'The pre-update database backup failed. The existing application was not switched.' }
}

$BackupConfig = Join-Path $ConfigDir 'previous.json'
if (Test-Path $ConfigPath) { Copy-Item $ConfigPath $BackupConfig -Force }
if ($Existing) { Copy-Item $MarkerPath (Join-Path $InstallRoot 'installation.previous.json') -Force }
$CreatedSites = @()
$CreatedPools = @()
$TaskCreated = $false
$FirewallCreated = $false
try {
if ($Existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    foreach ($SiteName in @($UserSite,$AdminSite)) { Stop-Website -Name $SiteName -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
foreach ($Port in @($UserPort,$AdminUiPort,$PublicApiPort,$AdminApiPort)) {
    # HTTP.sys may retain a listening socket while this installation's IIS sites are stopped.
    if ($Existing -and $Port -in @($UserPort,$AdminUiPort)) { continue }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is in use. Choose free ports or stop the conflicting application." }
}
Move-Item $StagedConfig $ConfigPath -Force
& icacls.exe $ReleaseDir /grant '*S-1-5-19:(OI)(CI)RX' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant API runtime read access.' }
if ([IO.Path]::GetFullPath($NodePath).StartsWith($RuntimeDir.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
    & icacls.exe $RuntimeDir /grant '*S-1-5-19:(OI)(CI)RX' /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to grant API runtime access to the private Node.js runtime.' }
}

foreach ($SiteName in @($UserSite,$AdminSite)) {
    if (-not (Test-Path "IIS:\AppPools\$SiteName")) { New-WebAppPool -Name $SiteName | Out-Null; $CreatedPools += $SiteName }
    Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ''
    Set-ItemProperty "IIS:\AppPools\$SiteName" -Name processModel.identityType -Value 4
}
$UserWebRoot = Join-Path $ReleaseDir 'dist\user'
$AdminWebRoot = Join-Path $ReleaseDir 'dist\admin'
& icacls.exe $UserWebRoot /grant ("IIS AppPool\" + $UserSite + ':(OI)(CI)RX') /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the user app pool access to its web root.' }
& icacls.exe $AdminWebRoot /grant ("IIS AppPool\" + $AdminSite + ':(OI)(CI)RX') /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the administrator app pool access to its web root.' }
foreach ($SiteName in @($UserSite,$AdminSite)) { if (Test-Path "IIS:\Sites\$SiteName") { Remove-Website -Name $SiteName } }
$UserBinding = if ($LocalOnly) { '127.0.0.1' } else { '*' }
New-Website -Name $UserSite -Port $UserPort -IPAddress $UserBinding -PhysicalPath $UserWebRoot -ApplicationPool $UserSite | Out-Null
$CreatedSites += $UserSite
New-Website -Name $AdminSite -Port $AdminUiPort -IPAddress '127.0.0.1' -PhysicalPath $AdminWebRoot -ApplicationPool $AdminSite | Out-Null
$CreatedSites += $AdminSite
foreach ($SiteName in @($UserSite,$AdminSite)) {
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name userName -Value ''
    Start-Website -Name $SiteName
}
$TaskAction = New-ScheduledTaskAction -Execute $NodePath -Argument ('"' + (Join-Path $ReleaseDir 'server\index.mjs') + '" --config "' + $ConfigPath + '"') -WorkingDirectory $ReleaseDir
$TaskPrincipal = New-ScheduledTaskPrincipal -UserId 'LOCALSERVICE' -LogonType ServiceAccount -RunLevel Limited
$TaskTrigger = New-ScheduledTaskTrigger -AtStartup
$TaskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Register disabled so no startup/retry trigger can migrate the DB before the
# installation marker points to the matching release and its recovery tool.
$TaskSettings.Enabled = $false
Register-ScheduledTask -TaskName $TaskName -Action $TaskAction -Principal $TaskPrincipal -Trigger $TaskTrigger -Settings $TaskSettings -Description 'PlayHub local PoC API; separate public and administrator listeners' -Force | Out-Null
$TaskCreated = $true
$Marker = @{product='playhub-iis-poc';version=$SourcePackage.version;databaseSchemaVersion=$SourcePackage.playhubDatabaseSchemaVersion;installedAt=[DateTime]::UtcNow.ToString('o');releaseDir=$ReleaseDir;nodePath=$NodePath;configPath=$ConfigPath;dataDir=$DataDir;userPort=$UserPort;adminUiPort=$AdminUiPort;publicPort=$PublicApiPort;adminPort=$AdminApiPort;shareHost=$ShareHost;localOnly=[bool]$LocalOnly;taskName=$TaskName;userSite=$UserSite;adminSite=$AdminSite;firewallName=$FirewallName;firewallGroup=$FirewallGroup}
$MarkerTemporary = Join-Path $InstallRoot ('installation-' + [Guid]::NewGuid().ToString('N') + '.new')
try {
    $MarkerBytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($Marker | ConvertTo-Json -Depth 6))
    $MarkerStream = [IO.File]::Open($MarkerTemporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $MarkerStream.Write($MarkerBytes,0,$MarkerBytes.Length); $MarkerStream.Flush($true) } finally { $MarkerStream.Dispose() }
    if (Test-Path -LiteralPath $MarkerPath) { [IO.File]::Replace($MarkerTemporary,$MarkerPath,$null) }
    else { [IO.File]::Move($MarkerTemporary,$MarkerPath) }
} finally { if (Test-Path -LiteralPath $MarkerTemporary) { Remove-Item -LiteralPath $MarkerTemporary -Force } }
Enable-ScheduledTask -TaskName $TaskName | Out-Null
Start-ScheduledTask -TaskName $TaskName
$CurrentFirewallRules = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -ErrorAction SilentlyContinue)
if (@($CurrentFirewallRules | Where-Object { $_.Group -ne $FirewallGroup }).Count -gt 0) { throw 'Firewall rule ownership changed during installation; refusing to remove it.' }
if ($CurrentFirewallRules.Count -gt 0) { Remove-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName }
if (-not $LocalOnly) {
    New-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -Group $FirewallGroup -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort @($UserPort,$PublicApiPort) -RemoteAddress LocalSubnet -Profile Private,Domain | Out-Null
    $FirewallCreated = $true
}
$Healthy = $false
for ($Attempt=0;$Attempt -lt 20;$Attempt++) {
    try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$PublicApiPort/api/health" -TimeoutSec 2; if ($Health.ok) { $Healthy=$true;break } } catch { }
    Start-Sleep -Seconds 1
}
if (-not $Healthy) { throw "The API did not start. See Task Scheduler task '$TaskName', or run the recorded nodePath with server/index.mjs and --config for diagnostics." }
# The new release is not successful until IIS static files and service flows pass as well.
$IisCheckStarted = [DateTime]::UtcNow
& (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ReleaseDir 'scripts\Test-IIS.ps1') -InstallRoot $InstallRoot
if ($LASTEXITCODE -ne 0) { throw 'The new release failed its IIS HTTP acceptance check.' }
$IisCheck = Get-Content (Join-Path $ReportDir 'iis-smoke.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if (-not $IisCheck.ok -or [DateTime]::Parse($IisCheck.generatedAt).ToUniversalTime() -lt $IisCheckStarted -or -not $IisCheck.environment.iisTargetDeclared) { throw 'The new release did not produce a fresh successful IIS HTTP report.' }
if (Test-Path $PendingMarkerPath) { Remove-Item -LiteralPath $PendingMarkerPath -Force }
} catch {
    $SwitchError = $_
    if ($Existing) {
        Write-Warning 'The new release failed to start. Restoring the previous application and configuration.'
        try {
            # Stop the candidate before probing the old release's schema support;
            # it must not commit a migration between that probe and code rollback.
            Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            $RollbackPortsClosed = $false
            for ($Attempt=0;$Attempt -lt 40;$Attempt++) {
                $ActiveApiPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @($PublicApiPort,$AdminApiPort) })
                if ($ActiveApiPorts.Count -eq 0) { $RollbackPortsClosed=$true;break }
                Start-Sleep -Milliseconds 250
            }
            if (-not $RollbackPortsClosed) { throw 'API ports did not close; automatic code recovery will not race an active database process.' }
            & (Join-Path $SourceRoot 'scripts\Restore-PreviousRelease.ps1') -InstallRoot $InstallRoot
        }
        catch {
            Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            foreach ($SiteName in @($UserSite,$AdminSite)) { Stop-Website -Name $SiteName -ErrorAction SilentlyContinue }
            Write-Warning ('Automatic code recovery was refused or failed: ' + $_.Exception.Message + '. The API task and sites were stopped. If the database was upgraded, use the current Restore-Data.ps1 -KeepStopped to apply the pre-update backup, then run Restore-PreviousRelease.ps1. Existing database/recovery files were retained.')
        }
    } else {
        # Only resources created by this fresh attempt are eligible for cleanup. Data/config remain intact.
        if ($TaskCreated) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue }
        foreach ($SiteName in $CreatedSites) { Stop-Website -Name $SiteName -ErrorAction SilentlyContinue; Remove-Website -Name $SiteName -ErrorAction SilentlyContinue }
        foreach ($PoolName in $CreatedPools) { Remove-WebAppPool -Name $PoolName -ErrorAction SilentlyContinue }
        if ($FirewallCreated) { Get-NetFirewallRule -PolicyStore PersistentStore -Name $FirewallName -ErrorAction SilentlyContinue | Where-Object { $_.Group -eq $FirewallGroup } | Remove-NetFirewallRule -ErrorAction SilentlyContinue }
        if (Test-Path $MarkerPath) { Remove-Item -LiteralPath $MarkerPath -Force }
    }
    throw $SwitchError
}
Write-Host ''
Write-Host 'PlayHub installation is ready.' -ForegroundColor Green
Write-Host "User site:  http://${ShareHost}:$UserPort"
Write-Host "Admin site: http://localhost:$AdminUiPort"
Write-Host "Config:     $ConfigPath"
Write-Host "Data:       $DataDir"
Write-Host 'The administrator site and API are bound to loopback. Only user ports were added to the local-subnet firewall rule.'
Write-Host 'Google login requires your own OAuth client settings; guest play is available immediately.'
