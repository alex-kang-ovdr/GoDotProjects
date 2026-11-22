param(
  [string]$EngineDir = "D:\Github\GoDotProjects-worktrees\Forge-GodotEngine",
  [string]$EmsdkDir = "D:\SDK\emsdk",
  [string]$OutputDir = "D:\Github\GoDotProjects-worktrees\PlayHub-Platform\forge\OfficialGodot\vendor-release",
  [int]$Jobs = 32
)

$ErrorActionPreference = "Stop"
$profilePath = Join-Path $PSScriptRoot "web_editor_release_slim.py"
$nodeBin = "D:\Github\GoDotProjects-worktrees\PlayHub-Platform\artifacts\local-runtime\node24\node.exe"
if (-not (Test-Path $nodeBin)) { $nodeBin = "node" }

if (-not (Test-Path "$EmsdkDir\upstream\emscripten\emcc.bat")) {
  throw "Emscripten not found at $EmsdkDir. Install emsdk 4.0.11+ first."
}

$env:EMSDK = $EmsdkDir
$env:EM_CONFIG = Join-Path $EmsdkDir ".emscripten"
$env:EMSDK_NODE = Join-Path $EmsdkDir "node\24.19.0_64bit\node.exe"
$env:EMSDK_PYTHON = Join-Path $EmsdkDir "python\3.13.3_64bit\python.exe"
$env:PATH = "$EmsdkDir\node\24.19.0_64bit;$EmsdkDir;$EmsdkDir\upstream\emscripten;$EmsdkDir\upstream\bin;$env:PATH"
$env:PLAYFORGE_EDITOR_LOCALES = "ko,en,ja,zh_CN,fr,es,pt_BR,hi"
$env:PLAYFORGE_SKIP_DOC_TRANSLATIONS = "1"

Write-Host "[playforge-wasm] Emscripten version:"
& "$EmsdkDir\upstream\emscripten\emcc.bat" --version | Select-Object -First 2

Push-Location $EngineDir
try {
  Write-Host "[playforge-wasm] Building slim custom release Web Editor WASM (with modules/playforge_core) using -j$Jobs..."
  & python -m SCons "platform=web" "target=editor" "arch=wasm32" "production=yes" "optimize=size_extra" "lto=thin" "debug_symbols=no" "use_assertions=no" "deprecated=yes" "wasm_simd=yes" "dlink_enabled=no" "use_closure_compiler=no" "profile=$profilePath" "-j$Jobs"
  if ($LASTEXITCODE -ne 0) { throw "SCons build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$zipPath = Join-Path $EngineDir "bin\godot.web.editor.wasm32.zip"
if (-not (Test-Path $zipPath)) {
  throw "Expected Web Editor zip not found: $zipPath"
}

$baseVendor = Join-Path (Split-Path $OutputDir -Parent) "vendor"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path $baseVendor) {
  Copy-Item "$baseVendor\*" $OutputDir -Force -Exclude "*.wasm","*.wasm.br","*.wasm.gz","godot.editor.js","godot.editor.js.br","godot.editor.js.gz"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName.EndsWith('/')) { continue }
    $dest = Join-Path $OutputDir $entry.FullName
    New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
  }
} finally {
  $zip.Dispose()
}

# Precompress godot.editor.wasm & godot.editor.js with Brotli q=11 and Gzip level 9
$precompressScript = @"
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const dir = process.argv[1];
for (const name of ['godot.editor.wasm', 'godot.editor.js']) {
  const full = path.join(dir, name);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full);
  const br = zlib.brotliCompressSync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(full + '.br', br);
  fs.writeFileSync(full + '.gz', gz);
  console.log(name, { raw: raw.length, br11: br.length, gz9: gz.length });
}
"@
& $nodeBin -e $precompressScript $OutputDir
if ($LASTEXITCODE -ne 0) { throw "Precompression failed" }

Write-Host "[playforge-wasm] DONE -> $OutputDir"
