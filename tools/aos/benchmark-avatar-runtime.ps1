param(
    [int]$Cycles = 5,
    [string]$AdbPath = "D:\SDK\AndroidSDK\platform-tools\adb.exe"
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$debugApk = Join-Path $repoRoot "android\app\build\outputs\apk\cfgDebug\debug\app-cfgDebug-debug.apk"
$releaseApk = Join-Path $repoRoot "android\app\build\outputs\apk\cfgRelease\release\app-cfgRelease-release.apk"
$shotDir = Join-Path $repoRoot "docs\aos\verification-m1"

function Wait-DeviceReady {
    for ($i = 0; $i -lt 60; $i++) {
        $raw = (& $AdbPath shell getprop sys.boot_completed 2>$null)
        if ($raw -and "$raw".Trim() -eq "1") { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Get-MemStats([string]$procName) {
    $pidRaw = (& $AdbPath shell pidof $procName 2>$null)
    if (-not $pidRaw -or [string]::IsNullOrWhiteSpace($pidRaw)) {
        return [PSCustomObject]@{ Proc = $procName; Pid = 0; TotalPssMB = 0.0; PrivateDirtyMB = 0.0; RssMB = 0.0 }
    }
    $pidStr = ($pidRaw.Trim() -split '\s+')[0]
    $dump = & $AdbPath shell dumpsys meminfo $procName 2>$null
    $pssKb = 0.0; $privKb = 0.0; $rssKb = 0.0
    foreach ($line in $dump) {
        if ($line -match '^\s*TOTAL\s+PSS:\s+(\d+)\s+TOTAL\s+RSS:\s+(\d+)') {
            $pssKb = [double]$Matches[1]
            $rssKb = [double]$Matches[2]
        }
        elseif ($line -match '^\s*TOTAL\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)') {
            if ($pssKb -eq 0) { $pssKb = [double]$Matches[1] }
            $privKb = [double]$Matches[2]
            if ($rssKb -eq 0) { $rssKb = [double]$Matches[5] }
        }
    }
    return [PSCustomObject]@{
        Proc = $procName
        Pid = [int]$pidStr
        TotalPssMB = [math]::Round($pssKb / 1024.0, 2)
        PrivateDirtyMB = [math]::Round($privKb / 1024.0, 2)
        RssMB = [math]::Round($rssKb / 1024.0, 2)
    }
}

Write-Output "=== Waiting for Android 15 Emulator ==="
if (-not (Wait-DeviceReady)) {
    Write-Error "Emulator did not complete boot in time."
    exit 1
}

Write-Output "=== Axis 5: APK Sizes ==="
$relSizeMiB = if (Test-Path $releaseApk) { [math]::Round((Get-Item $releaseApk).Length / 1MB, 2) } else { -1 }
$dbgSizeMiB = if (Test-Path $debugApk) { [math]::Round((Get-Item $debugApk).Length / 1MB, 2) } else { -1 }
Write-Output "Release APK (arm64-v8a): $relSizeMiB MiB | Debug APK (arm64+x86_64): $dbgSizeMiB MiB"

Write-Output "=== Installing Debug APK ==="
& $AdbPath install -r $debugApk | Write-Output
& $AdbPath shell run-as com.playhub.hub_aos.debug rm -f shared_prefs/playhub_avatar_v1.xml 2>$null
& $AdbPath logcat -c
& $AdbPath shell am force-stop com.playhub.hub_aos.debug
Start-Sleep -Seconds 1
& $AdbPath shell am start -n com.playhub.hub_aos.debug/com.playhub.aos.ui.MainActivity | Out-Null
Start-Sleep -Seconds 7

# Measure Baseline Idle Memory on Home Tab (Godot must NOT be running)
$baseMain = Get-MemStats "com.playhub.hub_aos.debug"
$baseGodot = Get-MemStats "com.playhub.hub_aos.debug:godot_runtime"
Write-Output "BASELINE_IDLE main_pid=$($baseMain.Pid) main_pss_mb=$($baseMain.TotalPssMB) main_priv_mb=$($baseMain.PrivateDirtyMB) main_rss_mb=$($baseMain.RssMB) godot_pid=$($baseGodot.Pid)"

for ($c = 1; $c -le $Cycles; $c++) {
    Write-Output "--- Inline Cycle $c / $Cycles ---"
    & $AdbPath shell dumpsys gfxinfo com.playhub.hub_aos.debug reset 2>$null | Out-Null

    # Tap Avatar tab directly (bottom nav center: 540, 2070) — inline Godot 3D preview starts inside Avatar tab!
    & $AdbPath shell input tap 540 2070
    Start-Sleep -Seconds 5

    if ($c -eq 1) {
        & $AdbPath shell screencap -p /sdcard/shot28.png
        & $AdbPath pull /sdcard/shot28.png (Join-Path $shotDir "28-godot-avatar-studio.png") | Out-Null
    }

    # Test 360 horizontal drag on sticky inline 4:3 Godot preview stage (y=680)
    & $AdbPath shell input swipe 300 680 780 680 280
    Start-Sleep -Milliseconds 400

    # Scroll bottom wardrobe independently (y=1850 -> 1350) + tap 5 cosmetics rapidly in-place
    & $AdbPath shell input swipe 540 1850 540 1350 260
    Start-Sleep -Milliseconds 400
    & $AdbPath shell input tap 280 1640
    Start-Sleep -Milliseconds 350
    & $AdbPath shell input tap 800 1640
    Start-Sleep -Milliseconds 350
    & $AdbPath shell input swipe 540 1880 540 1420 220
    Start-Sleep -Milliseconds 300
    & $AdbPath shell input tap 280 1820
    Start-Sleep -Milliseconds 350
    & $AdbPath shell input tap 800 1820
    Start-Sleep -Milliseconds 350
    & $AdbPath shell input swipe 540 1400 540 1920 240
    Start-Sleep -Milliseconds 350
    & $AdbPath shell input tap 280 1560
    Start-Sleep -Milliseconds 450

    if ($c -eq 1) {
        # Tap Save button right inside Avatar tab header (x=930, y=310)
        & $AdbPath shell input tap 930 310
        Start-Sleep -Seconds 1
        & $AdbPath shell screencap -p /sdcard/shot29.png
        & $AdbPath pull /sdcard/shot29.png (Join-Path $shotDir "29-godot-avatar-equipped.png") | Out-Null
    }

    # Measure Active Inline Memory (Main + :godot_runtime)
    $actMain = Get-MemStats "com.playhub.hub_aos.debug"
    $actGodot = Get-MemStats "com.playhub.hub_aos.debug:godot_runtime"
    $combPss = [math]::Round($actMain.TotalPssMB + $actGodot.TotalPssMB, 2)
    Write-Output "CYCLE_${c}_ACTIVE main_pss_mb=$($actMain.TotalPssMB) godot_pid=$($actGodot.Pid) godot_pss_mb=$($actGodot.TotalPssMB) godot_priv_mb=$($actGodot.PrivateDirtyMB) combined_pss_mb=$combPss"

    if ($c -eq 1) {
        Write-Output "=== Axis 3: Inline MainActivity GfxInfo (Cycle 1) ==="
        $gfx = & $AdbPath shell dumpsys gfxinfo com.playhub.hub_aos.debug 2>$null
        $gfx | Select-String -Pattern "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile" | ForEach-Object { Write-Output "GFX: $_" }
    }

    # Switch back to Home tab (bottom nav far-left: 108, 2100) — must cleanly destroy :godot_runtime!
    & $AdbPath shell input tap 108 2100
    Start-Sleep -Seconds 3

    if ($c -eq 1) {
        & $AdbPath shell screencap -p /sdcard/shot30.png
        & $AdbPath pull /sdcard/shot30.png (Join-Path $shotDir "30-hub-post-studio-return.png") | Out-Null
    }

    # Verify :godot_runtime PID is 0 (100% reclaimed) and Main PSS converged
    $retMain = Get-MemStats "com.playhub.hub_aos.debug"
    $retGodot = Get-MemStats "com.playhub.hub_aos.debug:godot_runtime"
    Write-Output "CYCLE_${c}_RETURN main_pss_mb=$($retMain.TotalPssMB) main_priv_mb=$($retMain.PrivateDirtyMB) godot_pid_after_exit=$($retGodot.Pid)"
}

& $AdbPath shell rm -f /sdcard/shot28.png /sdcard/shot29.png /sdcard/shot30.png 2>$null

Write-Output "=== Axis 2 & 3: Parsed Inline Godot Preview Latency & FPS Logs ==="
$logs = & $AdbPath logcat -d
$logs | Select-String -Pattern "PLAYHUB_INLINE_" | ForEach-Object { Write-Output $_.Line }

$fatal = $logs | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime.*com\.playhub|SIGSEGV"
if ($fatal) {
    Write-Output "CRASH_DETECTED:"
    $fatal | ForEach-Object { Write-Output $_.Line }
    exit 1
} else {
    Write-Output "ZERO_FATAL_CRASHES"
}
