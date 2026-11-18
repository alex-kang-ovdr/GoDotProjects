$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$name = 'Godot_v4.7.2-stable_web_editor.zip'
$sha512 = '03ad6b4b4d96f0f7d85bf4fdcf29535891b79d52ee94a11e96895463a2745347b8f601b455e7a58135bf641df43fc25296bc257bbfce593d477dfa64a2272268'
$downloads = Join-Path $root 'Saved/Downloads'
$destination = [IO.Path]::GetFullPath((Join-Path $root 'OfficialGodot/vendor'))
New-Item -ItemType Directory -Force -Path $downloads,$destination | Out-Null
$archive = Join-Path $downloads $name
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri ('https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/' + $name) -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash -ne $sha512) { throw 'Godot Web Editor checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
        if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe editor archive path' }
        if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
    }
} finally { $zip.Dispose() }
Write-Output "Verified Godot 4.7.2 Web Editor: $destination"
