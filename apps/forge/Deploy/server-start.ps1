[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = Join-Path $root 'Runtime/node.exe'
$godot = Join-Path $root 'Runtime/Godot/Godot_v4.7.2-stable_win64_console.exe'
$portableMarker = Join-Path $root 'Runtime/Godot/_sc_'
$bundledTemplates = Join-Path $root 'Runtime/Godot/editor_data/export_templates/4.7.2.stable'

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "Bundled Node.js runtime was not found: $node" }
if (-not (Test-Path -LiteralPath $godot -PathType Leaf)) { throw "Bundled Godot runtime was not found: $godot" }
if (-not (Test-Path -LiteralPath (Join-Path $root 'server.cjs') -PathType Leaf)) { throw 'server.cjs is missing from this package.' }
if (-not (Test-Path -LiteralPath $portableMarker -PathType Leaf)) { throw "Godot portable-mode marker is missing: $portableMarker" }
foreach ($name in @('web_nothreads_release.zip', 'web_nothreads_debug.zip')) {
    if (-not (Test-Path -LiteralPath (Join-Path $bundledTemplates $name) -PathType Leaf)) { throw "Bundled Godot Web export template is missing: $(Join-Path $bundledTemplates $name)" }
}

$env:GODOT_BIN = $godot
$env:PLAYFORGE_HEADLESS = '1'
$env:NODE_ENV = 'production'
if ([string]::IsNullOrWhiteSpace($env:PLAYFORGE_HOST)) { $env:PLAYFORGE_HOST = '127.0.0.1' }
if ([string]::IsNullOrWhiteSpace($env:PLAYFORGE_PORT)) { $env:PLAYFORGE_PORT = '4173' }
$portValue = 0
if (-not [int]::TryParse($env:PLAYFORGE_PORT, [ref]$portValue) -or $portValue -lt 1 -or $portValue -gt 65535) { throw 'PLAYFORGE_PORT must be an integer from 1 to 65535.' }
$env:HOST = $env:PLAYFORGE_HOST
$env:PORT = $env:PLAYFORGE_PORT
if (-not [string]::IsNullOrWhiteSpace($env:PLAYFORGE_PUBLIC_ORIGIN)) {
    $origin = $null
    if (-not [Uri]::TryCreate($env:PLAYFORGE_PUBLIC_ORIGIN.TrimEnd('/'), [UriKind]::Absolute, [ref]$origin) -or
        $origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo) {
        throw 'PLAYFORGE_PUBLIC_ORIGIN must be an HTTPS origin without a path, query, credentials, or fragment.'
    }
    $env:PUBLIC_ORIGIN = $origin.GetLeftPart([UriPartial]::Authority)
} else {
    Remove-Item Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
}

Write-Host "PlayForge server: http://$($env:HOST):$($env:PORT)/OfficialGodot/"
Write-Host 'Godot runs headless. Press Ctrl+C to stop the service.'
Push-Location $root
try {
    & $node (Join-Path $root 'server.cjs')
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
