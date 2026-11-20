param(
    [string]$TemplateZip = (Join-Path $env:APPDATA "Godot\export_templates\4.7.2.stable\android_source.zip"),
    [string]$AndroidDir = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "android"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TemplateZip)) {
    throw "Godot 4.7.2 Android export template zip not found: $TemplateZip"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$libsDir = Join-Path $AndroidDir "app\libs"
$wrapperDir = Join-Path $AndroidDir "gradle\wrapper"
New-Item -ItemType Directory -Force -Path $libsDir, $wrapperDir | Out-Null

$aarTarget = Join-Path $libsDir "godot-lib.template_release.aar"
$wrapperJarTarget = Join-Path $wrapperDir "gradle-wrapper.jar"
$lockFile = Join-Path $PSScriptRoot "godot-aar.lock.json"

$zip = [System.IO.Compression.ZipFile]::OpenRead($TemplateZip)
try {
    if ($Force -or -not (Test-Path $aarTarget)) {
        $entry = $zip.GetEntry("libs/release/godot-lib.template_release.aar")
        if (-not $entry) { throw "libs/release/godot-lib.template_release.aar missing inside $TemplateZip" }
        Write-Host "Extracting godot-lib.template_release.aar..."
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $aarTarget, $true)
    }

    if ($Force -or -not (Test-Path $wrapperJarTarget)) {
        $wEntry = $zip.GetEntry("gradle/wrapper/gradle-wrapper.jar")
        if (-not $wEntry) { throw "gradle/wrapper/gradle-wrapper.jar missing inside $TemplateZip" }
        Write-Host "Extracting gradle-wrapper.jar..."
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($wEntry, $wrapperJarTarget, $true)
    }
} finally {
    $zip.Dispose()
}

$aarHash = (Get-FileHash -Algorithm SHA256 -Path $aarTarget).Hash.ToLowerInvariant()
$aarSize = (Get-Item $aarTarget).Length

if (Test-Path $lockFile) {
    $lock = Get-Content -Raw -Path $lockFile | ConvertFrom-Json
    if ($lock.sha256 -and ($lock.sha256.ToLowerInvariant() -ne $aarHash)) {
        throw "godot-lib.template_release.aar SHA-256 mismatch! Expected $($lock.sha256), got $aarHash"
    }
} else {
    $lockObj = [ordered]@{
        godotVersion = "4.7.2-stable"
        forkCommit   = "ed1daf0bf001b61586d9930840f2f1394092c079"
        artifact     = "libs/release/godot-lib.template_release.aar"
        bytes        = $aarSize
        sha256       = $aarHash
    }
    $lockObj | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path $lockFile
}

Write-Host "OK: godot-lib.template_release.aar ($([math]::Round($aarSize / 1MB, 2)) MiB, sha256=$($aarHash.Substring(0,16))...)"
