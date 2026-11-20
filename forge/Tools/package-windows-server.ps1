[CmdletBinding()]
param(
    [string]$GodotSource = 'D:\Github\GoDotProjects',
    [string]$NodeSource = 'C:\Program Files\nodejs\node.exe',
    [string]$ReleaseDate = '',
    [ValidatePattern('^(\d{4})?$')][string]$BuildTime = '',
    [string]$Branch = '',
    [string]$SourceCommit = '',
    [ValidateRange(0, 999999)][int]$BuildNumber = 0,
    [ValidateRange(0, 99)][int]$DailySeq = 0,
    [ValidateSet('local','dev','qa','rc','live')][string]$Channel = 'local',
    [ValidateSet('optional','force')][string]$UpdatePolicy = 'optional',
    [ValidateSet('forge-desktop','godot-server')][string]$Target = 'forge-desktop'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nowUtc = [DateTime]::UtcNow
$nowKst = $nowUtc.AddHours(9)
if (-not $ReleaseDate) { $ReleaseDate = $nowKst.ToString('yyyy-MM-dd') }
if (-not $BuildTime) { $BuildTime = $nowKst.ToString('HHmm') }
if (-not $Branch) {
    try { $Branch = (git -C $root rev-parse --abbrev-ref HEAD 2>$null).Trim() } catch { $Branch = '' }
    if (-not $Branch -or $Branch -eq 'HEAD') { $Branch = 'detached' }
}
if (-not $SourceCommit) {
    try { $SourceCommit = (git -C $root rev-parse HEAD 2>$null).Trim().ToLowerInvariant() } catch { $SourceCommit = '0000000' }
}
$branchSlug = ($Branch.ToLowerInvariant() -replace '[^a-z0-9-]+','-' -replace '-+','-').Trim('-')
if ($branchSlug.Length -gt 20) { $branchSlug = $branchSlug.Substring(0,20).TrimEnd('-') }
if (-not $branchSlug) { $branchSlug = 'detached' }
$sha7 = $SourceCommit.Substring(0, [Math]::Min(7, $SourceCommit.Length)).ToLowerInvariant()
$dateCompact = $ReleaseDate.Replace('-', '')
$effectiveSeq = if ($DailySeq -gt 0) { $DailySeq } elseif ($BuildNumber -gt 0) { (($BuildNumber - 1) % 99) + 1 } else { 0 }
$buildCode = [int64]("$dateCompact" + $effectiveSeq.ToString('00'))
if ($buildCode -ge 2100000000) { throw "buildCode $buildCode exceeds Google Play Int32 ceiling." }
$pkgSemver = (Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json).version
$buildId = "$Target-v$pkgSemver-$dateCompact-$BuildTime-$branchSlug-g$sha7-b$BuildNumber"
$archivePrefix = if ($Target -eq 'godot-server') { 'PlayForge-GodotServer' } else { 'PlayForge-Desktop' }
$packagingRoot = Join-Path $root 'Saved/Packaging'
$stage = Join-Path $packagingRoot 'staging/PlayForge'
$outputDirectory = Join-Path $root 'Launch'
$archiveName = "$archivePrefix-v$pkgSemver-$dateCompact-$BuildTime-$branchSlug-g$sha7-b$BuildNumber-win-x64.zip"
$archivePath = Join-Path $outputDirectory $archiveName
$godotVersionName = 'Godot_v4.7.2-stable_win64'
$godotEditor = Join-Path $GodotSource "$godotVersionName.exe"
$godotConsole = Join-Path $GodotSource "${godotVersionName}_console.exe"
$nodeLicense = Join-Path $root 'Deploy/Node-LICENSE-22.16.0.txt'
$exportTemplates = Join-Path $env:APPDATA 'Godot/export_templates/4.7.2.stable'

function Assert-Within([string]$Candidate, [string]$Parent) {
    $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
    $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if (-not $candidatePath.StartsWith($parentPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to use a path outside the designated directory: $candidatePath"
    }
}

function Copy-File([string]$Source, [string]$RelativeDestination) {
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Required package input is missing: $Source" }
    $destination = Join-Path $stage $RelativeDestination
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $destination -Force
}

function Write-PackageText([string]$RelativeDestination, [string]$Text) {
    $destination = Join-Path $stage $RelativeDestination
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Set-Content -LiteralPath $destination -Value $Text -Encoding utf8
}

function Copy-Tree([string]$RelativeSource, [string]$RelativeDestination = $RelativeSource, [string[]]$ExcludeDirectory = @()) {
    $sourcePath = Join-Path $root $RelativeSource
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw "Required package folder is missing: $sourcePath" }
    $sourceFull = (Resolve-Path -LiteralPath $sourcePath).Path
    foreach ($file in Get-ChildItem -LiteralPath $sourceFull -File -Recurse -Force) {
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        $relative = [IO.Path]::GetRelativePath($sourceFull, $file.FullName)
        $parts = $relative -split '[\\/]'
        if ($parts | Where-Object { $_ -in @('.git', '.godot', 'node_modules', 'Saved', 'Tests', 'test', 'tests', 'References', 'Engine', 'GodotFork') -or $_ -in $ExcludeDirectory }) { continue }
        $destination = Join-Path $stage (Join-Path $RelativeDestination $relative)
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
}

if (-not (Test-Path -LiteralPath $NodeSource -PathType Leaf)) { throw "Node.js executable not found: $NodeSource" }
if (-not (Test-Path -LiteralPath $godotEditor -PathType Leaf) -or -not (Test-Path -LiteralPath $godotConsole -PathType Leaf)) { throw "Godot 4.7.2 editor and console executables are required from $GodotSource" }
if (-not (Test-Path -LiteralPath $nodeLicense -PathType Leaf)) { throw "Node.js license is missing: $nodeLicense" }
foreach ($template in @('web_nothreads_release.zip', 'web_nothreads_debug.zip')) {
    if (-not (Test-Path -LiteralPath (Join-Path $exportTemplates $template) -PathType Leaf)) { throw "Godot Web export template is missing: $(Join-Path $exportTemplates $template)" }
}

New-Item -ItemType Directory -Path $packagingRoot -Force | Out-Null
$packagingRoot = (Resolve-Path -LiteralPath $packagingRoot).Path
Assert-Within $stage $packagingRoot
if (Test-Path -LiteralPath $stage) {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    Assert-Within $resolvedStage $packagingRoot
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# App server, its runtime modules, and the content the server serves or exports.
Copy-File (Join-Path $root 'server.cjs') 'server.cjs'
Copy-File (Join-Path $root 'package.json') 'package.json'
Copy-File (Join-Path $root 'package-lock.json') 'package-lock.json'
Copy-File (Join-Path $root 'Deploy/server-start.ps1') 'Deploy/server-start.ps1'
Copy-File (Join-Path $root 'Deploy/SERVER_README.md') 'Deploy/SERVER_README.md'
Copy-File (Join-Path $root 'Deploy/Caddyfile.example') 'Deploy/Caddyfile.example'
Copy-File $nodeLicense 'Deploy/Node-LICENSE-22.16.0.txt'
Write-PackageText 'START_SERVER.cmd' "@echo off`r`nsetlocal`r`npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"%~dp0Deploy\server-start.ps1`"`r`nexit /b %ERRORLEVEL%"
Write-PackageText 'README.md' "# PlayForge Server`r`n`r`nWindows server bundle. See [Deploy/SERVER_README.md](Deploy/SERVER_README.md) for startup, HTTPS proxy, backups, and integration details.`r`n"
Write-PackageText 'RELEASE_STATUS.txt' "작업본 배포 패키지입니다. 최종 실행 및 배포 검증은 생략했습니다. 기존 회귀 검사에서 템플릿 설정 비교와 멀티플레이 서버 항목 실패가 남아 있습니다."
Write-PackageText 'index.html' "<!doctype html><html lang=`"ko`"><meta charset=`"utf-8`"><meta http-equiv=`"refresh`" content=`"0; url=/OfficialGodot/`"><title>PlayForge</title><p><a href=`"/OfficialGodot/`">PlayForge Creator 열기</a></p></html>"
Write-PackageText 'playhub.integration.json' (@{ service = 'PlayForge'; defaultPort = 4173; healthPath = '/api/health'; editorPath = '/OfficialGodot/'; projectPath = '/OfficialGodot/?project=<project-id>'; deployment = 'separate-origin'; embeddedIframe = 'requires-isolation-header-validation' } | ConvertTo-Json -Depth 4)

$requiredTools = @(
    'project-store.cjs', 'native-runtime.cjs', 'collaboration.cjs', 'brawllabs-multiplayer.cjs',
    'fortress-multiplayer.cjs', 'fortress-engine.cjs',
    'origin-policy.cjs', 'export-godot-project.cjs', 'build-queue.cjs', 'platform-store.cjs',
    'platform-api.cjs', 'template-catalog.cjs', 'platform-project.cjs', 'prepare-template-showcase.cjs', 'asset-library.cjs',
    'agent-chat-provider.cjs', 'agent-chat-claude.cjs', 'agent-chat-codex.cjs', 'agent-chat-openai.cjs', 'record-agent-mcp.cjs'
)
foreach ($tool in $requiredTools) { Copy-File (Join-Path $root "Tools/$tool") "Tools/$tool" }

Copy-Tree 'Godot' 'Godot'
Copy-Tree 'Projects/TappyChicken' 'Projects/TappyChicken'
Copy-Tree 'Templates' 'Templates'
Copy-Tree 'OfficialGodot' 'OfficialGodot'

# Bundle only the runtime packages used by the service; no npm or dev dependencies are needed.
foreach ($module in @('ws', 'yjs', 'lib0', 'isomorphic.js')) {
    Copy-Tree "node_modules/$module" "node_modules/$module" @('test', 'tests', '__tests__', 'coverage', 'docs', 'examples')
}

Copy-File $NodeSource 'Runtime/node.exe'
Copy-File $godotEditor "Runtime/Godot/$godotVersionName.exe"
Copy-File $godotConsole "Runtime/Godot/${godotVersionName}_console.exe"
$runtimeTemplateDestination = Join-Path $stage 'Runtime/Godot/editor_data/export_templates/4.7.2.stable'
New-Item -ItemType Directory -Path $runtimeTemplateDestination -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $stage 'Runtime/Godot/_sc_') -Force | Out-Null
foreach ($template in @('web_nothreads_release.zip', 'web_nothreads_debug.zip')) {
    Copy-Item -LiteralPath (Join-Path $exportTemplates $template) -Destination (Join-Path $runtimeTemplateDestination $template)
}

$nodeVersion = (& $NodeSource --version).Trim()
$nodeLicenseText = Get-Content -Raw -LiteralPath (Join-Path $stage 'Deploy/Node-LICENSE-22.16.0.txt')
if ($nodeVersion -ne 'v22.16.0' -or $nodeLicenseText -notmatch 'Node\.js is licensed') { throw "The Node.js binary and included 22.16.0 license must match (found $nodeVersion)." }
$godotVersion = (& $godotConsole --headless --version | Select-Object -First 1).Trim()
$moduleVersions = @{}
foreach ($module in @('ws', 'yjs', 'lib0', 'isomorphic.js')) {
    $metadata = Get-Content -Raw -LiteralPath (Join-Path $stage "node_modules/$module/package.json") | ConvertFrom-Json
    $moduleVersions[$module] = $metadata.version
}
$playforgeVersion = (Get-Content -Raw -LiteralPath (Join-Path $stage 'package.json') | ConvertFrom-Json).version
$buildInfo = [ordered]@{
    schemaVersion = 1
    target = $Target
    semver = $playforgeVersion
    channel = $Channel
    buildId = $buildId
    buildCode = $buildCode
    buildNum = $BuildNumber
    dailySeq = $effectiveSeq
    builtAtUtc = $nowUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    builtAtKst = $nowKst.ToString('yyyy-MM-ddTHH:mm:ss+09:00')
    dateKst = $dateCompact
    timeKst = $BuildTime
    git = [ordered]@{ branch = $Branch; branchSlug = $branchSlug; commit = $SourceCommit; sha7 = $sha7; dirty = $false }
    compat = [ordered]@{ engineAbi = 'godot-4.7'; engineApiRev = 1; minEngineApiRev = 1; netProtocol = '1.0'; gameplayHash = 'default' }
    updatePolicy = $UpdatePolicy
    minClientBuildCode = $(if ($UpdatePolicy -eq 'force') { $buildCode } else { 0 })
}
$buildInfo | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stage 'BUILD_INFO.json') -Encoding utf8
$fileRecords = @()
foreach ($file in Get-ChildItem -LiteralPath $stage -File -Recurse -Force | Sort-Object FullName) {
    $relative = [IO.Path]::GetRelativePath($stage, $file.FullName).Replace('\', '/')
    $fileRecords += [ordered]@{ path = $relative; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$licenses = @($fileRecords | Where-Object { $_.path -match '(^|/)(LICENSE|LICENCE|COPYING|NOTICE|OFL)(\.|$)' -or $_.path -in @('Deploy/Node-LICENSE-22.16.0.txt', 'OfficialGodot/GODOT-LICENSE.txt') } | ForEach-Object { $_.path })
$manifest = [ordered]@{
    package = $archivePrefix
    target = $Target
    buildId = $buildId
    buildCode = $buildCode
    updatePolicy = $UpdatePolicy
    releaseDate = $ReleaseDate
    buildTimeKst = $BuildTime
    branch = $Branch
    sourceCommit = $SourceCommit
    generatedAtUtc = $nowUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    versions = [ordered]@{ PlayForge = $playforgeVersion; Node = $nodeVersion; Godot = $godotVersion; modules = $moduleVersions }
    licenses = $licenses
    files = $fileRecords
    manifestNotice = 'This manifest lists every other packaged file; its own SHA-256 is intentionally omitted.'
}
$manifestPath = Join-Path $stage 'Deploy/MANIFEST.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    $resolvedOutput = (Resolve-Path -LiteralPath $outputDirectory).Path
    Assert-Within (Join-Path $resolvedOutput $archiveName) $resolvedOutput
    Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -LiteralPath $stage -DestinationPath $archivePath -CompressionLevel Optimal -Force
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archivePath.sha256" -Value "$archiveHash  $archiveName" -Encoding ascii
Write-Host "Package ready: $archivePath"
Write-Host "SHA-256: $archiveHash"
Write-Host "Files: $($fileRecords.Count + 1) (manifest excluded from its own hash list)"
