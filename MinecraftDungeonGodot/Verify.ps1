param(
    [switch]$SkipCapture,
    [switch]$RenderComparison,
    [ValidateRange(0, 32)][int]$BenchmarkScreen = 0
)

$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$godotExecutable = Join-Path (Split-Path $projectDirectory -Parent) 'Godot_v4.7.2-stable_win64.exe'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$evidenceDirectory = Join-Path $projectDirectory "Saved/Verification/$stamp"
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null

function Invoke-GodotStage {
    param([string]$Name, [string[]]$StageArguments, [string]$SuccessMarker = '', [int]$TimeoutSeconds = 120, [int]$ExpectedExitCode = 0)
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $godotExecutable
    $startInfo.WorkingDirectory = $projectDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $StageArguments) { $startInfo.ArgumentList.Add($argument) }
    $stageProcess = [System.Diagnostics.Process]::new()
    $stageProcess.StartInfo = $startInfo
    $stageProcess.Start() | Out-Null
    $outputTask = $stageProcess.StandardOutput.ReadToEndAsync()
    $errorTask = $stageProcess.StandardError.ReadToEndAsync()
    $stageTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $peakWorkingSet = 0L
    $finished = $false
    while ($stageTimer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $finished = $stageProcess.WaitForExit(100)
        if ($finished) { break }
        $stageProcess.Refresh()
        $peakWorkingSet = [Math]::Max($peakWorkingSet, $stageProcess.PeakWorkingSet64)
    }
    if (-not $finished) {
        $stageProcess.Kill($true)
        $stageProcess.WaitForExit()
    }
    $stageOutput = $outputTask.GetAwaiter().GetResult() + $errorTask.GetAwaiter().GetResult()
    $stageExitCode = $stageProcess.ExitCode
    $stageTimer.Stop()
    @{ stage = $Name; process_id = $stageProcess.Id; executable = $godotExecutable; exit_code = $stageExitCode; elapsed_ms = $stageTimer.Elapsed.TotalMilliseconds; peak_working_set_bytes = $peakWorkingSet; sampling_interval_ms = 100 } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceDirectory "$Name.process.json") -Encoding utf8
    $stageProcess.Dispose()
    $stageOutput | Set-Content -LiteralPath (Join-Path $evidenceDirectory "$Name.log") -Encoding utf8
    Write-Output $stageOutput
    if (-not $finished) { throw "$Name timed out after $TimeoutSeconds seconds; evidence retained" }
    if ($stageExitCode -ne $ExpectedExitCode) { throw "$Name exited with code $stageExitCode (expected $ExpectedExitCode)" }
    if ($stageOutput -match '(?m)^(SCRIPT ERROR:|ERROR:)') { throw "$Name emitted a Godot error despite exit code 0" }
    if ($SuccessMarker -and -not $stageOutput.Contains($SuccessMarker)) { throw "$Name did not emit required completion marker: $SuccessMarker" }
}

Invoke-GodotStage -Name 'import' -StageArguments @('--headless', '--path', $projectDirectory, '--editor', '--quit')
Invoke-GodotStage -Name 'tests' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tests/test_runner.gd') -SuccessMarker 'PASS:'
Invoke-GodotStage -Name 'display-contract' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/display_contract_smoke.gd') -SuccessMarker 'DISPLAY CONTRACT SMOKE:'
Invoke-GodotStage -Name 'display-headless-reject' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd') -SuccessMarker 'RENDER OPTIONS REJECTED:' -ExpectedExitCode 2
Invoke-GodotStage -Name 'climate-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/climate_smoke.gd') -SuccessMarker 'CLIMATE SMOKE:'
Invoke-GodotStage -Name 'landmark-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/landmark_data.gd') -SuccessMarker 'LANDMARK DATA:'
Invoke-GodotStage -Name 'cave-network-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/cave_network_data.gd') -SuccessMarker 'CAVE NETWORK DATA:'
Invoke-GodotStage -Name 'wayfinding-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/wayfinding_smoke.gd') -SuccessMarker 'WAYFINDING SMOKE:'
Invoke-GodotStage -Name 'mining-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/mining_smoke.gd') -SuccessMarker 'MINING DATA:'
Invoke-GodotStage -Name 'orientation-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/orientation_smoke.gd') -SuccessMarker 'ORIENTATION SMOKE:'
Invoke-GodotStage -Name 'drop-conservation' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/drop_conservation_smoke.gd') -SuccessMarker 'DROP CONSERVATION:'
Invoke-GodotStage -Name 'placement-commit' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/placement_commit_smoke.gd') -SuccessMarker 'PLACEMENT COMMIT: passed=true'
Invoke-GodotStage -Name 'inventory-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/inventory_smoke.gd') -SuccessMarker 'INVENTORY SMOKE:'
Invoke-GodotStage -Name 'crafting-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/crafting_smoke.gd') -SuccessMarker 'CRAFTING SMOKE:'
Invoke-GodotStage -Name 'station-data' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/station_smoke.gd') -SuccessMarker 'STATION SMOKE:'
Invoke-GodotStage -Name 'survival-debug' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/survival_debug_smoke.gd') -SuccessMarker 'SURVIVAL DEBUG SMOKE:'
Invoke-GodotStage -Name 'survival-benchmark' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/benchmark_survival.gd') -SuccessMarker 'SURVIVAL BENCHMARK:'
Invoke-GodotStage -Name 'interface-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/interface_smoke.gd') -SuccessMarker 'INTERFACE SMOKE:'
Invoke-GodotStage -Name 'launch-native' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/launch_smoke.gd', '--', '--mode=dungeon', '--seed=-7', '--size=12', '--room-attempts=34', '--checks=off', '--poi=on') -SuccessMarker 'LAUNCH SMOKE: passed=true'
Invoke-GodotStage -Name 'launch-legacy' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/launch_smoke.gd', '--', '--case=legacy', '-Overworld', '-DungeonSeed=42', '-WorldSize=42', '-RoomAttempts=34', '-DungeonPOI') -SuccessMarker 'LAUNCH SMOKE: passed=true'
Invoke-GodotStage -Name 'launch-invalid' -StageArguments @('--headless', '--path', $projectDirectory, '--', '--seed=invalid') -SuccessMarker 'LAUNCH OPTIONS REJECTED:' -ExpectedExitCode 2
Invoke-GodotStage -Name 'gameplay-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/gameplay_smoke.gd') -SuccessMarker 'GAMEPLAY SMOKE PASS:'
Invoke-GodotStage -Name 'persistence-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/persistence_smoke.gd') -SuccessMarker 'PERSISTENCE SMOKE:'
Invoke-GodotStage -Name 'builder-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/builder_smoke.gd') -SuccessMarker 'BUILDER SMOKE:'
Invoke-GodotStage -Name 'controls-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/controls_smoke.gd', '--', "--output=res://Saved/Verification/$stamp") -SuccessMarker 'CONTROLS SMOKE:'
Invoke-GodotStage -Name 'dungeon-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/dungeon_smoke.gd') -SuccessMarker 'DUNGEON SMOKE:'
foreach ($phase in @('write', 'read')) {
    Invoke-GodotStage -Name "restart-$phase" -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/restart_persistence.gd', '--', "--phase=$phase", "--output=res://Saved/Verification/$stamp") -SuccessMarker "RESTART PERSISTENCE ${phase}:"
    Invoke-GodotStage -Name "dungeon-restart-$phase" -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/restart_persistence.gd', '--', '--dungeon', "--phase=$phase", "--output=res://Saved/Verification/$stamp") -SuccessMarker "RESTART PERSISTENCE ${phase}:"
}
Invoke-GodotStage -Name 'meshing-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/meshing_smoke.gd') -SuccessMarker 'MESHING SMOKE:'
Invoke-GodotStage -Name 'plane-cache-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/plane_cache_smoke.gd') -SuccessMarker 'PLANE CACHE SMOKE:'
Invoke-GodotStage -Name 'retirement-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/retirement_smoke.gd') -SuccessMarker 'RETIREMENT SMOKE:'
Invoke-GodotStage -Name 'optimization-equivalence' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/optimization_equivalence.gd') -SuccessMarker 'OPTIMIZATION EQUIVALENCE:'
Invoke-GodotStage -Name 'mask-microbenchmark' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/benchmark_masks.gd') -SuccessMarker 'MASK MICROBENCHMARK:'
Invoke-GodotStage -Name 'generation-audit' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/generation_audit.gd') -SuccessMarker 'GENERATION AUDIT: 0 violations'
Invoke-GodotStage -Name 'cave-traversal' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/cave_traversal_smoke.gd') -SuccessMarker 'CAVE TRAVERSAL PASS:'
Invoke-GodotStage -Name 'cave-network-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/cave_network_smoke.gd', '--', '--accelerated') -SuccessMarker 'CAVE NETWORK SMOKE:' -TimeoutSeconds 180
Invoke-GodotStage -Name 'landmark-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/landmark_smoke.gd', '--', '--accelerated') -SuccessMarker 'LANDMARK SMOKE:'
Invoke-GodotStage -Name 'crouch-smoke' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/crouch_smoke.gd') -SuccessMarker 'CROUCH SMOKE:'
Invoke-GodotStage -Name 'property-matrix' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/property_matrix.gd') -SuccessMarker 'PROPERTY MATRIX PASS:'
Invoke-GodotStage -Name 'benchmark' -StageArguments @('--headless', '--path', $projectDirectory, '--script', 'res://tools/benchmark_generation.gd') -SuccessMarker 'BENCHMARK:'

if (-not $SkipCapture) {
    Invoke-GodotStage -Name 'input-smoke' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/gameplay_smoke.gd') -SuccessMarker 'INPUT SMOKE PASS:'
    $relativeEvidence = "res://Saved/Verification/$stamp"
    Invoke-GodotStage -Name 'display-screen-reject' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd', '--', '--screen=999') -SuccessMarker 'RENDER OPTIONS REJECTED:' -ExpectedExitCode 2
    Invoke-GodotStage -Name 'display-fps-reject' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd', '--', '--max-fps=invalid') -SuccessMarker 'RENDER OPTIONS REJECTED:' -ExpectedExitCode 2
    Invoke-GodotStage -Name 'render-latency' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/render_latency_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'RENDER LATENCY SMOKE:'
    Invoke-GodotStage -Name 'cave-network-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/cave_network_smoke.gd', '--', '--accelerated', "--output=$relativeEvidence") -SuccessMarker 'CAVE NETWORK SMOKE:' -TimeoutSeconds 180
    Invoke-GodotStage -Name 'wayfinding-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/wayfinding_capture.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'WAYFINDING CAPTURE:'
    Invoke-GodotStage -Name 'mining-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/mining_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'MINING SMOKE:'
    Invoke-GodotStage -Name 'orientation-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/orientation_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'ORIENTATION SMOKE:'
    Invoke-GodotStage -Name 'inventory-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/inventory_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'INVENTORY SMOKE:'
    Invoke-GodotStage -Name 'crafting-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/crafting_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'CRAFTING SMOKE:'
    Invoke-GodotStage -Name 'station-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/station_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'STATION SMOKE:'
    Invoke-GodotStage -Name 'lighting-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/lighting_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'LIGHTING SMOKE:'
    Invoke-GodotStage -Name 'interface-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/interface_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'INTERFACE SMOKE:'
    Invoke-GodotStage -Name 'landmark-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/landmark_smoke.gd', '--', '--accelerated', "--output=$relativeEvidence") -SuccessMarker 'LANDMARK SMOKE:'
    Invoke-GodotStage -Name 'controls-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/controls_smoke.gd', '--', '--large', "--output=$relativeEvidence") -SuccessMarker 'CONTROLS SMOKE:'
    Invoke-GodotStage -Name 'dungeon-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/dungeon_smoke.gd', '--', '--runtime', "--output=$relativeEvidence") -SuccessMarker 'DUNGEON SMOKE:'
    Invoke-GodotStage -Name 'builder-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/builder_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'BUILDER INPUT:'
    Invoke-GodotStage -Name 'crouch-input' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/crouch_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'CROUCH SMOKE:'
    Invoke-GodotStage -Name 'runtime' -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/capture_smoke.gd', '--', "--output=$relativeEvidence") -SuccessMarker 'SMOKE PASS:'
}

if ($RenderComparison) {
    foreach ($backend in @('chunks', 'gridmap')) {
        Invoke-GodotStage -Name "render-$backend" -StageArguments @('--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd', '--', "--backend=$backend", "--screen=$BenchmarkScreen", "--output=res://Saved/Verification/$stamp") -SuccessMarker 'RENDER BENCHMARK PASS:'
    }
}

Write-Host "Verification evidence: $evidenceDirectory"
