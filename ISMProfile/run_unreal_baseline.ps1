# Reproduces the Unreal side of the comparison WITHOUT touching the original sample project.
#
#   1. copies Source/Config/Content/uproject of InstancedMeshProfile into a scratch folder
#      (the original project's Binaries/Intermediate/Saved stay untouched; its DLLs were built against a
#       source-engine build that no longer matches, so it cannot be launched as-is)
#   2. builds the Editor target against the STOCK installed UE 5.6.1 (the project supports stock UE:
#      the Havok parts are compiled out when the Havok source engine is absent)
#   3. runs the sample's own GenerateProfileMaterials commandlet, then its -ProfileAuto suite
#
# Same settings as the Godot run: seed 1337, sizes 48/96/144, ISM vs Actor, AB/BA x2, warm-up 3 s, measure 5 s,
# windowed 1440x900, vsync off (the sample forces r.VSync=0), D3D12.
param(
  [string]$Engine = 'C:\EpicGames_UE_5.6',
  [string]$SourceProject = 'D:\Github\UnrealSamples-worktrees\InstancedMeshProfile\InstancedMeshProfile',
  [string]$Work = (Join-Path $env:LOCALAPPDATA 'Temp\ISMProfile_UE_ref'),
  [string]$Out = (Join-Path $PSScriptRoot 'results\unreal'),
  [string]$RunId = 'ue-run1',
  [string]$Sizes = '48,96,144',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$Uproject = Join-Path $Work 'InstancedMeshProfile.uproject'
if (-not $SkipBuild) {
  New-Item -ItemType Directory -Force $Work | Out-Null
  robocopy $SourceProject $Work InstancedMeshProfile.uproject /NFL /NDL /NJH /NJS | Out-Null
  foreach ($d in 'Source','Config') { robocopy (Join-Path $SourceProject $d) (Join-Path $Work $d) /E /NFL /NDL /NJH /NJS | Out-Null }
  # Havok-only content is not needed for the render benchmark and is not loadable on stock UE
  robocopy (Join-Path $SourceProject 'Content') (Join-Path $Work 'Content') /E /XD HavokPhysics ProfileEffects Collections Developers /NFL /NDL /NJH /NJS | Out-Null
  & "$Engine\Engine\Build\BatchFiles\Build.bat" InstancedMeshProfileEditor Win64 Development "-Project=$Uproject" -WaitMutex -NoLiveCoding -NoHotReloadFromIDE -NoUBA -NoXGE 2>&1 | Tee-Object (Join-Path $Out 'build.log')
  if ($LASTEXITCODE -ne 0) { throw 'Editor build failed' }
  $Editor = "$Engine\Engine\Binaries\Win64\UnrealEditor.exe"
  $p = Start-Process $Editor -ArgumentList @("`"$Uproject`"",'-run=GenerateProfileMaterials','-AllowCommandletRendering','-unattended','-nop4','-noxgeshadercompile',"-abslog=`"$Out\materials.log`"") -PassThru
  $p.WaitForExit(1800000) | Out-Null
  if (-not (Select-String "$Out\materials.log" -Pattern 'PROFILE_MATERIALS_GENERATED' -Quiet)) { throw 'material generation failed' }
}
$OutDir = Join-Path $Out $RunId
New-Item -ItemType Directory -Force $OutDir | Out-Null
$a = @("`"$Uproject`"",'/Engine/Maps/Entry','-game','-windowed','-ResX=1440','-ResY=900','-nosplash','-nosound','-unattended','-NoLiveCoding',
  '-noxgeshadercompile','-ProfileAuto','-ProfileSeed=1337',"-ProfileSizes=$Sizes",'-ProfileModes=ISM,Actor','-ProfileWarmup=3','-ProfileSeconds=5','-ProfileRepeats=2',
  '-ProfileEvidenceShots',"-ProfileOutput=`"$OutDir\Profile`"","-abslog=`"$OutDir\profile.log`"")
$p = Start-Process -FilePath "$Engine\Engine\Binaries\Win64\UnrealEditor.exe" -ArgumentList $a -PassThru
$p.WaitForExit(1800000) | Out-Null
"exit=$($p.ExitCode)"
