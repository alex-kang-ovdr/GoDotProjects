#Requires -Version 5.1
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$ReleaseDate,
  [string]$OutputDirectory,
  [ValidatePattern('^[a-z0-9-]+$')][string]$Variant,
  [ValidatePattern('^(\d{4})?$')][string]$BuildTime = '',
  [string]$Branch = '',
  [ValidateRange(0, 999999)][int]$BuildNumber = 0,
  [ValidateRange(0, 99)][int]$DailySeq = 0,
  [ValidateSet('local','dev','qa','rc','live')][string]$Channel = 'local',
  [ValidateSet('optional','force')][string]$UpdatePolicy = 'optional',
  [switch]$SkipValidation
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $sourceRoot '../../Dist' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
[void][DateTime]::ParseExact($ReleaseDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
[void](New-Item -ItemType Directory -Path $outputRoot -Force)
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-Utf8([string]$File, [string]$Value) { [IO.File]::WriteAllText($File, $Value, $utf8) }
function Hash([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Assert-Regular([string]$File) {
  $item = Get-Item -LiteralPath $File -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Not a regular input file: $File" }
}
$executable = Join-Path $sourceRoot '.local-build/PlayHub.exe'
$build = Get-Content -LiteralPath ($executable + '.build.json') -Raw | ConvertFrom-Json
Assert-Regular $executable
if (-not $SkipValidation -and (-not $build.ok -or $build.target -ne 'win-x64' -or (Hash $executable) -cne $build.executable.sha256 -or (Get-Item -LiteralPath $executable).Length -ne $build.executable.bytes)) { throw 'The executable does not match its successful Windows build report.' }
# Verify the build is current against all its source/runtime inputs, excluding embedded licenses.
if (-not $SkipValidation) { foreach ($file in $build.bundle.files) {
  if ($file.path.StartsWith('licenses/')) { continue }
  if ($file.path -match '(^/|\\|(^|/)\.\.(/|$)|:)') { throw 'Unsafe bundle input path.' }
  $inputFile = Join-Path $sourceRoot $file.path
  Assert-Regular $inputFile
  if ((Hash $inputFile) -cne $file.sha256) { throw ('Rebuild PlayHub first; the source changed: ' + $file.path) }
} }
$version = $build.version
$catalog = Get-Content -LiteralPath (Join-Path $sourceRoot 'catalog/games.json') -Raw | ConvertFrom-Json
$gameCount = @($catalog.entries | Where-Object { $_.enabled -ne $false }).Count
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$nowUtc = [DateTime]::UtcNow
$nowKst = $nowUtc.AddHours(9)
if (-not $BuildTime) { $BuildTime = $nowKst.ToString('HHmm') }
if (-not $Branch) {
  try { $Branch = (git -C $sourceRoot rev-parse --abbrev-ref HEAD 2>$null).Trim() } catch { $Branch = '' }
  if (-not $Branch -or $Branch -eq 'HEAD') { $Branch = 'detached' }
}
$branchSlug = ($Branch.ToLowerInvariant() -replace '[^a-z0-9-]+','-' -replace '-+','-').Trim('-')
if ($branchSlug.Length -gt 20) { $branchSlug = $branchSlug.Substring(0,20).TrimEnd('-') }
if (-not $branchSlug) { $branchSlug = 'detached' }
$dateCompact = $ReleaseDate.Replace('-','')
$sha7 = $SourceCommit.Substring(0,7).ToLowerInvariant()
$effectiveSeq = if ($DailySeq -gt 0) { $DailySeq } elseif ($BuildNumber -gt 0) { (($BuildNumber - 1) % 99) + 1 } else { 0 }
$buildCode = [int64]("$dateCompact" + $effectiveSeq.ToString('00'))
if ($buildCode -ge 2100000000) { throw "buildCode $buildCode exceeds Google Play Int32 ceiling." }
$buildId = "hub-v$version-$dateCompact-$BuildTime-$branchSlug-g$sha7-b$BuildNumber"
$name = "PlayHub_Portable_v$($version)_$($dateCompact)_$($BuildTime)_$($branchSlug)_g$($sha7)_b$($BuildNumber)_win-x64"
if ($Variant) { $name += '_' + $Variant }
$archive = Join-Path $outputRoot ($name + '.zip')
if (Test-Path -LiteralPath $archive) { throw ('The release already exists: ' + $archive) }
$scratch = Join-Path $outputRoot ('.package-' + [Guid]::NewGuid().ToString('N'))
$contents = Join-Path $scratch 'contents'
$package = Join-Path $contents 'PlayHub'
try {
  [void](New-Item -ItemType Directory -Path (Join-Path $package 'licenses') -Force)
  Copy-Item -LiteralPath $executable -Destination (Join-Path $package 'PlayHub.exe')
  foreach ($guide in @('README_KO.txt','START_HERE.html')) {
    $inputFile = Join-Path $sourceRoot ('portable/distribution/' + $guide)
    Assert-Regular $inputFile
    Copy-Item -LiteralPath $inputFile -Destination (Join-Path $package $guide)
  }
  foreach ($license in @('Node-LICENSE.txt','PORTABLE-NOTICES.txt')) {
    $inputFile = Join-Path $sourceRoot ('../licenses/' + $license)
    Assert-Regular $inputFile
    Copy-Item -LiteralPath $inputFile -Destination (Join-Path $package ('licenses/' + $license))
  }
  [void](New-Item -ItemType Directory -Path (Join-Path $package 'tools') -Force)
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'portable/distribution/Transfer_PlayHub.ps1') -Destination (Join-Path $package 'tools/Transfer_PlayHub.ps1')
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'portable/protect-instance.ps1') -Destination (Join-Path $package 'tools/protect-instance.ps1')
  $transferCommands = [ordered]@{'Export_PlayHub_Data.cmd'='ExportData';'Import_PlayHub_Data.cmd'='ImportData';'Export_PlayHub_Logs.cmd'='ExportLogs';'Import_PlayHub_Logs.cmd'='ImportLogs'}
  foreach ($command in $transferCommands.GetEnumerator()) {
    Write-Utf8 (Join-Path $package $command.Key) ("@echo off`r`nchcp 65001 >nul`r`npowershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File `"%~dp0tools\Transfer_PlayHub.ps1`" -Mode " + $command.Value + "`r`npause`r`n")
  }
  $nodeLicense = $build.bundle.files | Where-Object path -eq 'licenses/Node-LICENSE.txt'
  if (-not $SkipValidation -and (Hash (Join-Path $package 'licenses/Node-LICENSE.txt')) -cne $nodeLicense.sha256) { throw 'Node license does not match the embedded runtime license.' }
  Write-Utf8 (Join-Path $package 'Run_PlayHub.cmd') "@echo off`r`nchcp 65001 >nul`r`ncd /d `"%~dp0`"`r`n`"%~dp0PlayHub.exe`"`r`nif errorlevel 1 pause`r`n"
  $buildInfo = [ordered]@{
    schemaVersion = 1; target = 'hub'; semver = $version; channel = $Channel
    buildId = $buildId; buildCode = $buildCode; buildNum = $BuildNumber; dailySeq = $effectiveSeq
    builtAtUtc = $nowUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    builtAtKst = $nowKst.ToString('yyyy-MM-ddTHH:mm:ss+09:00')
    dateKst = $dateCompact; timeKst = $BuildTime
    git = [ordered]@{ branch = $Branch; branchSlug = $branchSlug; commit = $SourceCommit; sha7 = $sha7; dirty = $false }
    compat = [ordered]@{ engineAbi = 'godot-4.7'; engineApiRev = 1; minEngineApiRev = 1; netProtocol = '1.0'; gameplayHash = 'default' }
    updatePolicy = $UpdatePolicy; minClientBuildCode = $(if ($UpdatePolicy -eq 'force') { $buildCode } else { 0 })
  }
  Write-Utf8 (Join-Path $package 'BUILD_INFO.json') (($buildInfo | ConvertTo-Json -Depth 8) + "`n")
  $payloadFiles = @(Get-ChildItem -LiteralPath $package -File -Recurse | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=$_.FullName.Substring($package.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Hash $_.FullName)}
  })
  $manifest = [ordered]@{
    schemaVersion=1;product='PlayHub Portable';version=$version;buildId=$buildId;buildCode=$buildCode;updatePolicy=$UpdatePolicy
    releaseDate=$ReleaseDate;buildTimeKst=$BuildTime;branch=$Branch;sourceCommit=$SourceCommit;target='win-x64'
    executableSha256=$build.executable.sha256;embeddedPayloadSha256=$build.bundle.payloadSha256;embeddedFileCount=$build.bundle.fileCount
    games=$gameCount;locales=@('ko','en','ja','zh-CN','fr','es','pt-BR','hi');personalDataIncluded=$false;rebexIncluded=$false
    transferModes=@('data','logs');validationSkipped=[bool]$SkipValidation
    files=$payloadFiles;manifestScope='Payload files; PACKAGE_MANIFEST.json and SHA256SUMS.txt excluded to avoid circular hashes.'
  }
  Write-Utf8 (Join-Path $package 'PACKAGE_MANIFEST.json') (($manifest | ConvertTo-Json -Depth 8) + "`n")
  $sumLines = @(Get-ChildItem -LiteralPath $package -File -Recurse | Sort-Object FullName | ForEach-Object {
    (Hash $_.FullName) + '  ' + $_.FullName.Substring($package.Length+1).Replace('\','/')
  })
  Write-Utf8 (Join-Path $package 'SHA256SUMS.txt') (($sumLines -join "`n") + "`n")
  $expectedFiles = @(Get-ChildItem -LiteralPath $package -File -Recurse | ForEach-Object {
    [pscustomobject]@{path=('PlayHub/' + $_.FullName.Substring($package.Length+1).Replace('\','/'));sha256=(Hash $_.FullName)}
  })
  $allowed = @('PlayHub/PlayHub.exe','PlayHub/Run_PlayHub.cmd','PlayHub/README_KO.txt','PlayHub/START_HERE.html','PlayHub/licenses/Node-LICENSE.txt','PlayHub/licenses/PORTABLE-NOTICES.txt','PlayHub/BUILD_INFO.json','PlayHub/PACKAGE_MANIFEST.json','PlayHub/SHA256SUMS.txt')
  $allowed += @('PlayHub/Export_PlayHub_Data.cmd','PlayHub/Import_PlayHub_Data.cmd','PlayHub/Export_PlayHub_Logs.cmd','PlayHub/Import_PlayHub_Logs.cmd','PlayHub/tools/Transfer_PlayHub.ps1','PlayHub/tools/protect-instance.ps1')
  if ($expectedFiles.Count -ne $allowed.Count -or @($expectedFiles | Where-Object { $_.path -cnotin $allowed }).Count) { throw 'Unexpected file in distribution.' }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $candidate = Join-Path $scratch ($name + '.zip')
  $writer = [IO.Compression.ZipFile]::Open($candidate, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $expectedFiles) {
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($writer, (Join-Path $contents $file.path), $file.path, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $writer.Dispose() }
  $probe = $null
  if (-not $SkipValidation) {
  $zip = [IO.Compression.ZipFile]::OpenRead($candidate)
  try {
    $entries = @($zip.Entries | Where-Object { $_.Name })
    if ($entries.Count -ne $allowed.Count -or @($entries | Where-Object { $_.FullName -cnotin $allowed }).Count -or @($entries.FullName | Select-Object -Unique).Count -ne $allowed.Count) { throw 'Unexpected ZIP contents.' }
  } finally { $zip.Dispose() }
  $unpacked = Join-Path $scratch 'unpacked'
  [IO.Compression.ZipFile]::ExtractToDirectory($candidate,$unpacked)
  foreach ($file in $expectedFiles) {
    if ((Hash (Join-Path $unpacked $file.path)) -cne $file.sha256) { throw ('Archive integrity mismatch: ' + $file.path) }
  }
  $probeRoot = Join-Path $scratch 'package-check'
  $probeText = & (Join-Path $unpacked 'PlayHub/PlayHub.exe') --data-dir $probeRoot --package-check
  if ($LASTEXITCODE -ne 0) { throw 'Extracted executable package check failed.' }
  $probe = ($probeText -join "`n") | ConvertFrom-Json
  if (-not $probe.ok -or -not $probe.sea -or -not $probe.esmEntryImported -or $probe.sqliteResult -ne 42 -or $probe.payloadSha256 -cne $build.bundle.payloadSha256) { throw 'Extracted executable payload check failed.' }
  }
  Move-Item -LiteralPath $candidate -Destination $archive
  $archiveHash = Hash $archive
  Write-Utf8 ($archive + '.sha256') ($archiveHash + '  ' + [IO.Path]::GetFileName($archive) + "`n")
  $result = [ordered]@{ok=$true;archive=$archive;bytes=(Get-Item -LiteralPath $archive).Length;sha256=$archiveHash;files=$expectedFiles.Count;sourceCommit=$SourceCommit;executableSha256=$build.executable.sha256;validationSkipped=[bool]$SkipValidation;extractedPackageCheck=$probe;rebexIncluded=$false;personalDataIncluded=$false}
  Write-Utf8 ($archive + '.validation.json') (($result | ConvertTo-Json -Depth 8) + "`n")
  $result | ConvertTo-Json -Depth 8
} finally {
  # Remove only this invocation's GUID scratch directory under the verified output root.
  $resolvedScratch = [IO.Path]::GetFullPath($scratch)
  if (-not $resolvedScratch.StartsWith($outputRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedScratch) -notmatch '^\.package-[a-f0-9]{32}$') { throw 'Refusing scratch cleanup outside the output directory.' }
  if (Test-Path -LiteralPath $resolvedScratch) { Remove-Item -LiteralPath $resolvedScratch -Recurse -Force }
}
