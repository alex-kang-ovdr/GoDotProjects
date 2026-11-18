#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$Info=[Diagnostics.FileVersionInfo]::GetVersionInfo($ExecutablePath)
[Console]::WriteLine(('{0}.{1}.{2}.{3}' -f $Info.FileMajorPart,$Info.FileMinorPart,$Info.FileBuildPart,$Info.FilePrivatePart))
