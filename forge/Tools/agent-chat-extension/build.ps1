param(
    [Parameter(Mandatory = $true)][string]$Godot,
    [string]$Clang = 'clang.exe'
)
$ErrorActionPreference = 'Stop'
$editor = (Get-Command $Godot).Source
$compiler = (Get-Command $Clang).Source
$linker = Join-Path (Split-Path $compiler) 'lld-link.exe'
$outputDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../Godot/addons/playforge_agent_chat/bin'))
$output = Join-Path $outputDir 'playforge_agent_chat.windows.x86_64.dll'
$buildDir = Join-Path ([IO.Path]::GetTempPath()) ('playforge-chat-build-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($buildDir) | Out-Null
Push-Location $buildDir
try {
    & $editor --headless --dump-gdextension-interface
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the Godot ABI header.' }
    & $editor --headless --dump-extension-api
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the Godot class API.' }
    $api = Get-Content -LiteralPath 'extension_api.json' -Raw | ConvertFrom-Json
    $sizes = ($api.builtin_class_sizes | Where-Object build_configuration -eq 'float_64').sizes
    $variantSize = ($sizes | Where-Object name -eq 'Variant').size
    $nameSize = ($sizes | Where-Object name -eq 'StringName').size
    $notification = ($api.classes | Where-Object name -eq 'Object').methods | Where-Object name -eq 'notification'
    if ($api.header.version_major -ne 4 -or $api.header.version_minor -ne 7 -or $api.header.precision -ne 'single' -or
        $variantSize -ne 24 -or $nameSize -ne 8 -or $notification.hash -ne 4023243586) {
        throw 'The extension requires the Godot 4.7 single-precision Windows x86-64 ABI.'
    }
    & $compiler --target=x86_64-pc-windows-msvc -ffreestanding -std=c17 -O2 -Wall -Wextra -Wno-unused-parameter -Werror -I. -c (Join-Path $PSScriptRoot 'chat_dock.c') -o chat_dock.obj
    if ($LASTEXITCODE -ne 0) { throw 'Chat dock compilation failed.' }
    & $linker /dll /noentry /nodefaultlib /timestamp:0 /out:chat.dll chat_dock.obj
    if ($LASTEXITCODE -ne 0) { throw 'Chat dock linking failed.' }
    [IO.Directory]::CreateDirectory($outputDir) | Out-Null
    Copy-Item -LiteralPath 'chat.dll' -Destination $output -Force
    Write-Output $output
}
finally {
    Pop-Location
    foreach ($file in @('gdextension_interface.h', 'extension_api.json', 'chat_dock.obj', 'chat.dll', 'chat.lib', 'chat.exp')) {
        $path = Join-Path $buildDir $file
        if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
    }
    [IO.Directory]::Delete($buildDir)
}
