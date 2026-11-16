#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallRoot='C:\PlayHubPoC',
    [switch]$WithAdmin,
    [Alias('install-tools')][switch]$InstallTools,
    [switch]$Headed,
    [string]$Channel='',
    [string]$BrowserExecutable='',
    [string]$ReportPath=''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
if(-not $ReportPath){$ReportPath=Join-Path $InstallRoot 'reports\browser-e2e.json'}
$ReportPath=[IO.Path]::GetFullPath($ReportPath)
$ReportDirectory=Split-Path $ReportPath -Parent
New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
$HtmlPath=[regex]::Replace($ReportPath,'(?i)\.json$','')+'.html'
$Utf8=New-Object System.Text.UTF8Encoding($false)

function Write-NotRun([string]$Code,[string]$Message){
    $Pending=@{
        schemaVersion=1;tool='playhub-browser-e2e';status='not_run';passed=$false;browserExecuted=$false
        generatedAt=[DateTime]::UtcNow.ToString('o')
        blocker=@{code=$Code;message=$Message}
        evidencePolicy=@{screenshots=$false;video=$false;trace=$false;har=$false;storageState=$false;credentialsRecorded=$false}
        checks=@(@{id='BROWSER-PREPARATION';title='Windows browser preparation';status='not_run';message=$Message})
        summary=@{pass=0;fail=0;skip=0;not_run=1}
    }
    [IO.File]::WriteAllText($ReportPath,($Pending|ConvertTo-Json -Depth 8),$Utf8)
    $SafeMessage=[Net.WebUtility]::HtmlEncode($Message)
    [IO.File]::WriteAllText($HtmlPath,"<!doctype html><html lang=`"en`"><meta charset=`"utf-8`"><title>PlayHub browser QA: not run</title><h1>Browser QA: not_run</h1><p>passed: false</p><p>$SafeMessage</p><p>No browser result, screenshots or credentials have been recorded.</p></html>",$Utf8)
}

Write-NotRun 'PREPARING' 'The browser checks have not executed. Preparing the recorded IIS installation.'
$Credentials=@{}
$SecurePassword=$null
$BrowserExit=2
try{
    $MarkerPath=Join-Path $InstallRoot 'installation.json'
    if(-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)){throw 'The installation marker was not found. Install the IIS PoC first.'}
    $Marker=Get-Content -LiteralPath $MarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($Marker.product -ne 'playhub-iis-poc'){throw 'The installation marker belongs to another product.'}
    foreach($Name in @('userPort','adminUiPort','publicPort','adminPort')){
        $Value=[int]$Marker.$Name
        if($Value -lt 1024 -or $Value -gt 65535){throw 'The installation marker contains an invalid service port.'}
    }
    $ShareHost=[string]$Marker.shareHost
    if($ShareHost -notmatch '^[A-Za-z0-9.-]+$' -or $ShareHost.Contains('..')){throw 'The installation marker contains an invalid user hostname.'}
    $NodePath=[string]$Marker.nodePath
    $QaDir=Join-Path ([string]$Marker.releaseDir) 'qa'
    $Runner=Join-Path $QaDir 'browser.e2e.mjs'
    if(-not (Test-Path -LiteralPath $NodePath -PathType Leaf)){throw 'The Node.js executable recorded by the installer is unavailable.'}
    if(-not (Test-Path -LiteralPath $Runner -PathType Leaf)){throw 'This release does not contain the optional browser QA files. Install the updated package first.'}
    $Major=& $NodePath -p 'process.versions.node.match(/[0-9]+/)[0]'
    if($LASTEXITCODE -ne 0 -or [int]$Major -lt 24){throw 'Node.js 24 or later is required.'}

    if($InstallTools){
        $NpmPath=Join-Path (Split-Path $NodePath -Parent) 'npm.cmd'
        if(-not (Test-Path -LiteralPath $NpmPath -PathType Leaf)){
            $NpmCommand=Get-Command npm.cmd -ErrorAction SilentlyContinue
            if(-not $NpmCommand){throw 'npm.cmd was not found. Install a Node.js distribution with npm, or provide the optional qa dependencies separately.'}
            $NpmPath=$NpmCommand.Source
        }
        Write-Host 'Installing only qa development dependencies. Existing Microsoft Edge will be used; no browser is downloaded.'
        $OldSkip=$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
        $OldPath=$env:PATH
        try{
            $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
            $env:PATH=(Split-Path $NodePath -Parent)+';'+$OldPath
            & $NpmPath install --prefix $QaDir --include=dev --no-audit --no-fund
            if($LASTEXITCODE -ne 0){throw 'Optional QA dependency installation failed. Browser checks have not run.'}
        }finally{$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=$OldSkip;$env:PATH=$OldPath}
    }

    # Marker records hosts and ports, rather than credentials or arbitrary command text.
    $UserUrl="http://${ShareHost}:$($Marker.userPort)"
    $PublicApiUrl="http://${ShareHost}:$($Marker.publicPort)"
    $AdminUrl="http://127.0.0.1:$($Marker.adminUiPort)"
    $AdminApiUrl="http://127.0.0.1:$($Marker.adminPort)"
    $RunnerArgs=@($Runner,'--user',$UserUrl,'--admin',$AdminUrl,'--public-api',$PublicApiUrl,'--admin-api',$AdminApiUrl,'--report',$ReportPath)
    if($BrowserExecutable -and $Channel){throw 'Choose BrowserExecutable or Channel, not both.'}
    if($BrowserExecutable){$RunnerArgs+=@('--executable',$BrowserExecutable)}
    elseif($Channel){$RunnerArgs+=@('--channel',$Channel)}
    # With neither override, the Node runner uses PLAYHUB_BROWSER_* env settings,
    # then defaults to installed msedge on Windows. It never adds sandbox-bypass flags.
    if($Headed){$RunnerArgs+='--headed'}
    Write-Host "User site: $UserUrl"
    Write-Host "Administrator site: $AdminUrl"
    Write-Host 'The test creates a server-classified QA guest, excluded from live metrics. Authenticated checks temporarily toggle one game and restore it.'
    if($WithAdmin){
        $Config=Get-Content -LiteralPath $Marker.configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $AdminUsername=[string]$Config.admin.username
        $Config=$null
        $SecurePassword=Read-Host 'Administrator password for browser acceptance checks' -AsSecureString
        $Pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
        try{$Credentials=@{username=$AdminUsername;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)}}
        finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)}
    }
    $OldEncoding=$OutputEncoding
    try{
        $OutputEncoding=New-Object System.Text.UTF8Encoding($false)
        ($Credentials|ConvertTo-Json -Compress)|& $NodePath @RunnerArgs
        $BrowserExit=$LASTEXITCODE
    }finally{$OutputEncoding=$OldEncoding;$Credentials=@{};$SecurePassword=$null}
    if(-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)){throw 'The runner did not create a browser report.'}
    $FinalReport=Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($BrowserExit -eq 0 -and ($FinalReport.status -ne 'passed' -or $FinalReport.passed -ne $true)){
        Write-NotRun 'INVALID_RUNNER_RESULT' 'The process returned zero without a verified passed report.'
        $BrowserExit=2
    }
}catch{
    # No unfiltered exception details: a command or property can contain a secret.
    Write-NotRun 'PREPARATION_FAILED' 'The browser run could not be prepared. Check the installation marker, Node.js 24, optional qa dependency installation, browser choice and IIS/API availability.'
    Write-Error -ErrorAction Continue 'Browser QA preparation failed. No successful browser result is claimed. See the not_run report.'
    $BrowserExit=2
}finally{$Credentials=@{};$SecurePassword=$null}
Write-Host "JSON report: $ReportPath"
Write-Host "HTML report: $HtmlPath"
switch($BrowserExit){
    0 {Write-Host 'All configured browser acceptance checks passed.' -ForegroundColor Green}
    1 {Write-Warning 'One or more browser checks failed. Read the report and verify any public-state restoration failure.'}
    2 {Write-Warning 'Browser checks were not completed. Status is not_run; this is not a pass.'}
    3 {Write-Warning 'Only part of the browser checks ran. Supply -WithAdmin to include authenticated administrator checks. This is not a full pass.'}
    default {Write-Warning 'The browser runner exited unexpectedly. Review the report.'}
}
exit $BrowserExit
