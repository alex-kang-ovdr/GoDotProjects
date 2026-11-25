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
$officialName = 'PlayForge-Web-Official.exe'

function Install-Atomic([string]$from, [string]$to) {
    if (Test-Path -LiteralPath $to) {
        $backup = $to + '.' + [guid]::NewGuid().ToString('N') + '.bak'
        [System.IO.File]::Replace($from, $to, $backup)
        try { [System.IO.File]::Delete($backup) } catch [System.IO.IOException] { Write-Warning "Could not remove replaced launcher backup $backup" }
    } else { [System.IO.File]::Move($from, $to) }
}

function Test-FileLocked([string]$path) {
    try {
        $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $stream.Dispose()
        return $false
    } catch [System.IO.IOException] { return $true }
}

function Test-Launcher([string]$path, [string]$name) {
    $testProcess = Start-Process -FilePath $path -ArgumentList '--self-test' -Wait -PassThru -NoNewWindow
    if ($testProcess.ExitCode -ne 0) { throw "Self-test failed for $name (exit $($testProcess.ExitCode))." }
}

$variants = @(
    @{ Name = 'PlayForge-Web-Official.exe'; Define = $null }
)
foreach ($variant in $variants) {
    $destination = Join-Path $output $variant.Name
    $temporary = Join-Path $output ('.' + $variant.Name + '.' + [guid]::NewGuid().ToString('N') + '.tmp.exe')
    $args = @($common)
    if ($variant.Define) { $args += '/define:' + $variant.Define }
    $args += '/out:' + $temporary
    $args += $source
    & $compiler @args
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary)) { throw "Compilation failed for $($variant.Name)." }
    if ($SelfTest) {
        Test-Launcher $temporary $variant.Name
    }
    try {
        Install-Atomic $temporary $destination
        Write-Host "Built $destination"
        if ($variant.Name -eq $officialName) {
            $pending = Join-Path $output 'PlayForge-Web-Official.next.exe'
            if ((Test-Path -LiteralPath $pending) -and -not (Test-FileLocked $pending)) { Remove-Item -LiteralPath $pending -Force }
        }
    } catch [System.IO.IOException] {
        if ($variant.Name -ne $officialName -or -not (Test-Path -LiteralPath $destination) -or -not (Test-FileLocked $destination)) { throw }
        $pending = Join-Path $output 'PlayForge-Web-Official.next.exe'
        Install-Atomic $temporary $pending
        if ($SelfTest) { Test-Launcher $pending 'PlayForge-Web-Official.next.exe' }
        Write-Host "Official launcher is in use; built and tested pending update $pending"
    }
}
