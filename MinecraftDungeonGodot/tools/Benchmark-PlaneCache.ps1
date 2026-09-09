param([ValidateRange(1, 10)][int]$Rounds = 3, [ValidateRange(0, 32)][int]$Screen = 0)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$enginePath = Join-Path (Split-Path $projectDirectory -Parent) 'Godot_v4.7.2-stable_win64.exe'
$evidenceDirectory = Join-Path $projectDirectory ('Saved/Verification/plane-ab-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $evidenceDirectory | Out-Null
$results = @()
$referenceDisplay = $null
foreach ($workload in @('boundary', 'scattered')) {
    for ($round = 1; $round -le $Rounds; $round++) {
        $order = if ($round % 2 -eq 1) { @('reference', 'cached') } else { @('cached', 'reference') }
        $captures = @{}
        foreach ($geometry in $order) {
            $runName = "$workload-$round-$geometry"
            $runDirectory = Join-Path $evidenceDirectory $runName
            New-Item -ItemType Directory -Path $runDirectory | Out-Null
            $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
            $startInfo.FileName = $enginePath
            $startInfo.UseShellExecute = $false
            $startInfo.CreateNoWindow = $true
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            foreach ($argument in @('--path', $projectDirectory, '--script', 'res://tools/render_benchmark.gd', '--', '--backend=chunks', '--lighting=game', '--vsync=on', "--screen=$Screen", "--geometry=$geometry", "--workload=$workload", "--output=$runDirectory")) { $startInfo.ArgumentList.Add($argument) }
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
            $display = @{ screen = $metrics.display_before.screen; position = $metrics.display_before.position; size = $metrics.display_before.size; refresh_hz = $metrics.display_before.refresh_hz; screens = $metrics.display_before.screens; max_fps = $metrics.display_before.engine_max_fps } | ConvertTo-Json -Depth 8 -Compress
            if ($null -eq $referenceDisplay) { $referenceDisplay = $display }
            if ($display -ne $referenceDisplay) { throw "$runName display differs from first run" }
            if (-not $metrics.rendered -or -not $metrics.display_conditions_valid -or $metrics.display_before.screen -ne $Screen -or $metrics.signature -ne 392942167 -or $metrics.cells -ne 1062829 -or $metrics.vsync_mode -ne 1 -or $metrics.window_focus_samples.Contains($false)) { throw "$runName did not preserve test conditions" }
            $captures[$geometry] = (Get-FileHash -LiteralPath (Join-Path $runDirectory 'chunks.png') -Algorithm SHA256).Hash
            $result = @{ run = $runName; cpu_p95_ms = $metrics.edit_submit_p95_ms; frame_p95_ms = $metrics.edit_to_frame_p95_ms; ready_ms = $metrics.ready_ms; peak_mib = $peak / 1MB; geometry_us = $metrics.initial_build_stages.geometry_us; capture_sha256 = $captures[$geometry] }
            $results += $result
            $result | ConvertTo-Json -Compress | Write-Output
        }
        if ($captures.reference -ne $captures.cached) { throw "$workload round $round rendered PNG differs between reference and cached geometry" }
    }
}
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'summary.json') -Encoding utf8
Write-Output "PLANE A/B PASS: $evidenceDirectory"
