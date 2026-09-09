param(
    [ValidateRange(1, 10)][int]$Rounds = 3,
    [ValidateRange(0, 32)][int]$Screen = 0,
    [ValidateRange(0, 1000)][int]$MaxFps = 0
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$enginePath = Join-Path (Split-Path $projectDirectory -Parent) 'Godot_v4.7.2-stable_win64.exe'
$evidenceDirectory = Join-Path $projectDirectory ('Saved/Verification/display-ab-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $evidenceDirectory | Out-Null
$results = @()
$captures = @{}
$referenceDisplay = $null
foreach ($workload in @('boundary', 'scattered')) {
    for ($round = 1; $round -le $Rounds; $round++) {
        $order = if ($round % 2 -eq 1) { @('on', 'off') } else { @('off', 'on') }
        foreach ($vsync in $order) {
            $runName = "$workload-$round-$vsync"
            $runDirectory = Join-Path $evidenceDirectory $runName
            New-Item -ItemType Directory -Path $runDirectory | Out-Null
            $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
            $startInfo.FileName = $enginePath
            $startInfo.UseShellExecute = $false
            $startInfo.CreateNoWindow = $true
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            foreach ($argument in @('--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd', '--', '--backend=chunks', '--lighting=game', "--vsync=$vsync", '--geometry=cached', "--screen=$Screen", "--max-fps=$MaxFps", "--workload=$workload", "--output=$runDirectory")) { $startInfo.ArgumentList.Add($argument) }
            $runProcess = [System.Diagnostics.Process]::new()
            $runProcess.StartInfo = $startInfo
            $runProcess.Start() | Out-Null
            $outputTask = $runProcess.StandardOutput.ReadToEndAsync()
            $errorTask = $runProcess.StandardError.ReadToEndAsync()
            $timer = [System.Diagnostics.Stopwatch]::StartNew()
            $peak = 0L
            $finished = $false
            while ($timer.Elapsed.TotalSeconds -lt 120) {
                $finished = $runProcess.WaitForExit(100)
                if ($finished) { break }
                $runProcess.Refresh()
                $peak = [Math]::Max($peak, $runProcess.PeakWorkingSet64)
            }
            if (-not $finished) { $runProcess.Kill($true); $runProcess.WaitForExit() }
            $log = $outputTask.GetAwaiter().GetResult() + $errorTask.GetAwaiter().GetResult()
            $log | Set-Content -LiteralPath (Join-Path $runDirectory 'render.log') -Encoding utf8
            $metadata = @{ process_id = $runProcess.Id; executable = $enginePath; peak_working_set_bytes = $peak; sampling_interval_ms = 100; elapsed_ms = $timer.Elapsed.TotalMilliseconds; exit_code = $runProcess.ExitCode }
            $metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'process.json') -Encoding utf8
            $runProcess.Dispose()
            if (-not $finished -or $metadata.exit_code -ne 0 -or $log -match '(?m)^(SCRIPT ERROR:|ERROR:)' -or -not $log.Contains('RENDER BENCHMARK PASS:')) { throw "$runName failed; evidence: $runDirectory" }
            $metrics = Get-Content -LiteralPath (Join-Path $runDirectory 'chunks.json') -Raw | ConvertFrom-Json
            $expectedVsync = if ($vsync -eq 'on') { 1 } else { 0 }
            if (-not $metrics.rendered -or -not $metrics.display_conditions_valid -or $metrics.signature -ne 392942167 -or $metrics.cells -ne 1062829 -or $metrics.vsync_mode -ne $expectedVsync -or $metrics.display_before.screen -ne $Screen -or $metrics.display_before.engine_max_fps -ne $MaxFps -or $metrics.window_focus_samples.Contains($false)) { throw "$runName did not preserve test conditions" }
            $display = @{ screen = $metrics.display_before.screen; position = $metrics.display_before.position; size = $metrics.display_before.size; refresh_hz = $metrics.display_before.refresh_hz; screens = $metrics.display_before.screens } | ConvertTo-Json -Depth 8 -Compress
            if ($null -eq $referenceDisplay) { $referenceDisplay = $display }
            if ($display -ne $referenceDisplay) { throw "$runName display differs from first run" }
            $capture = (Get-FileHash -LiteralPath (Join-Path $runDirectory 'chunks.png') -Algorithm SHA256).Hash
            if ($captures.ContainsKey($workload) -and $captures[$workload] -ne $capture) { throw "$runName final viewport changed" }
            $captures[$workload] = $capture
            $result = @{ run = $runName; screen = $Screen; refresh_hz = $metrics.display_before.refresh_hz; max_fps = $MaxFps; idle_median_ms = $metrics.idle_frame_median_ms; idle_p95_ms = $metrics.idle_frame_p95_ms; cpu_p95_ms = $metrics.edit_submit_p95_ms; frame_p95_ms = $metrics.edit_to_viewport_update_p95_ms; ready_ms = $metrics.ready_ms; peak_mib = $peak / 1MB; capture_sha256 = $capture }
            $results += $result
            $results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'summary.json') -Encoding utf8
            $result | ConvertTo-Json -Compress | Write-Output
        }
    }
}
Write-Output "DISPLAY A/B PASS: $evidenceDirectory"
