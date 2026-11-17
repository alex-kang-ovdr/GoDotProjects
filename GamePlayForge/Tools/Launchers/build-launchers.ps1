param(
    [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$output = Join-Path $root 'Launch'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$compilerCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
    $command = Get-Command csc.exe -ErrorAction SilentlyContinue
    if ($command) { $compiler = $command.Source }
}
if (-not $compiler) { throw 'Could not find .NET Framework csc.exe. Install the .NET Framework developer tools.' }
$source = Join-Path $PSScriptRoot 'PlayForgeLauncher.cs'
$common = @('/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll')
$variants = @(
    @{ Name = 'PlayForge-Web-Classic.exe'; Define = $null },
    @{ Name = 'PlayForge-Web-Godot.exe'; Define = 'FRONTEND_GODOT' },
    @{ Name = 'PlayForge-Web-Official.exe'; Define = 'FRONTEND_OFFICIAL' }
)
foreach ($variant in $variants) {
    $destination = Join-Path $output $variant.Name
    $args = @($common)
    if ($variant.Define) { $args += '/define:' + $variant.Define }
    $args += '/out:' + $destination
    $args += $source
    & $compiler @args
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $destination)) { throw "Compilation failed for $($variant.Name)." }
    Write-Host "Built $destination"
    if ($SelfTest) {
        $testProcess = Start-Process -FilePath $destination -ArgumentList '--self-test' -Wait -PassThru -NoNewWindow
        if ($testProcess.ExitCode -ne 0) { throw "Self-test failed for $($variant.Name) (exit $($testProcess.ExitCode))." }
    }
}
