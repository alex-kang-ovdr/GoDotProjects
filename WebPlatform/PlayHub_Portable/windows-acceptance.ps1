#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$DataDir,
    [switch]$WithHttpSmoke,
    [switch]$WithAdmin
)

# This tool observes an already running instance. It never installs, restarts,
# terminates, or changes firewall rules for the application being inspected.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$Checks=New-Object 'System.Collections.Generic.List[object]'
$State=@{startup=$null;processes=@{};listeners=@();http=$null;paths=@{};origins=@{};ports=@{};roles=@{}}
$Started=[DateTime]::UtcNow
$HttpRequested=([bool]$WithHttpSmoke -or [bool]$WithAdmin)
$Result=@{
    schemaVersion=1;tool='playhub-portable-windows-acceptance';version='0.3.0'
    generatedAt=$Started.ToString('o');windowsExecuted=$false;browserExecuted=$false
    runId=$null;status='not_run';fullyAccepted=$false
    scope=@{observations=$true;httpSmokeRequested=$HttpRequested;adminRequested=[bool]$WithAdmin}
    checks=@();httpSmoke=@{status='not_run';checks=@();deferredChecks=@()}
    manualChecks=@(
        @{id='PORTABLE-BROWSER';status='not_run';message='Real browser game input, iframe SDK and save UI require a separate browser run.'},
        @{id='PORTABLE-LAN';status='not_run';message='A request from another device is required to confirm the LAN path and firewall.'},
        @{id='PORTABLE-GOOGLE';status='not_run';message='Real Google OAuth credentials and account consent require separate verification.'}
    )
}

function Safe-Error([string]$Message,[string]$Status='fail'){
    $Exception=New-Object System.Exception($Message)
    $Exception.Data['PlayHubSafe']=$true
    $Exception.Data['PlayHubStatus']=$Status
    throw $Exception
}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){Safe-Error $Message}}
function Field($Value,[string]$Name){
    if($null -eq $Value -or $null -eq $Value.PSObject.Properties[$Name]){Safe-Error ('Required report field is missing: '+$Name)}
    return $Value.$Name
}
function Observe([string]$Id,[string]$Title,[scriptblock]$Action){
    try{
        $Evidence=& $Action
        $Checks.Add(@{id=$Id;title=$Title;status='pass';evidence=$Evidence;message='Observed successfully.'})
        Write-Host ('PASS '+$Id)
    }catch{
        $Status='fail';$Message='This observation could not be verified. No success is inferred.'
        if($_.Exception.Data.Contains('PlayHubSafe')){$Status=[string]$_.Exception.Data['PlayHubStatus'];$Message=$_.Exception.Message}
        $Checks.Add(@{id=$Id;title=$Title;status=$Status;message=$Message})
        Write-Warning ($Id+' - '+$Message)
    }
}
function Canonical([string]$Value){
    Require (-not [string]::IsNullOrWhiteSpace($Value) -and [IO.Path]::IsPathRooted($Value)) 'A required path is not absolute.'
    Require (-not $Value.StartsWith('\\')) 'This portable acceptance profile requires local paths, not a network share.'
    return [IO.Path]::GetFullPath($Value).TrimEnd([char[]]@([char]92,[char]47))
}
function Contains-Path([string]$Root,[string]$Child){
    return $Child.Equals($Root,[StringComparison]::OrdinalIgnoreCase) -or $Child.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)
}
function Reject-Links([string]$Path){
    $Item=Get-Item -LiteralPath $Path -Force
    while($null -ne $Item){
        Require (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'A runtime path contains a link or junction.'
        if($Item -is [IO.FileInfo]){$Item=$Item.Directory}else{$Item=$Item.Parent}
    }
}
function Process-Row([int]$ProcessId){
    if(-not $State.processes.ContainsKey($ProcessId)){
        $Rows=@(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId='+$ProcessId))
        Require ($Rows.Count -eq 1) 'An expected process is not alive or cannot be identified.'
        $State.processes[$ProcessId]=$Rows[0]
    }
    return $State.processes[$ProcessId]
}
function Is-Descendant([int]$ProcessId,[int]$AncestorId){
    $Cursor=$ProcessId;$Seen=@{}
    for($Index=0;$Index -lt 12;$Index++){
        if($Cursor -eq $AncestorId){return $true}
        if($Cursor -le 0 -or $Seen.ContainsKey($Cursor)){return $false}
        $Seen[$Cursor]=$true
        $Row=Process-Row $Cursor
        $Cursor=[int]$Row.ParentProcessId
    }
    return $false
}
function Fetch([string]$Url){
    $Request=[Net.HttpWebRequest]::Create($Url)
    $Request.Method='GET';$Request.Proxy=$null;$Request.AllowAutoRedirect=$false
    $Request.Timeout=10000;$Request.ReadWriteTimeout=10000
    $Request.UserAgent='PlayHub-Portable-Acceptance/0.3.0'
    $Response=$null
    try{$Response=$Request.GetResponse()}catch [Net.WebException]{
        if($null -eq $_.Exception.Response){Safe-Error 'A local HTTP endpoint did not respond.'}
        $Response=$_.Exception.Response
    }
    try{
        $Stream=$Response.GetResponseStream();$Memory=New-Object IO.MemoryStream
        try{
            $Buffer=New-Object byte[] 8192
            while(($Count=$Stream.Read($Buffer,0,$Buffer.Length)) -gt 0){
                if($Memory.Length+$Count -gt 4194304){Safe-Error 'An observation response exceeded the 4 MiB limit.'}
                $Memory.Write($Buffer,0,$Count)
            }
            $Bytes=$Memory.ToArray()
        }finally{$Stream.Dispose();$Memory.Dispose()}
        return @{status=[int]$Response.StatusCode;contentType=[string]$Response.ContentType;body=[Text.Encoding]::UTF8.GetString($Bytes);bytes=$Bytes}
    }finally{if($null -ne $Response){$Response.Dispose()}}
}
function Has-Mime([string]$Value,[string]$Kind){
    $Type=($Value -split ';')[0].Trim().ToLowerInvariant()
    switch($Kind){
        'html' {return $Type -eq 'text/html'}
        'css' {return $Type -eq 'text/css'}
        'js' {return $Type -in @('text/javascript','application/javascript','application/x-javascript')}
        'json' {return $Type -eq 'application/json'}
        'svg' {return $Type -eq 'image/svg+xml'}
    }
    return $false
}
function Quote-Argument([string]$Value){
    # CommandLineToArgvW-compatible quoting for ProcessStartInfo on .NET Framework.
    return '"'+[regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}
function Save-Result{
    $Result.generatedAt=[DateTime]::UtcNow.ToString('o')
    $Result.checks=@($Checks.ToArray())
    $Result.checkCounts=@{}
    foreach($Status in @('pass','fail','not_run','skip')){$Result.checkCounts[$Status]=@($Checks|Where-Object {$_.status -eq $Status}).Count}
    $ObservedPass=($Checks.Count -gt 0 -and $Result.checkCounts.fail -eq 0 -and $Result.checkCounts.not_run -eq 0 -and $Result.checkCounts.skip -eq 0)
    $Result.observationalStatus=if($ObservedPass){'pass'}elseif($Result.checkCounts.fail -gt 0){'fail'}else{'not_run'}
    if($Result.checkCounts.fail -gt 0 -or $Result.httpSmoke.status -eq 'fail'){$Result.status='failed';$ExitCode=1}
    elseif(-not $ObservedPass -or ($HttpRequested -and $Result.httpSmoke.status -ne 'pass')){$Result.status='partial';$ExitCode=2}
    else{$Result.status='observed_passed_manual_pending';$ExitCode=0}
    $Result.exitCode=$ExitCode
    $ReportDirectory=Join-Path $DataDir 'reports'
    [void][IO.Directory]::CreateDirectory($ReportDirectory)
    $JsonPath=Join-Path $ReportDirectory 'portable-acceptance.json'
    $HtmlPath=Join-Path $ReportDirectory 'portable-acceptance.html'
    [IO.File]::WriteAllText($JsonPath,($Result|ConvertTo-Json -Depth 20),(New-Object Text.UTF8Encoding($false)))
    $Encode={param($Value)[Net.WebUtility]::HtmlEncode([string]$Value)}
    $Rows=New-Object 'System.Collections.Generic.List[string]'
    foreach($Check in $Result.checks){$Rows.Add('<tr><td>'+(& $Encode $Check.id)+'</td><td>'+(& $Encode $Check.status)+'</td><td>'+(& $Encode $Check.message)+'</td></tr>')}
    foreach($Check in $Result.manualChecks){$Rows.Add('<tr><td>'+(& $Encode $Check.id)+'</td><td>'+(& $Encode $Check.status)+'</td><td>'+(& $Encode $Check.message)+'</td></tr>')}
    $HttpRows=New-Object 'System.Collections.Generic.List[string]'
    foreach($Check in @($Result.httpSmoke.checks)){$HttpRows.Add('<tr><td>'+(& $Encode $Check.id)+'</td><td>'+(& $Encode $Check.status)+'</td><td>'+(& $Encode $Check.title)+'</td></tr>')}
    $DeferredRows=New-Object 'System.Collections.Generic.List[string]'
    foreach($Check in @($Result.httpSmoke.deferredChecks)){$DeferredRows.Add('<tr><td>'+(& $Encode $Check.id)+'</td><td>'+(& $Encode $Check.status)+'</td><td>'+(& $Encode $Check.deferredTo)+'</td></tr>')}
    $Html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PlayHub Portable acceptance</title><style>body{font:15px system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#172a29}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #cbd9d6;padding:9px;text-align:left;overflow-wrap:anywhere}th{background:#edf4f1}h1,h2{color:#145a4c}code{background:#edf4f1;padding:2px 5px}</style></head><body><h1>PlayHub Portable acceptance</h1><p>Status: <strong>'+(& $Encode $Result.status)+'</strong>. Full service acceptance: false.</p><p>Windows observed: '+(& $Encode $Result.windowsExecuted)+'. Browser executed: false. HTTP smoke: '+(& $Encode $Result.httpSmoke.status)+'.</p><p>Generated: '+(& $Encode $Result.generatedAt)+'. Run: '+(& $Encode $Result.runId)+'.</p><p>The tool only observes the running application. Optional HTTP smoke writes isolated QA traffic. Browser, remote LAN access and Google OAuth remain separate.</p><table><thead><tr><th>Check</th><th>Status</th><th>Result</th></tr></thead><tbody>'+($Rows -join '')+'</tbody></table><h2>HTTP smoke original checks</h2><table><thead><tr><th>Check</th><th>Original status</th><th>Title</th></tr></thead><tbody>'+($HttpRows -join '')+'</tbody></table><h2>Explicit HTTP exclusions</h2><table><thead><tr><th>Check</th><th>Original status</th><th>Evaluated by</th></tr></thead><tbody>'+($DeferredRows -join '')+'</tbody></table><p>Detailed evidence and counts are in portable-acceptance.json. No credentials are included.</p></body></html>'
    [IO.File]::WriteAllText($HtmlPath,$Html,(New-Object Text.UTF8Encoding($false)))
    Write-Host ('Result: '+$Result.status)
    Write-Host ('Report: '+$JsonPath)
    Write-Host ('HTML: '+$HtmlPath)
    return $ExitCode
}

if([string]::IsNullOrWhiteSpace($DataDir)){
    $LocalData=[Environment]::GetFolderPath('LocalApplicationData')
    if([string]::IsNullOrWhiteSpace($LocalData)){Write-Error 'LocalApplicationData is unavailable; specify -DataDir.';exit 1}
    $DataDir=Join-Path $LocalData 'PlayHub'
}
$DataDir=[IO.Path]::GetFullPath($DataDir)
Observe 'PORTABLE-WINDOWS' 'Windows PowerShell host' {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){Safe-Error 'Windows observations were not run on this non-Windows host.' 'not_run'}
    Require ($PSVersionTable.PSVersion -ge [Version]'5.1') 'Windows PowerShell 5.1 or later is required.'
    $Result.windowsExecuted=$true
    return @{os=[Environment]::OSVersion.VersionString;powershell=$PSVersionTable.PSVersion.ToString()}
}
if(-not $Result.windowsExecuted){$Code=Save-Result;exit $Code}

Observe 'PORTABLE-REPORT' 'Running instance report contract' {
    $ReportPath=Join-Path $DataDir 'reports\startup-report.json'
    Require (Test-Path -LiteralPath $ReportPath -PathType Leaf) 'startup-report.json is missing. Start PlayHub before running acceptance.'
    Reject-Links $ReportPath
    Require ((Get-Item -LiteralPath $ReportPath).Length -lt 1048576) 'The startup report exceeds 1 MiB.'
    $Startup=Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8|ConvertFrom-Json
    Require ((Field $Startup 'schemaVersion') -eq 1 -and (Field $Startup 'mode') -eq 'portable-rebex') 'The startup report schema or mode is not supported.'
    Require ((Field $Startup 'status') -eq 'running') 'The instance has not reached running status.'
    $ParsedRun=[Guid]::Empty
    Require ([Guid]::TryParse([string](Field $Startup 'runId'),[ref]$ParsedRun)) 'The startup run ID is invalid.'
    $Environment=Field $Startup 'environment'
    Require ((Field $Environment 'platform') -eq 'win32' -and (Field $Environment 'windowsExecuted') -eq $true) 'The report does not describe a real Windows launch.'
    Require ((Field $Environment 'sea') -eq $true) 'This report was not produced by the packaged SEA executable.'
    foreach($Name in @('instanceRoot','appRoot','workspaceRoot','userRoot','adminRoot','configPath','dataDir','executable')){$State.paths[$Name]=Canonical ([string](Field (Field $Startup 'paths') $Name))}
    Require ($State.paths.instanceRoot.Equals((Canonical $DataDir),[StringComparison]::OrdinalIgnoreCase)) 'The startup report belongs to another instance root.'
    foreach($Name in @('user','admin','publicApi','adminApi')){
        $Port=[int](Field (Field $Startup 'ports') $Name)
        Require ($Port -ge 1024 -and $Port -le 65535) 'The report contains an invalid listening port.'
        $State.ports[$Name]=$Port
        $Url=[Uri]([string](Field (Field $Startup 'urls') $Name))
        Require ($Url.IsAbsoluteUri -and $Url.Scheme -eq 'http' -and $Url.Port -eq $Port) 'The report URL does not match its HTTP port.'
        $State.origins[$Name]='http://127.0.0.1:'+ $Port
    }
    Require (@($State.ports.Values|Select-Object -Unique).Count -eq 4) 'The four service ports are not distinct.'
    Require ([int](Field $Startup 'mainPid') -gt 0) 'The launcher process ID is invalid.'
    $State.startup=$Startup;$Result.runId=$ParsedRun.ToString()
    return @{report=$ReportPath;version=[string](Field $Startup 'version');mainPid=[int]$Startup.mainPid;ports=$State.ports}
}
if($null -eq $State.startup){$Code=Save-Result;exit $Code}

Observe 'PORTABLE-PROCESSES' 'Launcher and owned service processes' {
    $Main=Process-Row ([int]$State.startup.mainPid)
    Require (-not [string]::IsNullOrWhiteSpace([string]$Main.ExecutablePath)) 'The launcher executable path cannot be observed.'
    Require ((Canonical ([string]$Main.ExecutablePath)).Equals($State.paths.executable,[StringComparison]::OrdinalIgnoreCase)) 'The recorded PID now belongs to another executable.'
    $Children=@(Field $State.startup 'children');$Ids=@();$Evidence=@()
    foreach($Role in @('api','admin','rebex-user','rebex-supervisor')){
        $Rows=@($Children|Where-Object {$_.role -eq $Role})
        Require ($Rows.Count -eq 1 -and $Rows[0].status -eq 'ready') ('A ready child role is missing or duplicated: '+$Role)
        $ProcessId=[int]$Rows[0].pid
        Require ($ProcessId -gt 0 -and $ProcessId -ne [int]$State.startup.mainPid -and $ProcessId -notin $Ids) 'Child process IDs are invalid or duplicated.'
        $Ids+=$ProcessId;$Row=Process-Row $ProcessId
        Require (Is-Descendant $ProcessId ([int]$State.startup.mainPid)) 'A reported child does not descend from this launcher.'
        Require (-not [string]::IsNullOrWhiteSpace([string]$Row.ExecutablePath)) 'A child executable path cannot be observed.'
        if($Role -in @('api','admin')){Require ((Canonical ([string]$Row.ExecutablePath)).Equals($State.paths.executable,[StringComparison]::OrdinalIgnoreCase)) 'A service worker is not this packaged executable.'}
        if($Role -eq 'rebex-user'){Require ([IO.Path]::GetFileName([string]$Row.ExecutablePath) -ieq 'RebexTinyWebServer.exe') 'The user static process is not RebexTinyWebServer.exe.'}
        $State.roles[$Role]=$ProcessId
        $Evidence+=@{role=$Role;pid=$ProcessId;parentPid=[int]$Row.ParentProcessId;executable=[string]$Row.ExecutablePath}
    }
    return @{mainPid=[int]$State.startup.mainPid;children=$Evidence}
}
Observe 'PORTABLE-ROOTS' 'Separate sites and private data paths' {
    foreach($Name in @('instanceRoot','appRoot','workspaceRoot','userRoot','adminRoot','dataDir')){Require (Test-Path -LiteralPath $State.paths[$Name] -PathType Container) ('A required directory is missing: '+$Name);Reject-Links $State.paths[$Name]}
    Require (Test-Path -LiteralPath $State.paths.configPath -PathType Leaf) 'The private configuration file is missing.'
    Reject-Links $State.paths.configPath
    Require (-not (Contains-Path $State.paths.userRoot $State.paths.adminRoot) -and -not (Contains-Path $State.paths.adminRoot $State.paths.userRoot)) 'The user and administrator web roots overlap.'
    foreach($Root in @($State.paths.userRoot,$State.paths.adminRoot)){
        foreach($Private in @($State.paths.dataDir,$State.paths.configPath,$State.paths.workspaceRoot,$State.paths.appRoot)){Require (-not (Contains-Path $Root $Private) -and -not (Contains-Path $Private $Root)) 'A private or source path overlaps a public web root.'}
        Require (Test-Path -LiteralPath (Join-Path $Root 'index.html') -PathType Leaf) 'A site root has no index.html.'
    }
    Require (-not (Test-Path -LiteralPath (Join-Path $State.paths.userRoot 'admin.js'))) 'Administrator assets exist in the user web root.'
    Require (-not (Test-Path -LiteralPath (Join-Path $State.paths.adminRoot 'games'))) 'Game assets exist in the administrator web root.'
    return @{userRoot=$State.paths.userRoot;adminRoot=$State.paths.adminRoot;dataOutsideBothRoots=$true;configOutsideBothRoots=$true}
}
Observe 'PORTABLE-LISTENERS' 'OS listener ownership' {
    if($null -eq (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)){Safe-Error 'Get-NetTCPConnection is unavailable; socket ownership was not observed.' 'not_run'}
    $State.listeners=@(Get-NetTCPConnection -State Listen)
    $Owners=@{user='rebex-user';admin='admin';publicApi='api';adminApi='api'};$Evidence=@()
    foreach($Name in @('user','admin','publicApi','adminApi')){
        Require ($State.roles.ContainsKey($Owners[$Name])) 'Process ownership must be verified before accepting listeners.'
        $Rows=@($State.listeners|Where-Object {$_.LocalPort -eq $State.ports[$Name]})
        Require ($Rows.Count -gt 0) ('A required service has no listening socket: '+$Name)
        foreach($Row in $Rows){Require ([int]$Row.OwningProcess -eq [int]$State.roles[$Owners[$Name]]) 'A service port belongs to an unexpected process.';$Evidence+=@{service=$Name;address=[string]$Row.LocalAddress;port=[int]$Row.LocalPort;pid=[int]$Row.OwningProcess}}
    }
    return $Evidence
}
Observe 'PORTABLE-ADMIN-LOOPBACK' 'Administrator sockets are loopback-only' {
    Require ($State.listeners.Count -gt 0) 'No listener observations are available.'
    foreach($Name in @('admin','adminApi')){
        $Rows=@($State.listeners|Where-Object {$_.LocalPort -eq $State.ports[$Name]})
        Require ($Rows.Count -gt 0) 'An administrator listener is missing.'
        foreach($Row in $Rows){Require ([Net.IPAddress]::IsLoopback([Net.IPAddress]::Parse([string]$Row.LocalAddress))) 'An administrator listener is exposed beyond loopback.'}
    }
    return @{adminPort=$State.ports.admin;adminApiPort=$State.ports.adminApi;loopbackOnly=$true}
}
Observe 'PORTABLE-REBEX-CONFIG' 'Actual Rebex image and active root configuration' {
    Require ($State.roles.ContainsKey('rebex-user')) 'The Rebex process has not been identified.'
    $Row=Process-Row ([int]$State.roles['rebex-user']);$Executable=Canonical ([string]$Row.ExecutablePath)
    $ConfigFile=$Executable+'.config';Require (Test-Path -LiteralPath $ConfigFile -PathType Leaf) 'The running Rebex EXE has no adjacent config.'
    Reject-Links $Executable;Reject-Links $ConfigFile
    [xml]$Xml=Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8
    $Settings=@{}
    foreach($Entry in @($Xml.configuration.appSettings.add)){Require (-not $Settings.ContainsKey([string]$Entry.key)) 'The Rebex configuration contains duplicate settings.';$Settings[[string]$Entry.key]=[string]$Entry.value}
    foreach($Name in @('webRootDir','httpPort','httpsPort','defaultFile','autoStart')){Require ($Settings.ContainsKey($Name)) 'The generated Rebex configuration lacks a required setting.'}
    $WebRoot=$Settings.webRootDir
    if(-not [IO.Path]::IsPathRooted($WebRoot)){$WebRoot=Join-Path ([IO.Path]::GetDirectoryName($Executable)) $WebRoot}
    Require ((Canonical $WebRoot).Equals($State.paths.userRoot,[StringComparison]::OrdinalIgnoreCase)) 'Rebex is configured for a different web root.'
    Require ([int]$Settings.httpPort -eq $State.ports.user -and $Settings.httpsPort -eq '' -and $Settings.defaultFile -eq 'index.html' -and $Settings.autoStart -eq 'true') 'Rebex protocol, default document or autoStart settings do not match this instance.'
    $Hash=(Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
    Require ($Hash -eq [string](Field (Field $State.startup 'rebex') 'sha256')) 'The running Rebex image hash differs from the startup report.'
    $Version=[Diagnostics.FileVersionInfo]::GetVersionInfo($Executable).FileVersion
    return @{executable=$Executable;config=$ConfigFile;webRoot=$WebRoot;port=$State.ports.user;version=$Version;sha256=$Hash}
}
foreach($Name in @('user','admin')){
    $CurrentName=$Name
    Observe ('PORTABLE-'+$Name.ToUpperInvariant()+'-STATIC') ($Name+' static document and root mapping') {
        $Response=Fetch ($State.origins[$CurrentName]+'/')
        Require ($Response.status -eq 200 -and (Has-Mime $Response.contentType 'html')) 'The static home did not return HTML with status 200.'
        $Root=if($CurrentName -eq 'user'){$State.paths.userRoot}else{$State.paths.adminRoot}
        $Expected=[IO.File]::ReadAllText((Join-Path $Root 'index.html'))
        Require ($Response.body -ceq $Expected) 'The served home does not match the reported physical root.'
        if($CurrentName -eq 'user'){
            $Marker=Fetch ($State.origins.user+'/playhub-ready.json')
            Require ($Marker.status -eq 200) 'The user instance marker is unavailable.'
            $MarkerValue=$Marker.body|ConvertFrom-Json
            Require ($MarkerValue.product -eq 'playhub' -and $MarkerValue.runId -eq $Result.runId) 'The user endpoint belongs to another launch.'
        }else{
            $Marker=Fetch ($State.origins.admin+'/__playhub/health')
            Require ($Marker.status -eq 200) 'The administrator static worker health is unavailable.'
            $MarkerValue=$Marker.body|ConvertFrom-Json
            Require ($MarkerValue.ok -eq $true -and $MarkerValue.service -eq 'admin-static') 'The administrator static worker identity is incorrect.'
        }
        return @{service=$CurrentName;status=$Response.status;contentType=$Response.contentType;physicalRootMatches=$true}
    }
}
Observe 'PORTABLE-HEALTH' 'Independent API health identities' {
    $Evidence=@()
    foreach($Name in @('publicApi','adminApi')){
        $Response=Fetch ($State.origins[$Name]+'/api/health');Require ($Response.status -eq 200) 'An API health endpoint failed.'
        $Value=$Response.body|ConvertFrom-Json;$Expected=if($Name -eq 'publicApi'){'public'}else{'admin'}
        Require ($Value.ok -eq $true -and $Value.service -eq $Expected) 'API health returned the wrong role.'
        $Evidence+=@{service=$Expected;status=200;version=[string]$Value.version}
    }
    return $Evidence
}
Observe 'PORTABLE-ADMIN-ISOLATION' 'Public API refuses administrator routes' {
    foreach($Route in @('/api/admin/session','/api/admin/metrics?dataset=live')){Require ((Fetch ($State.origins.publicApi+$Route)).status -eq 404) 'A public API administrator route did not return 404.'}
    Require ((Fetch ($State.origins.adminApi+'/api/admin/metrics?dataset=live')).status -eq 401) 'Administrator metrics were accessible without authentication.'
    return @{publicAdminRoutes=404;unauthenticatedAdminMetrics=401}
}
Observe 'PORTABLE-DB-NOT-PUBLIC' 'Private paths and database are not web resources' {
    $Routes=@('/platform.sqlite','/data/platform.sqlite','/private/data/platform.sqlite','/config/local.json','/private/config/local.json','/%2e%2e/%2e%2e/private/data/platform.sqlite','/..%5c..%5cprivate%5cdata%5cplatform.sqlite')
    $Count=0
    foreach($Name in @('user','admin')){
        foreach($Route in $Routes){
            $Response=Fetch ($State.origins[$Name]+$Route)
            Require ($Response.status -in @(400,403,404)) 'A private or traversal path was not explicitly rejected.'
            Require (-not $Response.body.StartsWith('SQLite format 3')) 'A static endpoint exposed a SQLite database.'
            $Count++
        }
    }
    return @{probes=$Count;privateResponsesRejected=$true;databaseSignatureExposed=$false}
}
Observe 'PORTABLE-CATALOG' 'Eight built-in games and current public catalog' {
    $Expected=@('match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles')
    $CatalogFile=Join-Path $State.paths.workspaceRoot 'catalog\games.json'
    $Catalog=Get-Content -LiteralPath $CatalogFile -Raw -Encoding UTF8|ConvertFrom-Json
    Require ($Catalog.schemaVersion -eq 1) 'The editable catalog schema is unsupported.'
    $Registered=@($Catalog.entries|ForEach-Object {[string]$_.id})
    Require (@($Registered|Select-Object -Unique).Count -eq $Registered.Count) 'The editable catalog has duplicate IDs.'
    foreach($Id in $Expected){
        Require ($Id -in $Registered) ('A built-in game is missing: '+$Id)
        Require (Test-Path -LiteralPath (Join-Path $State.paths.userRoot ('games\'+$Id+'\index.html')) -PathType Leaf) 'A built-in game package is missing from the user site.'
        $SourceEntry=@($Catalog.entries|Where-Object {$_.id -eq $Id})[0]
        if($SourceEntry.enabled -eq $true){
            $Page=Fetch ($State.origins.user+'/play/'+$Id+'/')
            Require ($Page.status -eq 200 -and (Has-Mime $Page.contentType 'html')) 'A generated enabled game detail directory did not serve HTML.'
        }
    }
    $Response=Fetch ($State.origins.publicApi+'/api/games');Require ($Response.status -eq 200) 'The public catalog did not respond.'
    $Public=$Response.body|ConvertFrom-Json
    foreach($Game in @($Public.games)){Require ([string]$Game.id -in $Registered -and $Game.enabled -eq $true) 'The public API returned an unregistered or disabled game.'}
    return @{builtInGames=$Expected.Count;registeredGames=$Registered.Count;publicEnabledGames=@($Public.games).Count;disabledGamesMayBeAbsent=$true}
}
Observe 'PORTABLE-MIME' 'Browser asset MIME types' {
    $Assets=@(
        @{service='user';route='/app.js';kind='js'},@{service='user';route='/user.css';kind='css'},
        @{service='user';route='/catalog/games.json';kind='json'},@{service='user';route='/games/slide-puzzle/assets/cover.svg';kind='svg'},
        @{service='user';route='/games/slide-puzzle/index.html';kind='html'},
        @{service='admin';route='/admin.js';kind='js'},@{service='admin';route='/admin.css';kind='css'}
    )
    $Evidence=@()
    foreach($Asset in $Assets){$Response=Fetch ($State.origins[$Asset.service]+$Asset.route);Require ($Response.status -eq 200 -and (Has-Mime $Response.contentType $Asset.kind)) ('An asset has an unexpected response or MIME type: '+$Asset.route);$Evidence+=@{service=$Asset.service;route=$Asset.route;contentType=$Response.contentType;status=$Response.status}}
    return $Evidence
}

if($HttpRequested){
    Write-Host 'HTTP smoke creates isolated QA sessions, saves and events. Administrator checks also restore any temporary game visibility change.'
    $ChildStarted=[DateTime]::UtcNow;$ChildProcess=$null;$Secret=$null;$PasswordPointer=[IntPtr]::Zero
    try{
        Require ($Result.windowsExecuted -and $null -ne $State.startup) 'A valid running Windows instance is required for HTTP smoke.'
        Require (@($Checks|Where-Object {$_.id -eq 'PORTABLE-PROCESSES' -and $_.status -eq 'pass'}).Count -eq 1) 'Launcher and owned processes must be verified before starting the HTTP check executable.'
        Require (Test-Path -LiteralPath $State.paths.executable -PathType Leaf) 'The packaged executable is missing.'
        $HttpReport=Join-Path $DataDir 'reports\portable-http.json'
        $PreviousHash=if(Test-Path -LiteralPath $HttpReport){(Get-FileHash -LiteralPath $HttpReport -Algorithm SHA256).Hash}else{''}
        $CredentialJson=''
        if($WithAdmin){
            $Username=Read-Host 'Administrator username (blank: admin)';if([string]::IsNullOrWhiteSpace($Username)){$Username='admin'}
            $Secret=Read-Host 'Administrator password' -AsSecureString
            $PasswordPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
            $PlainPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
            $CredentialJson=@{username=$Username;password=$PlainPassword}|ConvertTo-Json -Compress
            # ASCII JSON escapes avoid redirected-stdin code-page differences in Windows PowerShell 5.1.
            $CredentialJson=[regex]::Replace($CredentialJson,'[^\u0000-\u007F]',{param($Match) '\u{0:x4}' -f [int][char]$Match.Value})
            $PlainPassword=$null
        }
        $Arguments=@('--check-http','--data-dir',$DataDir);if($WithAdmin){$Arguments+='--with-admin'}
        $StartInfo=New-Object Diagnostics.ProcessStartInfo
        $StartInfo.FileName=$State.paths.executable
        $StartInfo.Arguments=($Arguments|ForEach-Object {Quote-Argument $_}) -join ' '
        $StartInfo.WorkingDirectory=$State.paths.instanceRoot
        $StartInfo.UseShellExecute=$false;$StartInfo.CreateNoWindow=$true
        $StartInfo.RedirectStandardInput=$true;$StartInfo.RedirectStandardOutput=$true;$StartInfo.RedirectStandardError=$true
        $ChildProcess=[Diagnostics.Process]::Start($StartInfo)
        Require ($null -ne $ChildProcess) 'The HTTP inspection process could not be started.'
        $Stdout=$ChildProcess.StandardOutput.ReadToEndAsync();$Stderr=$ChildProcess.StandardError.ReadToEndAsync()
        if($CredentialJson){$ChildProcess.StandardInput.WriteLine($CredentialJson)}
        $ChildProcess.StandardInput.Close();$CredentialJson=$null
        # Only the new check process is waited on. The running application is never stopped.
        $ChildProcess.WaitForExit();$ChildExit=$ChildProcess.ExitCode
        [void]$Stdout.GetAwaiter().GetResult();[void]$Stderr.GetAwaiter().GetResult()
        Require (Test-Path -LiteralPath $HttpReport -PathType Leaf) 'HTTP smoke did not create a JSON report.'
        Require ((Get-FileHash -LiteralPath $HttpReport -Algorithm SHA256).Hash -ne $PreviousHash) 'The HTTP report was not replaced by this invocation.'
        $Http=Get-Content -LiteralPath $HttpReport -Raw -Encoding UTF8|ConvertFrom-Json
        Require ($Http.kind -eq 'poc-http-smoke') 'The child returned a different kind of report.'
        Require ([DateTimeOffset]::Parse([string]$Http.generatedAt).UtcDateTime -ge $ChildStarted.AddSeconds(-2)) 'The HTTP report predates this invocation.'
        Require ($Http.environment.platform -eq 'win32') 'The HTTP report is not from Windows.'
        Require ($Http.environment.rebexTargetDeclared -eq $true) 'The HTTP report does not declare the portable Rebex target.'
        $SafeChecks=@()
        foreach($Check in @($Http.checks)){
            Require ($Check.status -in @('pass','fail','skip','warning','not_run','partial')) 'The HTTP report contains an unknown check status.'
            $SafeChecks+=@{id=[string]$Check.id;title=[string]$Check.title;status=[string]$Check.status}
        }
        Require ($SafeChecks.Count -gt 0) 'The HTTP report has no checks.'
        $Required=@('SMOKE-HEALTH-PUBLIC','SMOKE-HEALTH-ADMIN','SMOKE-STATIC-USER','SMOKE-STATIC-ADMIN','SMOKE-CATALOG','SMOKE-GUEST','SMOKE-QA-SESSION','SMOKE-COOKIE','SMOKE-SAVE','SMOKE-SAVE-RESTORE','SMOKE-ADMIN-ISOLATION')
        if($WithAdmin){$Required+=@('SMOKE-METRICS-DATASETS','SMOKE-METRICS-FILTERS','SMOKE-ADMIN-LOGIN','SMOKE-ADMIN-LOGOUT')}
        $Missing=@();$NotPassed=@()
        foreach($Id in $Required){$MatchRows=@($SafeChecks|Where-Object {$_.id -eq $Id});if($MatchRows.Count -ne 1){$Missing+=$Id}elseif($MatchRows[0].status -ne 'pass'){$NotPassed+=$Id}}
        $DeferredDefinitions=@{'SMOKE-BROWSER'='PORTABLE-BROWSER';'SMOKE-GOOGLE'='PORTABLE-GOOGLE';'SMOKE-REBEX'='PORTABLE-PROCESSES,PORTABLE-LISTENERS,PORTABLE-REBEX-CONFIG,PORTABLE-USER-STATIC'}
        $Deferred=@()
        foreach($Check in $SafeChecks){if($Check.status -eq 'skip' -and $DeferredDefinitions.ContainsKey($Check.id)){$Deferred+=@{id=$Check.id;status=$Check.status;deferredTo=$DeferredDefinitions[$Check.id]}}}
        $Failures=@($SafeChecks|Where-Object {$_.status -eq 'fail'}).Count
        $Incomplete=@($SafeChecks|Where-Object {$_.status -in @('skip','warning','not_run','partial') -and -not ($_.status -eq 'skip' -and $DeferredDefinitions.ContainsKey($_.id))}).Count
        $HttpStatus=if($ChildExit -ne 0 -or $Failures -gt 0 -or $Missing.Count -gt 0 -or $Http.ok -ne $true){'fail'}elseif($Incomplete -gt 0 -or $NotPassed.Count -gt 0){'partial'}else{'pass'}
        $Result.httpSmoke=@{status=$HttpStatus;exitCode=$ChildExit;reportFile='portable-http.json';generatedAt=[string]$Http.generatedAt;checks=$SafeChecks;deferredChecks=$Deferred;requiredChecks=$Required;requiredMissingOrDuplicate=$Missing;requiredNotPassed=$NotPassed;checkCounts=@{pass=@($SafeChecks|Where-Object {$_.status -eq 'pass'}).Count;fail=$Failures;incomplete=$Incomplete;deferred=$Deferred.Count}}
    }catch{
        $Message='The optional HTTP smoke could not be verified; no success is inferred.'
        if($_.Exception.Data.Contains('PlayHubSafe')){$Message=$_.Exception.Message}
        $Result.httpSmoke=@{status='fail';checks=@();deferredChecks=@();message=$Message}
        Write-Warning $Message
    }finally{
        if($PasswordPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer)}
        if($null -ne $Secret){$Secret.Dispose()}
        $CredentialJson=$null;$PlainPassword=$null
        if($null -ne $ChildProcess){$ChildProcess.Dispose()}
    }
}
$Code=Save-Result
exit $Code
