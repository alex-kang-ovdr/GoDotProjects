# Sequential, non-overlapping measurement runs (do not run anything else on the machine meanwhile).
param([string]$Tag = 'r2')
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Godot = 'D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe'
& "$Root\run_unreal_baseline.ps1" -SkipBuild -RunId "ue-$Tag"
foreach ($drv in 'vulkan','d3d12') {
  $out = "$Root\results\godot\gd-$Tag-$drv"
  New-Item -ItemType Directory -Force $out | Out-Null
  & $Godot --path "$Root\godot" --rendering-method forward_plus --rendering-driver $drv -- --sizes=48,96,144 --modes=ISM,Actor --repeats=2 --warmup=3 --seconds=5 --seed=1337 --shots --tag=$drv "--out=$out" *> "$out\console.log"
}
