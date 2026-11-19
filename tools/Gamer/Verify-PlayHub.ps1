param([switch]$Browser)
$ErrorActionPreference = 'Stop'
$target = Get-Content (Join-Path $PSScriptRoot 'playhub-target.json') -Raw | ConvertFrom-Json
$node = Join-Path $PSScriptRoot $target.nodeRelativePath
$hub = Join-Path $target.projectRoot 'hub'
$results = Join-Path $PSScriptRoot 'TestResults'
New-Item -ItemType Directory -Path $results -Force | Out-Null
$previousGame = $env:PLAYHUB_TEST_GAME
Push-Location $hub
try {
    & $node --test tests/games.rules.test.mjs tests/games.portal-contract.test.mjs tests/games.portal-save-flow.test.mjs *> (Join-Path $results 'playhub-core.log')
    if ($LASTEXITCODE -ne 0) { throw 'PlayHub core tests failed. See TestResults/playhub-core.log.' }
    Get-Content (Join-Path $results 'playhub-core.log') -Tail 9
    if ($Browser) {
        $env:PLAYHUB_TEST_GAME = $target.smokeGame
        & $node (Join-Path $PSScriptRoot 'Run-PlayHubBrowser.mjs') *> (Join-Path $results 'playhub-browser.log')
        $browserExit = $LASTEXITCODE
        if ($browserExit -ne 0) { throw 'PlayHub browser QA failed. See TestResults/playhub-browser.log and TestResults/local-browser-integration.json.' }
        $report = Join-Path $results 'local-browser-integration.json'
        Copy-Item -LiteralPath $report -Destination (Join-Path $results 'playhub-browser-integration.json') -Force
        $summary = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
        $game = @($summary.results | Where-Object { $_.id -eq $target.smokeGame -and $_.ready -eq $true })
        if ($game.Count -ne 1 -or $summary.errors.Count -ne 0) { throw 'The selected game was not verified, or browser exceptions occurred.' }
        Get-Content (Join-Path $results 'playhub-browser.log') -Tail 5
    }
    Write-Output 'PASS: selected PlayHub QA checks. Gamer model inference was not run.'
} finally {
    $env:PLAYHUB_TEST_GAME = $previousGame
    Pop-Location
}
