param(
    [ValidateSet("debug", "dev", "test", "release", "live")]
    [string]$Config = "debug",
    [string]$PackageBranch = "",
    [string]$HubBaseUrl = "",
    [switch]$IncludeX86,
    [switch]$BundleAab,
    [switch]$SkipTests,
    [switch]$Offline,
    [double]$MaxApkMiB = 28.0
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$androidDir = Join-Path $repoRoot "android"
$extractScript = Join-Path $PSScriptRoot "extract-godot-aar.ps1"

if (-not $env:JAVA_HOME -and (Test-Path "D:\SDK\jdk-17.0.15.6-hotspot")) {
    $env:JAVA_HOME = "D:\SDK\jdk-17.0.15.6-hotspot"
}
if (-not $env:ANDROID_HOME -and (Test-Path "D:\SDK\AndroidSDK")) {
    $env:ANDROID_HOME = "D:\SDK\AndroidSDK"
    $env:ANDROID_SDK_ROOT = "D:\SDK\AndroidSDK"
}
if (-not $env:ANDROID_USER_HOME) {
    $localAndroidHome = Join-Path $androidDir ".gradle\android-user-home"
    New-Item -ItemType Directory -Force -Path $localAndroidHome | Out-Null
    $env:ANDROID_USER_HOME = $localAndroidHome
}

& powershell -ExecutionPolicy Bypass -File $extractScript

$variantMap = @{
    debug   = @{ flavor = "cfgDebug";   buildType = "debug";   taskSuffix = "CfgDebugDebug" }
    dev     = @{ flavor = "cfgDev";     buildType = "debug";   taskSuffix = "CfgDevDebug" }
    test    = @{ flavor = "cfgTest";    buildType = "release"; taskSuffix = "CfgTestRelease" }
    release = @{ flavor = "cfgRelease"; buildType = "release"; taskSuffix = "CfgReleaseRelease" }
    live    = @{ flavor = "cfgLive";    buildType = "release"; taskSuffix = "CfgLiveRelease" }
}
$selected = $variantMap[$Config]

$gradleArgs = @()
if ($Offline) { $gradleArgs += "--offline" }
if (-not $SkipTests) {
    $gradleArgs += ":app:testCfgDebugDebugUnitTest"
}
$targetTask = if ($BundleAab) { ":app:bundle$($selected.taskSuffix)" } else { ":app:assemble$($selected.taskSuffix)" }
$gradleArgs += $targetTask

if ($PackageBranch) { $gradleArgs += "-PpackageBranch=$PackageBranch" }
if ($HubBaseUrl) { $gradleArgs += "-PhubBaseUrl=$HubBaseUrl" }
if ($IncludeX86) { $gradleArgs += "-PincludeX86=true" }

Push-Location $androidDir
try {
    Write-Host "Running Gradle: gradlew.bat $($gradleArgs -join ' ')"
    & (Join-Path $androidDir "gradlew.bat") @gradleArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if ($BundleAab) {
    $aabDir = Join-Path $androidDir "app\build\outputs\bundle\$($selected.flavor)$($selected.buildType.Substring(0,1).ToUpperInvariant() + $selected.buildType.Substring(1))"
    $aab = Get-ChildItem -Path $aabDir -Filter "*.aab" | Select-Object -First 1
    if (-not $aab) { throw "AAB output not found in $aabDir" }
    Write-Host "OK: AAB built -> $($aab.FullName) ($([math]::Round($aab.Length / 1MB, 2)) MiB)"
    exit 0
}

$apkDir = Join-Path $androidDir "app\build\outputs\apk\$($selected.flavor)\$($selected.buildType)"
$apk = Get-ChildItem -Path $apkDir -Filter "*.apk" | Select-Object -First 1
if (-not $apk) { throw "APK output not found in $apkDir" }

# Automatic Quality & Security Gates
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk.FullName)
try {
    $entries = @($zip.Entries)
    $forgeHits = $entries | Where-Object { $_.FullName -match '(?i)(playforge|/forge/|editor_bridge|godot_editor)' }
    if ($forgeHits.Count -gt 0) {
        throw "FORGE EXCLUSION GATE FAILED: found forbidden entries: $($forgeHits.FullName -join ', ')"
    }

    $pckHits = $entries | Where-Object { $_.FullName -match '(?i)\.pck$' }
    if ($pckHits.Count -gt 0) {
        throw "MINIMAL FOOTPRINT GATE FAILED: unexpected bundled .pck inside APK: $($pckHits.FullName -join ', ')"
    }

    $soBytes = ($entries | Where-Object { $_.FullName -like 'lib/*' } | Measure-Object -Property CompressedLength -Sum).Sum
    $dexBytes = ($entries | Where-Object { $_.FullName -like '*.dex' } | Measure-Object -Property CompressedLength -Sum).Sum
    $resBytes = ($entries | Where-Object { $_.FullName -like 'res/*' -or $_.FullName -eq 'resources.arsc' } | Measure-Object -Property CompressedLength -Sum).Sum
    $abis = ($entries | Where-Object { $_.FullName -match '^lib/([^/]+)/' } | ForEach-Object { $Matches[1] } | Sort-Object -Unique)
} finally {
    $zip.Dispose()
}

$aapt2 = Join-Path $env:ANDROID_HOME "build-tools\36.0.0\aapt2.exe"
$resolvedPkgId = "(unknown)"
if (Test-Path $aapt2) {
    $badgingText = (& $aapt2 dump badging $apk.FullName 2>$null | Select-Object -First 3) -join "`n"
    if ($badgingText -match "package:\s+name='([^']+)'") {
        $resolvedPkgId = $Matches[1]
    }
}

$apkMiB = [math]::Round($apk.Length / 1MB, 2)
Write-Host "=== Play Hub Android APK Size & Gate Report ==="
Write-Host "Config      : $Config"
Write-Host "Package ID  : $resolvedPkgId"
Write-Host "Artifact    : $($apk.FullName)"
Write-Host "Total Size  : $apkMiB MiB ($($apk.Length) bytes)"
Write-Host "ABIs        : $($abis -join ', ')"
Write-Host "Native .so  : $([math]::Round($soBytes / 1MB, 2)) MiB (compressed)"
Write-Host "DEX code    : $([math]::Round($dexBytes / 1MB, 2)) MiB (compressed)"
Write-Host "Resources   : $([math]::Round($resBytes / 1MB, 2)) MiB (compressed)"
Write-Host "Forge Gate  : PASS (0 forbidden entries)"
Write-Host "Starter PCK : PASS (0 bundled .pck — 100% On-Demand)"

if ($resolvedPkgId -notmatch "^com\.playhub\.[a-z][a-z0-9_]*\.$Config$") {
    throw "PACKAGE ID GATE FAILED: '$resolvedPkgId' does not match ^com\.playhub\.[a-z][a-z0-9_]*\.$Config$"
}
Write-Host "Pkg ID Gate : PASS ($resolvedPkgId)"

$defaultBudget = if ($Config -in @("debug", "dev")) { 30.0 } else { $MaxApkMiB }
$budget = if ($IncludeX86) { $defaultBudget + 28.0 } else { $defaultBudget }
if ($apkMiB -gt $budget) {
    throw "APK SIZE BUDGET GATE FAILED: $apkMiB MiB > $budget MiB"
}
Write-Host "Size Budget : PASS ($apkMiB MiB <= $budget MiB)"

$apksigner = Join-Path $env:ANDROID_HOME "build-tools\36.0.0\apksigner.bat"
if (Test-Path $apksigner) {
    & $apksigner verify --print-certs $apk.FullName
    if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed!" }
    Write-Host "Signature   : PASS (apksigner verified)"
}
