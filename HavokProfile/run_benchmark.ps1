param(
    [string]$Godot = "D:\Github\GoDot-Engine\Godot_v4.7.2-stable_win64_console.exe",
    [string]$Sizes = "24,48,96",
    [int]$Repeats = 2,
    [int]$Ticks = 300,
    [int]$Seed = 1337,
    [switch]$Headless,
    [switch]$Shots,
    [switch]$BatchSync
)
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$Proj = Join-Path $Root "godot"
$Results = Join-Path $Root "results"
New-Item -ItemType Directory -Force $Results | Out-Null

$suffix = if ($BatchSync) { "-batch" } else { "" }
$engines = @(
    @{ Tag = "jolt$suffix";  Name = "Jolt Physics" },
    @{ Tag = "havok$suffix"; Name = "HavokPhysics" }
)

foreach ($eng in $engines) {
    $outDir = Join-Path $Results $eng.Tag
    New-Item -ItemType Directory -Force $outDir | Out-Null

    $overridePath = Join-Path $Proj "override.cfg"
    Set-Content -Path $overridePath -Value "[physics]`n3d/physics_engine=`"$($eng.Name)`"`n" -Encoding ASCII

    $argsList = @("--path", $Proj)
    if ($Headless) {
        $argsList += "--headless"
    } else {
        $argsList += @("--rendering-method", "forward_plus", "--rendering-driver", "vulkan")
    }
    $argsList += @("--", "--sizes=$Sizes", "--repeats=$Repeats", "--ticks=$Ticks", "--seed=$Seed", "--tag=$($eng.Tag)", "--out=$outDir")
    if ($Shots -and -not $Headless) {
        $argsList += "--shots"
    }
    if ($BatchSync) {
        $argsList += "--batch-sync"
    }

    Write-Host "=== Running $($eng.Name) (tag=$($eng.Tag), sizes=$Sizes, repeats=$Repeats, ticks=$Ticks) ==="
    $logFile = Join-Path $outDir "console.log"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $Godot @argsList 2>&1 | Out-File -FilePath $logFile -Encoding utf8
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    Get-Content $logFile | Select-String -Pattern "CASE |HAVOK_PROFILE_COMPLETE|ERROR:"
    if ($exitCode -ne 0) {
        Remove-Item $overridePath -ErrorAction SilentlyContinue
        throw "Benchmark failed for $($eng.Name) with exit code $exitCode"
    }
}

Remove-Item (Join-Path $Proj "override.cfg") -ErrorAction SilentlyContinue
Write-Host "All benchmark runs completed cleanly. Results in: $Results"
