$ErrorActionPreference = 'Stop'
$collector = Join-Path $PSScriptRoot 'capture-native-gas-traces.py'
$layouts = @('oh', 'co', 'os', 'ho')

foreach ($layout in $layouts) {
    $output = Join-Path $PSScriptRoot "native-gas-density-$layout-4.4.json"
    & python $collector --probe density --layout $layout --output $output
    if ($LASTEXITCODE -ne 0) { throw "Density capture failed for layout $layout (exit $LASTEXITCODE)" }
}

foreach ($openings in 0..2) {
    $output = Join-Path $PSScriptRoot "native-gas-corner-$openings-4.4.json"
    & python $collector --probe corner --corner-openings $openings --output $output
    if ($LASTEXITCODE -ne 0) { throw "Corner capture failed for $openings openings (exit $LASTEXITCODE)" }
}

$output = Join-Path $PSScriptRoot 'native-gas-max-mass-4.4.json'
& python $collector --probe max-mass --output $output
if ($LASTEXITCODE -ne 0) { throw "Maximum-mass capture failed (exit $LASTEXITCODE)" }
