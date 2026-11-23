param(
    [string]$HavokRoot = "D:\HavokSDK\hk2025_1_1_r1",
    [string]$VsVars = "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
)
$ErrorActionPreference = "Stop"

$AddonRoot = $PSScriptRoot
$SrcDir = Join-Path $AddonRoot "src"
$BinDir = Join-Path $AddonRoot "bin"
$ObjDir = Join-Path $AddonRoot "build_obj"
New-Item -ItemType Directory -Force $BinDir | Out-Null
New-Item -ItemType Directory -Force $ObjDir | Out-Null

$OutDll = Join-Path $BinDir "libplayforge_havok_physics.windows.template_release.x86_64.dll"
$SrcFile = Join-Path $SrcDir "havok_physics_server_3d.cpp"
$HavokInc = Join-Path $HavokRoot "Public\HavokSDK"
$HavokLib = Join-Path $HavokRoot "Lib\x64_vs2022\release"

if (-not (Test-Path $HavokInc)) { throw "Havok include directory not found: $HavokInc" }
if (-not (Test-Path $HavokLib)) { throw "Havok lib directory not found: $HavokLib" }
if (-not (Test-Path $VsVars)) { throw "vcvars64.bat not found: $VsVars" }

$cmd = @"
call "$VsVars" >nul
cl.exe /nologo /LD /O2 /Oi /Ot /MD /GR /EHs-c- /fp:strict /std:c++17 /W3 ^
  /DHK_SET_FP_CONTRACT_OFF /D_WIN32 /DWIN32 /D_WINDOWS /DNDEBUG /D_HAS_EXCEPTIONS=0 ^
  /D_ALLOW_ITERATOR_DEBUG_LEVEL_MISMATCH /DHK_FORCE_INLINE_DEPTH_TO_ZERO /DHK_TARGET_NAME=X64Vs2022 ^
  /I"$SrcDir" /I"$HavokInc" ^
  /Fo"$ObjDir\\" /Fe"$OutDll" ^
  "$SrcFile" ^
  /link /LIBPATH:"$HavokLib" ^
  hkBase.lib hkSerialize.lib hkVisualize.lib hkGeometryUtilities.lib hkcdCollide.lib hkInternal.lib hknpPhysics.lib ^
  ws2_32.lib user32.lib advapi32.lib psapi.lib ^
  /OPT:REF /OPT:ICF /ignore:4221 /ignore:4049 /ignore:4099
"@

$batPath = Join-Path $ObjDir "compile_havok_gdext.bat"
Set-Content -Path $batPath -Value $cmd -Encoding ASCII
& cmd.exe /c $batPath
if ($LASTEXITCODE -ne 0) {
    throw "MSVC build failed with exit code $LASTEXITCODE"
}

Write-Host "Built Havok GDExtension successfully: $OutDll"
Get-Item $OutDll | Select-Object FullName, Length, LastWriteTime
