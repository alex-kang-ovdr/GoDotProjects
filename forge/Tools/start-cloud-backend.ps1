param([Parameter(Mandatory=$true)][string]$PublicOrigin)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$origin = [Uri]$PublicOrigin
if (-not $origin.IsAbsoluteUri -or $origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo) {
    throw 'PublicOrigin must be an HTTPS origin, for example https://studio.example.com'
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $node)) { throw 'Node.js 22+ is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/ws/package.json'))) { throw 'Run npm ci in GamePlayForge first.' }
$env:PUBLIC_ORIGIN = $origin.GetLeftPart([UriPartial]::Authority)
$env:HOST = '127.0.0.1'
$env:PORT = '4173'
$env:PLAYFORGE_HEADLESS = '1'
Write-Output "PlayForge backend for $env:PUBLIC_ORIGIN (HTTPS/authentication proxy required)"
& $node (Join-Path $root 'server.cjs')
exit $LASTEXITCODE
