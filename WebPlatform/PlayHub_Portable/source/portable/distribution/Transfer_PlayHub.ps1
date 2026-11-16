#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('ExportData','ImportData','ExportLogs','ImportLogs')]
    [string]$Mode,
    [string]$InstanceRoot = (Join-Path $env:LOCALAPPDATA 'PlayHub'),
    [string]$ArchivePath,
    [string]$DestinationPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$Utf8 = [Text.UTF8Encoding]::new($false)
$ManifestName = 'playhub-transfer.json'
$MaximumBytes = 8GB
$MaximumFileBytes = 4GB
$MaximumEntries = 25000
$MaximumManifestBytes = 12MB
$Buffer = New-Object byte[] (128KB)
$PrivatePaths = @('private/config/local.json','private/data/platform.sqlite','private/data/platform.sqlite-wal','private/data/platform.sqlite-shm','private/data/platform.sqlite-journal')
$SourceHost = [Net.Dns]::GetHostName()

function Assert-NoLink([IO.FileSystemInfo]$Item) {
    if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A selected path contains a link or junction.' }
}

function Get-LocalPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -notmatch '^[a-zA-Z]:\\' -or $full -eq [IO.Path]::GetPathRoot($full)) {
        throw 'Select a file or folder on a local Windows drive.'
    }
    $root = [IO.Path]::GetPathRoot($full)
    $cursor = $root
    foreach ($segment in $full.Substring($root.Length).Split('\')) {
        if (-not $segment) { continue }
        if ($segment -match '[:<>|?*"\x00-\x1f]|[. ]$|^(?:CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3]|CONIN\$|CONOUT\$)(?:\.|$)') {
            throw 'The selected path has a name that is unsafe on Windows.'
        }
        $cursor = Join-Path $cursor $segment
        $existing = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($existing) { Assert-NoLink $existing }
    }
    return $full.TrimEnd('\')
}

function Test-InFolder([string]$Path,[string]$Folder) {
    return $Path.Equals($Folder,[StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($Folder.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)
}

function Protect-TransferDirectory([string]$Path) {
    $helper = Join-Path $PSScriptRoot 'protect-instance.ps1'
    if (-not [IO.File]::Exists($helper)) { $helper = Join-Path (Split-Path -Parent $PSScriptRoot) 'protect-instance.ps1' }
    $null = Get-LocalPath $helper
    if (-not [IO.File]::Exists($helper)) { throw 'The distributed directory protection helper is missing.' }
    $hostExe = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe'
    $output = & $hostExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstanceRoot $Path
    if ($LASTEXITCODE -ne 0 -or -not ($output | ConvertFrom-Json).verified) { throw 'Could not restrict the transfer folder to this Windows account.' }
}

function New-TransferDirectory([string]$Parent) {
    $Parent = Get-LocalPath $Parent
    $null = [IO.Directory]::CreateDirectory($Parent)
    $child = Join-Path $Parent ('.playhub-transfer-' + [guid]::NewGuid().ToString('N'))
    $null = [IO.Directory]::CreateDirectory($child)
    try { Protect-TransferDirectory $child }
    catch { [IO.Directory]::Delete($child); throw }
    return $child
}

function Remove-TransferDirectory([string]$Path,[string]$Parent) {
    if (-not $Path -or -not [IO.Directory]::Exists($Path)) { return }
    $safePath = Get-LocalPath $Path
    if ((Split-Path -Parent $safePath) -ine (Get-LocalPath $Parent) -or
        (Split-Path -Leaf $safePath) -notmatch '^\.playhub-transfer-[0-9a-f]{32}$') {
        throw 'Temporary transfer folder failed the cleanup path check.'
    }
    Remove-Item -LiteralPath $safePath -Recurse -Force
}

function Assert-ZipName([string]$Name) {
    if (-not $Name -or $Name.Length -gt 240 -or $Name -match '[/]{2}|[\\:<>|?*"\x00-\x1f]|^/|/$' -or
        $Name -cne $Name.Normalize([Text.NormalizationForm]::FormC)) { throw 'The ZIP contains an unsafe or unsupported path.' }
    foreach ($segment in $Name.Split('/')) {
        if ($segment -match '[. ]$|^(?:CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3]|CONIN\$|CONOUT\$)(?:\.|$)') {
            throw 'The ZIP contains a name that is unsafe on Windows.'
        }
    }
}

function Test-TransferFile([string]$Name,[string]$Kind) {
    if ($Kind -eq 'data') {
        return $Name -in $PrivatePaths -or
            ($Name -match '^workspace/(?:games|catalog)/.+' -and
             $Name -notmatch '\.(?:exe|dll|msi|com|scr|bat|cmd|ps1|vbs|lnk|url)$' -and
             $Name -notmatch '(^|/)(?:node_modules|\.git)(?:/|$)')
    }
    if ($Name -match '(^|/)(?:private|config|database|databases|sessions?|cookies?|credentials?|secrets?|tokens?|backups?|recovery)(?:[./_-]|$)' -or
        $Name -match '(?:^|/)\.(?:env|npmrc)(?:\.|$)|\.(?:db|sqlite3?|db3)(?:-(?:shm|wal|journal))?$|\.(?:pem|key|pfx|p12|cer|crt|kdbx|sqlite3?-journal)$') {
        return $false
    }
    if ($Name -match '^servers/user/.+') { return $Name -match '\.log(?:\.\d+)?$' }
    return $Name -match '^(?:reports|logs|temp|cache|sites|app)/.+'
}

function Get-TreeFiles([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $entry = Get-Item -LiteralPath $Path -Force
    Assert-NoLink $entry
    if ($entry -is [IO.FileInfo]) { $entry; return }
    foreach ($child in Get-ChildItem -LiteralPath $entry.FullName -Force) {
        Assert-NoLink $child
        if ($child -is [IO.DirectoryInfo]) { Get-TreeFiles $child.FullName }
        elseif ($child -is [IO.FileInfo]) { $child }
        else { throw 'A selected transfer folder contains an unsupported item.' }
    }
}

function Get-LanAddresses {
    foreach ($adapter in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($adapter.OperationalStatus -ne [Net.NetworkInformation.OperationalStatus]::Up) { continue }
        foreach ($interfaceAddress in $adapter.GetIPProperties().UnicastAddresses) {
            $ip = $interfaceAddress.Address
            if ($ip.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
                -not [Net.IPAddress]::IsLoopback($ip) -and -not $ip.ToString().StartsWith('169.254.')) { $ip.ToString() }
        }
    }
}

function Read-TransferJson([string]$Path,[long]$Limit) {
    $null = Get-LocalPath $Path
    $file = Get-Item -LiteralPath $Path -Force
    if ($file -isnot [IO.FileInfo] -or $file.Length -lt 2 -or $file.Length -gt $Limit) {
        throw 'A transfer record has an invalid file size.'
    }
    try { return [IO.File]::ReadAllText($file.FullName,$Utf8) | ConvertFrom-Json }
    catch { throw 'A transfer record is not valid JSON.' }
}

function Get-ConfigPorts($Config) {
    $ports = @($Config.userPort,$Config.adminUiPort,$Config.publicPort,$Config.adminPort)
    foreach ($port in $ports) {
        if (($port -isnot [int] -and $port -isnot [long]) -or $port -lt 1024 -or $port -gt 65535) {
            throw 'PlayHub configuration needs four valid TCP port numbers.'
        }
    }
    if (@($ports | Sort-Object -Unique).Count -ne 4) { throw 'PlayHub configuration has duplicate TCP ports.' }
    return $ports
}

function Assert-NoListeners([int[]]$Ports) {
    if (-not $Ports.Count) { return }
    $rows = & (Join-Path ([Environment]::SystemDirectory) 'netstat.exe') -ano
    if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate local TCP listeners.' }
    foreach ($row in $rows) {
        if ($row -match '^\s*TCP\s+\S+:(\d+)\s+\S+:0\s+\S+\s+(\d+)\s*$' -and [int]$Matches[1] -in $Ports) {
            throw ('TCP port {0} is occupied by PID {1}. Close the server before transferring data.' -f $Matches[1],$Matches[2])
        }
    }
}

function Write-OwnedRecord([string]$Path,$Record) {
    $stream = [IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes = $Utf8.GetBytes(($Record | ConvertTo-Json -Compress -Depth 8) + [Environment]::NewLine)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

function Open-TransferLock([string]$Root,[int[]]$IncomingPorts) {
    $private = Get-LocalPath (Join-Path $Root 'private')
    $data = Get-LocalPath (Join-Path $private 'data')
    $launcher = Get-LocalPath (Join-Path $private 'launcher.lock')
    $maintenance = Get-LocalPath (Join-Path $data 'maintenance.lock')
    $token = [guid]::NewGuid().ToString()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = ([BitConverter]::ToString($hash.ComputeHash($Utf8.GetBytes($Root.ToLowerInvariant())))).Replace('-','').ToLowerInvariant() }
    finally { $hash.Dispose() }
    try {
        $pipe = [IO.Pipes.NamedPipeServerStream]::new(('playhub-instance-' + $key),[IO.Pipes.PipeDirection]::InOut,1)
    } catch { throw 'Another operation is acquiring this PlayHub instance. Close it and try again.' }
    $lock = @{Pipe=$pipe; Launcher=$launcher; Maintenance=$maintenance; Token=$token; MovedLauncher=$null; OwnsLauncher=$false; OwnsMaintenance=$false}
    try {
        if (Test-Path -LiteralPath $maintenance) { throw 'PlayHub has a maintenance marker. Resolve the prior operation before transferring data.' }
        if (Test-Path -LiteralPath $launcher) {
            $previous = Read-TransferJson $launcher 65536
            if ($previous.product -ne 'playhub-portable' -or [string]$previous.runId -notmatch '^[a-f0-9-]{36}$' -or
                ($previous.pid -isnot [int] -and $previous.pid -isnot [long]) -or $previous.pid -le 0 -or $previous.pid -gt [int]::MaxValue) {
                throw 'The old PlayHub launcher record could not be identified.'
            }
            $process = Get-Process -Id ([int]$previous.pid) -ErrorAction SilentlyContinue
            if ($process) { $process.Dispose(); throw 'The PlayHub launcher is running. Close it before transferring data.' }
            $saved = Join-Path $private ('launcher-before-transfer-' + $token + '.lock')
            [IO.File]::Move($launcher,$saved)
            $lock.MovedLauncher = $saved
        }
        $configPath = Join-Path $private 'config/local.json'
        $ports = @($IncomingPorts | Where-Object { $_ })
        if (Test-Path -LiteralPath $configPath) { $ports += @(Get-ConfigPorts (Read-TransferJson $configPath 1MB)) }
        Assert-NoListeners $ports
        $null = [IO.Directory]::CreateDirectory($data)
        $started = [DateTime]::UtcNow.ToString('o')
        Write-OwnedRecord $launcher @{product='playhub-portable';runId=$token;pid=$PID;startedAt=$started}
        $lock.OwnsLauncher = $true
        Write-OwnedRecord $maintenance @{product='playhub-portable';operation='data-transfer';runId=$token;pid=$PID;startedAt=$started}
        $lock.OwnsMaintenance = $true
        Assert-NoListeners $ports
        return $lock
    } catch {
        Close-TransferLock $lock
        throw
    }
}

function Close-TransferLock($Lock,[switch]$KeepMaintenance) {
    if (-not $Lock) { return }
    try {
        if ($Lock.OwnsMaintenance -and -not $KeepMaintenance -and (Read-TransferJson $Lock.Maintenance 65536).runId -eq $Lock.Token) {
            [IO.File]::Delete($Lock.Maintenance)
        }
    } finally {
        try {
            if ($Lock.OwnsLauncher -and (Read-TransferJson $Lock.Launcher 65536).runId -eq $Lock.Token) {
                [IO.File]::Delete($Lock.Launcher)
            }
            if ($Lock.MovedLauncher -and -not (Test-Path -LiteralPath $Lock.Launcher)) { [IO.File]::Move($Lock.MovedLauncher,$Lock.Launcher) }
        } finally { $Lock.Pipe.Dispose() }
    }
}

function Copy-TransferStream([IO.Stream]$Source,[IO.Stream]$Target,[long]$Expected) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $count = 0L
    try {
        while (($read = $Source.Read($Buffer,0,$Buffer.Length)) -gt 0) {
            $count += $read
            if ($count -gt $Expected) { throw 'A transfer file was larger than declared.' }
            $null = $hash.TransformBlock($Buffer,0,$read,$Buffer,0)
            $Target.Write($Buffer,0,$read)
        }
        if ($count -ne $Expected) { throw 'A transfer file changed size while it was read.' }
        $null = $hash.TransformFinalBlock($Buffer,0,0)
        return ([BitConverter]::ToString($hash.Hash)).Replace('-','').ToLowerInvariant()
    } finally { $hash.Dispose() }
}

function Write-TransferZip([string]$Root,[string]$File,[string]$Kind) {
    $roots = if ($Kind -eq 'data') { $PrivatePaths + @('workspace/games','workspace/catalog') }
        else { @('reports','logs','temp','cache','sites','app','servers/user') }
    $archive = [IO.Compression.ZipArchive]::new([IO.File]::Open($File,[IO.FileMode]::CreateNew),[IO.Compression.ZipArchiveMode]::Create)
    $entries = [Collections.Generic.List[object]]::new()
    $total = 0L
    try {
        foreach ($relativeRoot in $roots) {
            $sourceRoot = Get-LocalPath (Join-Path $Root $relativeRoot)
            foreach ($fileInfo in Get-TreeFiles $sourceRoot) {
                $name = $fileInfo.FullName.Substring($Root.Length+1).Replace('\','/')
                if (-not (Test-TransferFile $name $Kind)) { continue }
                Assert-ZipName $name
                $total += $fileInfo.Length
                if ($total -gt $MaximumBytes -or $fileInfo.Length -gt $MaximumFileBytes -or $entries.Count -ge $MaximumEntries) {
                    throw 'The transfer exceeds the archive limits.'
                }
                $share = if ($Kind -eq 'data') { [IO.FileShare]::Read } else { [IO.FileShare]::ReadWrite }
                $inputStream = [IO.File]::Open($fileInfo.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,$share)
                try {
                    $outputStream = $archive.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal).Open()
                    try { $sha256 = Copy-TransferStream $inputStream $outputStream $fileInfo.Length }
                    finally { $outputStream.Dispose() }
                } finally { $inputStream.Dispose() }
                $entries.Add(@{path=$name;bytes=$fileInfo.Length;sha256=$sha256})
            }
        }
        if ($Kind -eq 'data') {
            $names = @($entries | ForEach-Object { $_.path })
            if ('private/config/local.json' -notin $names -or 'private/data/platform.sqlite' -notin $names) {
                throw 'The PlayHub configuration or main SQLite database is missing.'
            }
        } elseif (-not $entries.Count) { throw 'No transferable diagnostic or temporary files were found.' }
        $manifest = @{
            format='PlayHubTransfer';schemaVersion=1;kind=$Kind;createdAt=[DateTime]::UtcNow.ToString('o')
            source=@{computerName=$SourceHost;localIpv4=@(Get-LanAddresses | Sort-Object -Unique)}
            files=$entries.ToArray()
        }
        $manifestBytes = $Utf8.GetBytes(($manifest | ConvertTo-Json -Compress -Depth 8))
        if ($manifestBytes.Length -gt $MaximumManifestBytes) { throw 'The archive manifest would exceed the allowed size.' }
        $stream = $archive.CreateEntry($ManifestName).Open()
        try { $stream.Write($manifestBytes,0,$manifestBytes.Length) } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
}

function Expand-TransferZip([string]$File,[string]$Folder,[string]$Kind) {
    $inputStream = [IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try {
        if ($inputStream.Length -gt ($MaximumBytes + 64MB)) { throw 'The ZIP exceeds the compressed size limit.' }
        $archive = [IO.Compression.ZipArchive]::new($inputStream,[IO.Compression.ZipArchiveMode]::Read,$true)
        try {
            if ($archive.Entries.Count -lt 2 -or $archive.Entries.Count -gt ($MaximumEntries+1)) { throw 'The ZIP has an invalid number of entries.' }
            $index = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
            foreach ($entry in $archive.Entries) {
                Assert-ZipName $entry.FullName
                $attributes = [long]$entry.ExternalAttributes -band 0xffffffffL
                $unixType = ($attributes -shr 16) -band 0xf000
                if (($attributes -band 0x410) -or ($unixType -and $unixType -ne 0x8000)) { throw 'The ZIP contains a linked or unsupported file.' }
                if ($index.ContainsKey($entry.FullName)) { throw 'The ZIP contains duplicate paths.' }
                $index.Add($entry.FullName,$entry)
            }
            if (-not $index.ContainsKey($ManifestName) -or $index[$ManifestName].FullName -cne $ManifestName) {
                throw 'Select a ZIP created by the matching PlayHub transfer tool.'
            }
            $manifestEntry = $index[$ManifestName]
            if ($manifestEntry.Length -lt 2 -or $manifestEntry.Length -gt $MaximumManifestBytes) { throw 'The ZIP manifest size is invalid.' }
            $manifestBuffer = [IO.MemoryStream]::new()
            $manifestStream = $manifestEntry.Open()
            try {
                $null = Copy-TransferStream $manifestStream $manifestBuffer $manifestEntry.Length
                try { $manifest = $Utf8.GetString($manifestBuffer.ToArray()) | ConvertFrom-Json }
                catch { throw 'The ZIP manifest is invalid.' }
            } finally { $manifestStream.Dispose(); $manifestBuffer.Dispose() }
            if ($manifest.format -cne 'PlayHubTransfer' -or $manifest.schemaVersion -ne 1 -or $manifest.kind -cne $Kind -or
                $manifest.files -isnot [array] -or $manifest.files.Count -ne ($index.Count-1)) {
                throw 'This ZIP has the wrong transfer type or an unsupported manifest.'
            }
            $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
            $total = 0L
            foreach ($record in $manifest.files) {
                if ($record.path -isnot [string]) { throw 'The ZIP file inventory is invalid.' }
                $name = $record.path
                Assert-ZipName $name
                if (-not (Test-TransferFile $name $Kind) -or -not $seen.Add($name) -or
                    -not $index.ContainsKey($name) -or $index[$name].FullName -cne $name -or
                    ($record.bytes -isnot [int] -and $record.bytes -isnot [long]) -or
                    $record.bytes -lt 0 -or $record.bytes -gt $MaximumFileBytes -or
                    $record.bytes -ne $index[$name].Length -or $record.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
                    throw 'The ZIP file inventory has an invalid or disallowed entry.'
                }
                $parentName = $name
                while ($parentName.Contains('/')) {
                    $parentName = $parentName.Substring(0,$parentName.LastIndexOf('/'))
                    if ($index.ContainsKey($parentName)) { throw 'The ZIP has a file where a folder is required.' }
                }
                $total += $record.bytes
                if ($total -gt $MaximumBytes) { throw 'The ZIP exceeds the expanded size limit.' }
            }
            if ($Kind -eq 'data' -and (-not $seen.Contains('private/config/local.json') -or -not $seen.Contains('private/data/platform.sqlite'))) {
                throw 'The data ZIP lacks the PlayHub configuration or SQLite database.'
            }
            foreach ($record in $manifest.files) {
                $target = Get-LocalPath (Join-Path $Folder $record.path)
                if (-not (Test-InFolder $target $Folder)) { throw 'The ZIP file path is outside the transfer folder.' }
                $null = [IO.Directory]::CreateDirectory((Split-Path -Parent $target))
                $source = $index[$record.path].Open()
                try {
                    $targetStream = [IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                    try { $sha256 = Copy-TransferStream $source $targetStream $record.bytes }
                    finally { $targetStream.Dispose() }
                } finally { $source.Dispose() }
                if ($sha256 -ine $record.sha256) { throw 'A ZIP file failed the SHA-256 integrity check.' }
            }
            return $manifest
        } finally { $archive.Dispose() }
    } finally { $inputStream.Dispose() }
}

function Test-MachineHost([string]$HostName,$Source) {
    $name = $HostName.Trim([char[]]'[]').TrimEnd('.')
    $parsed = $null
    if ([Net.IPAddress]::TryParse($name,[ref]$parsed)) {
        if ([Net.IPAddress]::IsLoopback($parsed) -or $name -in @($Source.localIpv4)) { return $true }
        if ($parsed.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
            $octets = $parsed.GetAddressBytes()
            return $octets[0] -eq 10 -or ($octets[0] -eq 192 -and $octets[1] -eq 168) -or
                ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or ($octets[0] -eq 169 -and $octets[1] -eq 254)
        }
        return $parsed.IsIPv6LinkLocal -or (($parsed.GetAddressBytes()[0] -band 0xfe) -eq 0xfc)
    }
    return $name -ieq $Source.computerName -or $name -notmatch '\.' -or $name -match '\.(?:local|lan)$'
}

function Repair-ImportedConfig([string]$Folder,[string]$Root,$Source) {
    $file = Join-Path $Folder 'private/config/local.json'
    $config = Read-TransferJson $file 1MB
    $database = [IO.File]::OpenRead((Join-Path $Folder 'private/data/platform.sqlite'))
    try {
        $header = New-Object byte[] 16
        if ($database.Read($header,0,$header.Length) -ne 16 -or
            [Text.Encoding]::ASCII.GetString($header) -cne ('SQLite format 3' + [char]0)) {
            throw 'The data ZIP does not contain a valid SQLite database header.'
        }
    } finally { $database.Dispose() }
    $ports = @(Get-ConfigPorts $config)
    if ($config.publicHost -cne '0.0.0.0' -or $config.adminHost -cne '127.0.0.1' -or $config.secureCookies -ne $false -or
        $config.admin.username -notmatch '^[A-Za-z0-9_.-]{3,40}$' -or
        $config.admin.salt -notmatch '^[a-fA-F0-9]{32}$' -or $config.admin.passwordHash -notmatch '^[a-fA-F0-9]{128}$') {
        throw 'Only a valid Windows Portable HTTP configuration can be transferred.'
    }
    $addresses = @('localhost','127.0.0.1') + @(Get-LanAddresses | Sort-Object -Unique)
    $origins = @($addresses | ForEach-Object { 'http://{0}:{1}' -f $_,$config.userPort })
    foreach ($origin in $config.userOrigins) {
        $uri = $null
        if (-not [Uri]::TryCreate($origin,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'http' -or
            $uri.UserInfo -or $uri.PathAndQuery -ne '/' -or $uri.Fragment) {
            throw 'The data ZIP contains an invalid user origin.'
        }
        if (-not (Test-MachineHost $uri.Host $Source)) { $origins += $uri.GetLeftPart([UriPartial]::Authority) }
    }
    foreach ($field in @('userBaseUrl','publicBaseUrl')) {
        $uri = $null
        if (-not [Uri]::TryCreate($config.$field,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'http' -or $uri.UserInfo) {
            throw 'The data ZIP contains an invalid Portable base URL.'
        }
        if (Test-MachineHost $uri.Host $Source) {
            $port = if ($field -eq 'userBaseUrl') { $config.userPort } else { $config.publicPort }
            $config.$field = 'http://localhost:' + $port
        }
    }
    $origins += ([Uri]$config.userBaseUrl).GetLeftPart([UriPartial]::Authority)
    $config.userOrigins = @($origins | Select-Object -Unique)
    $config.adminOrigins = @(('http://localhost:' + $config.adminUiPort), ('http://127.0.0.1:' + $config.adminUiPort))
    $config.adminBaseUrl = 'http://127.0.0.1:' + $config.adminUiPort
    $config.dataDir = Join-Path $Root 'private\data'
    if ($config.google -and $config.google.redirectUri) {
        $redirect = $null
        if (-not [Uri]::TryCreate($config.google.redirectUri,[UriKind]::Absolute,[ref]$redirect) -or
            $redirect.Scheme -notin @('http','https') -or $redirect.UserInfo) { throw 'The data ZIP contains an invalid Google callback URL.' }
        if (Test-MachineHost $redirect.Host $Source) {
            $loopbackHost = if ($redirect.Host -eq '127.0.0.1') { '127.0.0.1' } else { 'localhost' }
            $config.google.redirectUri = 'http://{0}:{1}{2}' -f $loopbackHost,$config.publicPort,$redirect.PathAndQuery
        }
    }
    [IO.File]::WriteAllText($file,($config | ConvertTo-Json -Depth 24),$Utf8)
    return $ports
}

function Move-TransferItem([string]$From,[string]$To) {
    $item = Get-Item -LiteralPath $From -Force
    Assert-NoLink $item
    $destination = Get-LocalPath $To
    if (Test-Path -LiteralPath $destination) { throw 'A transfer move would replace an existing path.' }
    $null = [IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
    if ($item -is [IO.DirectoryInfo]) { [IO.Directory]::Move($item.FullName,$destination) }
    else { [IO.File]::Move($item.FullName,$destination) }
}

function Install-ImportedData([string]$Root,[string]$Stage,$Lock,[ref]$NeedsRecovery) {
    $recovery = Get-LocalPath (Join-Path $Root ('recovery/transfer-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + $Lock.Token))
    $null = [IO.Directory]::CreateDirectory($recovery)
    Protect-TransferDirectory $recovery
    $journal = Join-Path $recovery 'transfer-recovery.json'
    Write-OwnedRecord $journal @{product='playhub-portable';operation='data-transfer';runId=$Lock.Token;stage=$Stage;status='in-progress'}
    $moves = [Collections.Generic.List[object]]::new()
    $oldData = Join-Path $Root 'private/data'
    try {
        $preserve = @('private/config','workspace') + @(Get-ChildItem -LiteralPath $oldData -Force |
            Where-Object Name -ine 'maintenance.lock' | ForEach-Object { 'private/data/' + $_.Name })
        foreach ($relative in $preserve) {
            $source = Get-LocalPath (Join-Path $Root $relative)
            if (-not (Test-Path -LiteralPath $source)) { continue }
            $target = Join-Path $recovery $relative
            Move-TransferItem $source $target
            $moves.Add(@{From=$source;To=$target})
        }
        $incoming = @('private/config','workspace') + @(Get-ChildItem -LiteralPath (Join-Path $Stage 'private/data') -Force |
            ForEach-Object { 'private/data/' + $_.Name })
        foreach ($relative in $incoming) {
            $source = Get-LocalPath (Join-Path $Stage $relative)
            if (-not (Test-Path -LiteralPath $source)) { continue }
            $target = Join-Path $Root $relative
            Move-TransferItem $source $target
            $moves.Add(@{From=$source;To=$target})
        }
        Write-OwnedRecord (Join-Path $recovery 'completed.json') @{product='playhub-portable';runId=$Lock.Token;completedAt=[DateTime]::UtcNow.ToString('o')}
        return $recovery
    } catch {
        for ($i=$moves.Count-1; $i -ge 0; $i--) {
            try { Move-TransferItem $moves[$i].To $moves[$i].From }
            catch { $NeedsRecovery.Value = $true }
        }
        if ($NeedsRecovery.Value) {
            throw ('Import rollback could not finish. Leave PlayHub stopped. Previous files and the recovery record are in ' + $recovery)
        }
        throw ('Import did not complete. The previous files were restored. Recovery record: ' + $recovery)
    }
}

$stage = $null
$stageParent = $null
$lock = $null
$needsRecovery = $false
$exitCode = 0
try {
    $root = Get-LocalPath $InstanceRoot
    $kind = if ($Mode -like '*Data') { 'data' } else { 'logs' }
    $exporting = $Mode -like 'Export*'
    $documents = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
    if (-not $documents) { $documents = $env:USERPROFILE }
    $defaultOutput = Join-Path $documents 'PlayHub-Transfers'
    $stamp = [DateTime]::Now.ToString('yyyyMMdd-HHmmss')
    if (-not $ArchivePath) {
        if ($exporting) {
            $defaultZip = Join-Path $defaultOutput ('PlayHub-' + $kind + '-' + $stamp + '.zip')
            Write-Host ('Default archive: ' + $defaultZip)
            $ArchivePath = Read-Host 'Enter an archive path, or press Enter for the default'
            if (-not $ArchivePath) { $ArchivePath = $defaultZip }
        } else { $ArchivePath = Read-Host 'Enter the path to the PlayHub transfer ZIP' }
    }
    if (-not $ArchivePath) { throw 'No archive path was selected.' }
    $zip = Get-LocalPath ($ArchivePath.Trim().Trim('"'))
    if ([IO.Path]::GetExtension($zip) -ine '.zip' -or (Test-InFolder $zip $root)) { throw 'Choose a ZIP path outside the PlayHub instance folder.' }
    if ($exporting) {
        if (-not [IO.Directory]::Exists($root)) { throw 'The PlayHub instance folder does not exist.' }
        if (Test-Path -LiteralPath $zip) { throw 'The archive already exists. Choose a new output path.' }
        if ($kind -eq 'data') {
            $config = Read-TransferJson (Join-Path $root 'private/config/local.json') 1MB
            if ((Get-LocalPath $config.dataDir) -ine (Get-LocalPath (Join-Path $root 'private/data'))) {
                throw 'PlayHub configuration points to a database outside the selected instance.'
            }
            $lock = Open-TransferLock $root @()
        }
        $stageParent = Split-Path -Parent $zip
        $stage = New-TransferDirectory $stageParent
        $temporaryZip = Join-Path $stage 'transfer.zip'
        Write-TransferZip $root $temporaryZip $kind
        [IO.File]::Move($temporaryZip,$zip)
        Write-Host ('Created transfer ZIP: ' + $zip)
    } elseif ($kind -eq 'data') {
        $null = [IO.Directory]::CreateDirectory($root)
        $stageParent = $root
        $stage = New-TransferDirectory $stageParent
        $manifest = Expand-TransferZip $zip $stage $kind
        $ports = @(Repair-ImportedConfig $stage $root $manifest.source)
        $lock = Open-TransferLock $root $ports
        Write-Host ('PlayHub data folder: ' + $root)
        if (([string](Read-Host 'Import these data and preserve the old files in recovery? [y/N]')).Trim() -ine 'y') {
            throw 'Import canceled.'
        }
        Protect-TransferDirectory $root
        $retained = Install-ImportedData $root $stage $lock ([ref]$needsRecovery)
        Write-Host ('Data imported. Previous files, if any, are in ' + $retained)
    } else {
        if (-not $DestinationPath) {
            $defaultFolder = Join-Path $defaultOutput ('PlayHub-logs-' + $stamp)
            Write-Host ('Default inspection folder: ' + $defaultFolder)
            $DestinationPath = Read-Host 'Enter a new inspection folder, or press Enter for the default'
            if (-not $DestinationPath) { $DestinationPath = $defaultFolder }
        }
        $destination = Get-LocalPath ($DestinationPath.Trim().Trim('"'))
        if ((Test-InFolder $destination $root) -or (Test-Path -LiteralPath $destination)) {
            throw 'Choose a new folder outside the PlayHub instance. Existing folders are preserved.'
        }
        $stageParent = Split-Path -Parent $destination
        $stage = New-TransferDirectory $stageParent
        $null = Expand-TransferZip $zip $stage $kind
        [IO.Directory]::Move($stage,$destination)
        Write-Host ('Extracted logs for inspection: ' + $destination)
    }
} catch {
    Write-Host ('Transfer stopped: ' + $_.Exception.Message) -ForegroundColor Red
    $exitCode = 1
} finally {
    try { Close-TransferLock $lock -KeepMaintenance:$needsRecovery }
    catch { Write-Host 'Could not release the owned PlayHub transfer records. Keep PlayHub stopped and inspect the recovery folder.' -ForegroundColor Red; $exitCode = 1 }
    if ($stage -and -not $needsRecovery) {
        try { Remove-TransferDirectory $stage $stageParent }
        catch { Write-Host 'A protected temporary transfer folder could not be removed.' -ForegroundColor Yellow }
    }
}
exit $exitCode
