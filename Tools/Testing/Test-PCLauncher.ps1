param([string]$ProjectRoot = (Resolve-Path "$PSScriptRoot/../..").Path)
$ErrorActionPreference = 'Stop'
$results = Join-Path $ProjectRoot 'Saved/AutomationTestResults/pc-launcher'
New-Item -ItemType Directory -Force -Path $results | Out-Null
$previousCi = $env:CI
$previousGodot = $env:GODOT_BIN
$runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "[FAIL] $Message" }
    Write-Output "[PASS] $Message"
}

function Invoke-Launcher([string]$Case) {
    $runtimeLog = Join-Path $results "$runId-$Case-runtime.log"
    $buildLog = Join-Path $results "$runId-$Case-build.log"
    & "$ProjectRoot/Run-PC-Build.bat" --headless --quit-after 5 --log-file $runtimeLog *> $buildLog
    Assert-True ($LASTEXITCODE -eq 0) "$Case launcher exit code"
    # start is asynchronous; wait for the launched engine's startup evidence.
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 100
        $ready = (Test-Path -LiteralPath $runtimeLog) -and
            [bool](Select-String -LiteralPath $runtimeLog -Pattern '^Godot Engine' -Quiet)
    } until ($ready -or [DateTime]::UtcNow -gt $deadline)
    Assert-True $ready "$Case starts actual exported engine"
    Assert-True (-not [bool](Select-String -LiteralPath $runtimeLog -Pattern '^ERROR:|^SCRIPT ERROR:|^WARNING:' -Quiet)) "$Case startup has no errors"
    return $buildLog
}

Push-Location $ProjectRoot
try {
    $env:CI = '1'
    Invoke-Launcher 'normal' | Write-Output
    $exe = Join-Path $ProjectRoot 'Build/PC/CaptainSalvage.exe'
    $hashBefore = (Get-FileHash -LiteralPath $exe).Hash
    $lock = [IO.File]::Open($exe, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $output = @(Invoke-Launcher 'locked')
        $output | Write-Output
        $buildLog = $output[-1]
        Assert-True ([bool](Select-String -LiteralPath $buildLog -Pattern '^\[BUILD\].*CaptainSalvage-build-' -Quiet)) 'locked EXE uses a fresh complete build'
    } finally { $lock.Dispose() }
    Assert-True ((Get-FileHash -LiteralPath $exe).Hash -eq $hashBefore) 'locked original EXE is unchanged'

    $env:GODOT_BIN = Join-Path $results "$runId-missing-godot.exe"
    & "$ProjectRoot/Run-PC-Build.bat" *> (Join-Path $results "$runId-missing-engine.log")
    Assert-True ($LASTEXITCODE -eq 2) 'missing engine fails instead of launching an old build'
    & "$ProjectRoot/Run-PC-Build-Silent.bat"
    Assert-True ($LASTEXITCODE -eq 2) 'silent launcher propagates missing engine failure'
    Write-Output '[PASS] pc-launcher'
} finally {
    $env:CI = $previousCi
    $env:GODOT_BIN = $previousGodot
    Pop-Location
}
exit 0
