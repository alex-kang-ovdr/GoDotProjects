[CmdletBinding()]
param([switch]$NoBrowser, [switch]$Check)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $repository 'artifacts/local-runtime'

function Resolve-Node {
    if ($env:PLAYHUB_NODE_BIN) {
        if (-not [IO.Path]::IsPathRooted($env:PLAYHUB_NODE_BIN) -or -not (Test-Path -LiteralPath $env:PLAYHUB_NODE_BIN -PathType Leaf)) {
            throw 'PLAYHUB_NODE_BIN must identify an existing absolute Node executable path.'
        }
        return (Resolve-Path -LiteralPath $env:PLAYHUB_NODE_BIN).Path
    }
    $bundled = Join-Path $runtime 'node24/node.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
    return (Get-Command node.exe -CommandType Application).Source
}

function Get-ListeningPorts {
    return [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
}

function Get-LocalResponse([string]$Url, [string]$Method = 'GET') {
    $message = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $Url)
    try { return $http.SendAsync($message).GetAwaiter().GetResult() }
    catch { return $null }
    finally { $message.Dispose() }
}

function Get-JsonResponse($Response) {
    if ($null -eq $Response -or [int]$Response.StatusCode -ne 200 -or $Response.Content.Headers.ContentType.MediaType -ne 'application/json') {
        return $null
    }
    try { return $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json }
    catch { return $null }
}

function Test-CrossOriginIsolated($Response) {
    return $Response.Headers.Contains('Cross-Origin-Opener-Policy') -and ($Response.Headers.GetValues('Cross-Origin-Opener-Policy') -contains 'same-origin') -and
        $Response.Headers.Contains('Cross-Origin-Embedder-Policy') -and ($Response.Headers.GetValues('Cross-Origin-Embedder-Policy') -contains 'require-corp')
}

function Test-HubReady {
    foreach ($endpoint in $hubApis) {
        $response = Get-LocalResponse $endpoint.Url
        try {
            $health = Get-JsonResponse $response
            if ($health.ok -ne $true -or $health.service -ne $endpoint.Service) { return $false }
        } finally { if ($response) { $response.Dispose() } }
    }
    foreach ($site in $hubSites) {
        $response = Get-LocalResponse $site.Url
        if (-not $response) { return $false }
        try {
            if ([int]$response.StatusCode -ne 200 -or $response.Content.Headers.ContentType.MediaType -ne 'text/html') { return $false }
            if ($response.Headers.Contains('Cross-Origin-Opener-Policy') -or $response.Headers.Contains('Cross-Origin-Embedder-Policy')) { return $false }
            $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
            $hash = [Convert]::ToBase64String($sha256.ComputeHash($bytes))
            if ($hash -cne $site.Hash) { return $false }
        } finally { $response.Dispose() }
    }
    return $true
}

function Test-ForgeReady([int]$Port) {
    $hubAuthActive = $false
    $response = Get-LocalResponse "http://127.0.0.1:$Port/api/health"
    try {
        $health = Get-JsonResponse $response
        if ($health.ok -ne $true -or $health.runtime -ne $true -or $health.engine -ne 'Godot' -or $health.fortressWarMultiplayer -ne $true) {
            return $false
        }
        $hubAuthActive = ($health.hubAuth -eq $true)
    } finally { if ($response) { $response.Dispose() } }
    $response = Get-LocalResponse "http://127.0.0.1:$Port/OfficialGodot/" 'HEAD'
    if (-not $response) { return $false }
    try {
        if (-not (Test-CrossOriginIsolated $response)) { return $false }
        if ($hubAuthActive) { return [int]$response.StatusCode -eq 401 }
        return [int]$response.StatusCode -eq 200 -and $response.Content.Headers.ContentType.MediaType -eq 'text/html'
    } finally { $response.Dispose() }
}

function Test-HubForgeProxy {
    $response = Get-LocalResponse "${hubUrl}forge/api/health"
    try {
        $health = Get-JsonResponse $response
        if ($health.ok -ne $true -or $health.engine -ne 'Godot') { return $false }
        return Test-CrossOriginIsolated $response
    } finally { if ($response) { $response.Dispose() } }
}

function New-InternalSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) }
    finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Start-LocalComponent([string]$Name, [string[]]$Arguments, [scriptblock]$IsReady) {
    $logDirectory = Join-Path $runtime 'platform-logs'
    [void][IO.Directory]::CreateDirectory($logDirectory)
    $prefix = Join-Path $logDirectory ($Name + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + $PID)
    $process = Start-Process -FilePath $node -ArgumentList $Arguments -WorkingDirectory $repository -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$prefix.stdout.log" -RedirectStandardError "$prefix.stderr.log"
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    while ($deadline.Elapsed.TotalSeconds -lt 45) {
        if ($process.HasExited) { throw "$Name exited with code $($process.ExitCode). See $prefix.stderr.log" }
        if (& $IsReady) {
            Write-Host "$Name ready (PID $($process.Id)). Logs: $prefix.*.log"
            return
        }
        Start-Sleep -Milliseconds 250
    }
    throw "$Name did not become ready. See $prefix.stderr.log"
}

Add-Type -AssemblyName System.Net.Http
$handler = [Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$handler.AllowAutoRedirect = $false
$http = [Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(2)
$sha256 = [Security.Cryptography.SHA256]::Create()
$gate = [Threading.Mutex]::new($false, 'Local\PlayHubPlatformLauncher')
$ownsGate = $false
$status = 0
Push-Location -LiteralPath $repository
try {
    try { $ownsGate = $gate.WaitOne([TimeSpan]::FromSeconds(60)) }
    catch [Threading.AbandonedMutexException] { $ownsGate = $true }
    if (-not $ownsGate) { throw 'Another PlayHub launcher is still starting the services.' }

    $node = Resolve-Node
    $env:PLAYHUB_NO_BROWSER = '1'
    $env:HOST = '127.0.0.1'
    $env:PORT = '4177'
    foreach ($component in @('hub', 'forge')) {
        & $node tools/launch.cjs $component --check
        if ($LASTEXITCODE -ne 0) { throw "$component prerequisites failed." }
    }

    $configPath = $env:PLAYHUB_CONFIG
    if (-not $configPath) { $configPath = Join-Path $repository 'hub/config/local.json' }
    # Preflight has already validated the JSON and the deployed runtime output.
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    $userPort = if ($config.userPort) { [int]$config.userPort } else { 8080 }
    $adminUiPort = if ($config.adminUiPort) { [int]$config.adminUiPort } else { 8081 }
    $publicPort = [int]$config.publicPort
    $adminPort = [int]$config.adminPort
    $hubHost = if ($config.publicHost -eq '::1') { '[::1]' } else { $config.publicHost }
    $adminHost = if ($config.adminHost -eq '::1') { '[::1]' } else { $config.adminHost }
    $hubUrl = "http://${hubHost}:$userPort/"
    $browserHubUrl = $hubUrl
    $localhostOrigin = "http://localhost:$userPort"
    if ($hubHost -in @('127.0.0.1', 'localhost') -and $config.userOrigins -contains $localhostOrigin) {
        $browserHubUrl = "$localhostOrigin/"
    }
    $adminUrl = "http://${adminHost}:$adminUiPort/"
    $hubApis = @(
        @{ Url = "http://${hubHost}:$publicPort/api/health"; Service = 'public' }
        @{ Url = "http://${adminHost}:$adminPort/api/health"; Service = 'admin' }
    )
    $hubSites = @(
        @{ Url = $hubUrl; Hash = [Convert]::ToBase64String($sha256.ComputeHash([IO.File]::ReadAllBytes((Join-Path $repository 'hub/dist/user/index.html')))) }
        @{ Url = $adminUrl; Hash = [Convert]::ToBase64String($sha256.ComputeHash([IO.File]::ReadAllBytes((Join-Path $repository 'hub/dist/admin/index.html')))) }
    )
    $hubPorts = @($userPort, $adminUiPort, $publicPort, $adminPort)
    if ($hubPorts -contains 4173 -or $hubPorts -contains 4177) { throw 'Hub ports must differ from the Forge ports 4173 and 4177.' }

    $listening = Get-ListeningPorts
    $hubExists = @($hubPorts | Where-Object { $listening -contains $_ }).Count -gt 0
    if ($hubExists -and -not (Test-HubReady)) { throw 'A configured Hub port is occupied and the active service did not match this Hub deployment.' }

    $forgePort = 4177
    $forgeMode = 'start'
    if ($listening -contains 4177) {
        if (-not (Test-ForgeReady 4177)) { throw 'Port 4177 is occupied and did not identify this PlayForge.' }
        $forgePort = 4177
        $forgeMode = 'reuse-4177'
    } elseif ($listening -contains 4173) {
        if (-not (Test-ForgeReady 4173)) { throw 'Port 4173 is occupied and did not identify this PlayForge.' }
        $forgePort = 4173
        $forgeMode = 'reuse-4173'
    }

    $googleConfigured = [bool](($config.google.clientId -and $config.google.clientSecret) -or ($env:PLAYHUB_GOOGLE_CLIENT_ID -and $env:PLAYHUB_GOOGLE_CLIENT_SECRET))
    $enforceHubAuth = $googleConfigured -or ($config.forge.enabled -eq $true) -or ($env:PLAYHUB_FORGE_AUTH_MODE -eq 'hub')
    $forgeUrl = "${browserHubUrl}forge/OfficialGodot/"

    if ($Check) {
        Write-Host "PlayHub and PlayForge checks passed. Forge mode: $forgeMode (internal port $forgePort). Hub auth for Forge: $enforceHubAuth."
    } else {
        $env:PLAYHUB_FORGE_UPSTREAM = "http://127.0.0.1:$forgePort"
        $env:PLAYFORGE_BASE_PATH = '/forge'
        $env:PORT = "$forgePort"
        if ($config.userOrigins -and $config.userOrigins.Count -gt 0) {
            $env:PUBLIC_ORIGIN = ($config.userOrigins -join ',')
        } else {
            $env:PUBLIC_ORIGIN = $browserHubUrl.TrimEnd('/')
        }
        if ($enforceHubAuth) {
            $internalSecret = if ($config.forge.internalSecret) { $config.forge.internalSecret } elseif ($env:PLAYHUB_FORGE_INTERNAL_SECRET) { $env:PLAYHUB_FORGE_INTERNAL_SECRET } else { New-InternalSecret }
            $env:PLAYHUB_FORGE_INTERNAL_SECRET = $internalSecret
            $env:PLAYHUB_FORGE_AUTH_MODE = 'hub'
            $env:PLAYHUB_SESSION_VERIFY_URL = "http://${adminHost}:${adminPort}/internal/session/verify"
            if ($config.forge.directory) {
                $env:PLAYHUB_FORGE_ACCOUNTS_DIR = Join-Path $config.forge.directory 'accounts'
            }
        }

        if ($hubExists) { Write-Host 'Reusing the active PlayHub instance.' }
        else { Start-LocalComponent 'hub' @('tools/launch.cjs', 'hub') { Test-HubReady } }

        if ($forgeMode -eq 'start') {
            Start-LocalComponent 'forge' @('tools/launch.cjs', 'forge') { Test-ForgeReady $forgePort }
        } else {
            Write-Host "Reusing the active PlayForge on internal port $forgePort."
        }

        if (-not (Test-HubForgeProxy)) {
            throw "Hub same-origin /forge/* proxy check failed at ${hubUrl}forge/api/health. Restart PlayHub so it attaches the /forge/* proxy."
        }

        Write-Host "PlayHub: $browserHubUrl"
        Write-Host "PlayForge (same-origin): $forgeUrl"
        Write-Host "PlayForge upstream (internal): http://127.0.0.1:$forgePort/"
        Write-Host ("Forge Hub auth: " + $(if ($enforceHubAuth) { 'enabled (Hub Google login required)' } else { 'local mode (configure Google OAuth to enforce Hub login)' }))
        if (-not $NoBrowser) { Start-Process $browserHubUrl }
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $status = 1
} finally {
    Pop-Location
    if ($ownsGate) { $gate.ReleaseMutex() }
    $gate.Dispose()
    $http.Dispose()
    $sha256.Dispose()
}
exit $status
