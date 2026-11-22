param(
    [string]$GodotBin = "D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe",
    [string]$TemplateDir = "$env:APPDATA\Godot\export_templates\4.7.2.stable",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot "artifacts\desktop-m0"
}

$PlayerDir = Join-Path $OutDir "player"
New-Item -ItemType Directory -Force -Path $PlayerDir | Out-Null

$ReleaseTpl = Join-Path $TemplateDir "windows_release_x86_64.exe"
$ConsoleTpl = Join-Path $TemplateDir "windows_release_x86_64_console.exe"
if (-not (Test-Path $ReleaseTpl)) {
    throw "Godot 4.7.2 template not found: $ReleaseTpl"
}
if (-not (Test-Path $GodotBin)) {
    throw "Godot 4.7.2 binary not found: $GodotBin"
}

$PlayerExe = Join-Path $PlayerDir "PlayHubPlayer.exe"
$PlayerConsoleExe = Join-Path $PlayerDir "PlayHubPlayer.console.exe"
Copy-Item -Force $ReleaseTpl $PlayerExe
if (Test-Path $ConsoleTpl) {
    Copy-Item -Force $ConsoleTpl $PlayerConsoleExe
}

$BootstrapProj = Join-Path $RepoRoot "native\runtime-bootstrap"
# Godot 4.7.2 template_release disables --main-pack by default (disable_path_overrides=yes).
# Exporting as sibling PlayHubPlayer.pck makes PlayHubPlayer.exe auto-load our bootstrap securely.
$BootstrapPck = Join-Path $PlayerDir "PlayHubPlayer.pck"

Write-Host "[prepare-player] Exporting PlayHubPlayer.pck via Godot 4.7.2 headless..."
& $GodotBin --headless --path $BootstrapProj --export-pack "PlayHub Desktop Bootstrap Pack" $BootstrapPck
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $BootstrapPck)) {
    throw "Failed to export bootstrap.pck (exit=$LASTEXITCODE)"
}

$PlayerHash = (Get-FileHash -Algorithm SHA256 $PlayerExe).Hash.ToLowerInvariant()
$PckHash = (Get-FileHash -Algorithm SHA256 $BootstrapPck).Hash.ToLowerInvariant()

$Meta = [ordered]@{
    preparedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    engineVersion = "4.7.2"
    playerExe = $PlayerExe
    playerBytes = (Get-Item $PlayerExe).Length
    playerSha256 = $PlayerHash
    bootstrapPck = $BootstrapPck
    bootstrapPckBytes = (Get-Item $BootstrapPck).Length
    bootstrapPckSha256 = $PckHash
}

$MetaPath = Join-Path $OutDir "player-meta.json"
$Meta | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $MetaPath
Write-Host "[prepare-player] Done -> $MetaPath"
Write-Host ($Meta | ConvertTo-Json -Depth 4)
