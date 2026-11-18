param([switch]$CheckOnly, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCandidates = @(
  $env:PLAYHUB_NODE_BIN,
  (Join-Path $sourceRoot '../artifacts/local-runtime/node24/node.exe'),
  (Join-Path $env:TEMP 'playhub-build-inputs/node-v24.22.1-win-x64/node.exe'),
  (Join-Path $env:ProgramFiles 'nodejs/node.exe')
)
$nodeRuntime = $null
foreach ($candidate in $nodeCandidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    $major = & $candidate -p 'Number(process.versions.node.match(/^[0-9]+/)[0])'
    if ($LASTEXITCODE -eq 0 -and [int]$major -ge 24) { $nodeRuntime = $candidate; break }
  }
}
if (-not $nodeRuntime) { throw 'Node.js 24 or newer is required. Install Node.js 24, then run this preview again.' }
$configPath = Join-Path $env:LOCALAPPDATA 'PlayHub/private/config/local.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { $configPath = Join-Path $sourceRoot 'config/local.json' }
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Run the PlayHub portable setup once before using this source preview.' }
$settings = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
& $nodeRuntime -e 'const fs=require("node:fs"),path=require("node:path");const root=process.argv[1];require(path.join(root,"tools/runtime-output.cjs")).assertRuntimeOutput(root,JSON.parse(fs.readFileSync(process.argv[2],"utf8").replace(/^\uFEFF/,"")));' $sourceRoot $configPath
if ($LASTEXITCODE -ne 0) { throw 'Manual AI deployment is required before startup. No synchronization or build was performed.' }
$userUrl = 'http://localhost:' + $settings.userPort + '/'
$adminUrl = 'http://127.0.0.1:' + $settings.adminUiPort + '/'
$links = @(
  [pscustomobject]@{Name='This PC';File='local-open-user.url';Url=$userUrl},
  [pscustomobject]@{Name='Administrator';File='local-open-admin.url';Url=$adminUrl}
)
Write-Host ''
Write-Host ('PlayHub source preview: ' + $sourceRoot) -ForegroundColor Cyan
Write-Host ('User:  http://localhost:' + $settings.userPort + '/')
Write-Host ('Admin: http://127.0.0.1:' + $settings.adminUiPort + '/')
try {
  $lanAddresses = [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and -not [Net.IPAddress]::IsLoopback($_) }
  $lanIndex = 0
  foreach ($address in $lanAddresses) {
    $lanUrl = 'http://' + $address.IPAddressToString + ':' + $settings.userPort + '/'
    Write-Host ('LAN URL: ' + $lanUrl)
    $links += [pscustomobject]@{Name='Local network';File=('local-open-lan-' + $lanIndex + '.url');Url=$lanUrl}
    $lanIndex++
  }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $publicAddress = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 5).ToString().Trim()
  $parsedAddress = $null
  if ([Net.IPAddress]::TryParse($publicAddress, [ref]$parsedAddress)) {
    Write-Host ('Public IP: ' + $publicAddress) -ForegroundColor Cyan
    Write-Host ('External URL: http://' + $publicAddress + ':' + $settings.userPort + '/ (requires network forwarding and public access configuration)')
    $links += [pscustomobject]@{Name='Public address (not verified)';File='local-open-public.url';Url=('http://' + $publicAddress + ':' + $settings.userPort + '/')}
  }
} catch { Write-Host 'Public IP: unavailable (network lookup timed out).' }
$reportDirectory = Join-Path $sourceRoot 'reports'
[void](New-Item -ItemType Directory -Path $reportDirectory -Force)
$cards = foreach ($link in $links) {
  Set-Content -LiteralPath (Join-Path $reportDirectory $link.File) -Value ("[InternetShortcut]`r`nURL=" + $link.Url) -Encoding Ascii
  '<article><h2>' + [Net.WebUtility]::HtmlEncode($link.Name) + '</h2><a href="' + [Net.WebUtility]::HtmlEncode($link.Url) + '">' + [Net.WebUtility]::HtmlEncode($link.Url) + '</a><a download href="' + $link.File + '">URL shortcut</a></article>'
}
$linkPage = Join-Path $reportDirectory 'local-connect.html'
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'preview-links.html') -Encoding UTF8 -Raw
Set-Content -LiteralPath $linkPage -Value $template.Replace('{{LINK_CARDS}}', ($cards -join "`n")) -Encoding UTF8
Write-Host ('Connection links: ' + $linkPage)
Write-Host 'Keep this window open. Press Ctrl+C to stop. Existing PlayHub accounts and saves are used.'
Write-Host 'Wait for READY before opening the URLs. Existing deployed output is served without synchronization or build.'
Write-Host 'A port conflict stops startup. A verified PlayHub server may be force-stopped only if you choose Y.'
Write-Host ''
if ($CheckOnly) { Write-Host 'Preview prerequisites passed.'; exit 0 }
& {
  param($helperFile, $previewConfiguration, $previewSource)
  . $helperFile
  Assert-PlayHubPreviewPorts -Config $previewConfiguration -SourceRoot $previewSource -InstanceRoot (Join-Path $env:LOCALAPPDATA 'PlayHub') -LauncherExecutable @((Join-Path $previewSource '../PlayHub.exe'), (Join-Path $previewSource '.local-build/PlayHub.exe'))
} (Join-Path $PSScriptRoot 'preview-ports.ps1') $settings $sourceRoot
Push-Location -LiteralPath $sourceRoot
try {
  if ($NoOpen) { & $nodeRuntime (Join-Path $sourceRoot 'tools/dev.mjs') --config $configPath }
  else { & $nodeRuntime (Join-Path $sourceRoot 'tools/dev.mjs') --config $configPath --open }
  exit $LASTEXITCODE
} finally { Pop-Location }
