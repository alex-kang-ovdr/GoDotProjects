param(
    [string]$TemplateZip = (Join-Path $env:APPDATA "Godot\export_templates\4.7.2.stable\ios.zip"),
    [string]$IosDir = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "ios"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TemplateZip)) {
    throw "Godot 4.7.2 iOS export template zip not found: $TemplateZip"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$vendorDir = Join-Path $IosDir "Vendor"
$xcframeworkDir = Join-Path $vendorDir "libgodot.ios.release.xcframework"
$privacyTarget = Join-Path $vendorDir "GodotPrivacyInfo.xcprivacy"
$lockFile = Join-Path $PSScriptRoot "godot-xcframework.lock.json"

New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

# Deliberately extract ONLY libgodot.ios.release.xcframework and PrivacyInfo.xcprivacy.
# Excluded by minimal-footprint policy:
# - libgodot.ios.debug.xcframework (210+ MiB debug symbols)
# - MoltenVK.xcframework (6.60 MiB; native Metal + GLES3 used on iOS)
# - libgodot_camera.*.xcframework (camera QR handled natively via AVFoundation)
$prefix = "libgodot.ios.release.xcframework/"
$deviceLibPath = Join-Path $xcframeworkDir "ios-arm64\libgodot.a"
$simLibPath = Join-Path $xcframeworkDir "ios-arm64_x86_64-simulator\libgodot.a"

$zip = [System.IO.Compression.ZipFile]::OpenRead($TemplateZip)
try {
    if ($Force -or -not (Test-Path $deviceLibPath) -or -not (Test-Path $simLibPath)) {
        if (Test-Path $xcframeworkDir) {
            Remove-Item -Recurse -Force $xcframeworkDir
        }
        $extracted = 0
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
                $relPath = $entry.FullName.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                $destPath = Join-Path $vendorDir $relPath
                if ($entry.FullName.EndsWith("/")) {
                    New-Item -ItemType Directory -Force -Path $destPath | Out-Null
                } else {
                    $parent = Split-Path -Parent $destPath
                    New-Item -ItemType Directory -Force -Path $parent | Out-Null
                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
                    $extracted++
                }
            }
        }
        if ($extracted -eq 0) {
            throw "libgodot.ios.release.xcframework not found inside $TemplateZip"
        }
        Write-Host "Extracted libgodot.ios.release.xcframework ($extracted files) to $xcframeworkDir"
    }

    if ($Force -or -not (Test-Path $privacyTarget)) {
        $privEntry = $zip.GetEntry("PrivacyInfo.xcprivacy")
        if ($privEntry) {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($privEntry, $privacyTarget, $true)
        }
    }
} finally {
    $zip.Dispose()
}

if (-not (Test-Path $deviceLibPath)) { throw "Missing extracted device archive: $deviceLibPath" }
if (-not (Test-Path $simLibPath)) { throw "Missing extracted simulator archive: $simLibPath" }

$deviceHash = (Get-FileHash -Algorithm SHA256 -Path $deviceLibPath).Hash.ToLowerInvariant()
$deviceBytes = (Get-Item $deviceLibPath).Length
$simHash = (Get-FileHash -Algorithm SHA256 -Path $simLibPath).Hash.ToLowerInvariant()
$simBytes = (Get-Item $simLibPath).Length

if (Test-Path $lockFile) {
    $lock = Get-Content -Raw -Path $lockFile | ConvertFrom-Json
    if ($lock.slices.iosArm64.sha256 -and ($lock.slices.iosArm64.sha256.ToLowerInvariant() -ne $deviceHash)) {
        throw "ios-arm64/libgodot.a SHA-256 mismatch! Expected $($lock.slices.iosArm64.sha256), got $deviceHash"
    }
    if ($lock.slices.iosSimulator.sha256 -and ($lock.slices.iosSimulator.sha256.ToLowerInvariant() -ne $simHash)) {
        throw "ios-arm64_x86_64-simulator/libgodot.a SHA-256 mismatch! Expected $($lock.slices.iosSimulator.sha256), got $simHash"
    }
} else {
    $lockObj = [ordered]@{
        godotVersion = "4.7.2-stable"
        forkCommit   = "ed1daf0bf001b61586d9930840f2f1394092c079"
        artifact     = "libgodot.ios.release.xcframework"
        excluded     = @(
            "libgodot.ios.debug.xcframework",
            "MoltenVK.xcframework",
            "libgodot_camera.ios.release.xcframework",
            "libgodot_camera.ios.debug.xcframework"
        )
        slices       = [ordered]@{
            iosArm64     = [ordered]@{
                path   = "libgodot.ios.release.xcframework/ios-arm64/libgodot.a"
                bytes  = $deviceBytes
                sha256 = $deviceHash
            }
            iosSimulator = [ordered]@{
                path   = "libgodot.ios.release.xcframework/ios-arm64_x86_64-simulator/libgodot.a"
                bytes  = $simBytes
                sha256 = $simHash
            }
        }
    }
    $lockJson = ($lockObj | ConvertTo-Json -Depth 5) + "`n"
    [System.IO.File]::WriteAllText($lockFile, $lockJson, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "OK: libgodot.ios.release.xcframework verified"
Write-Host "  - ios-arm64     : $([math]::Round($deviceBytes / 1MB, 2)) MiB (sha256=$($deviceHash.Substring(0,16))...)"
Write-Host "  - ios-simulator : $([math]::Round($simBytes / 1MB, 2)) MiB (sha256=$($simHash.Substring(0,16))...)"
Write-Host "  - Excluded      : MoltenVK.xcframework, libgodot_camera.*, libgodot.ios.debug.xcframework"
