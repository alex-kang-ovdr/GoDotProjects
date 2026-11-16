#Requires -Version 5.1
#Requires -RunAsAdministrator
param([string]$InstallRoot='C:\PlayHubPoC')
$ErrorActionPreference='Stop'
$Marker=Get-Content (Join-Path $InstallRoot 'installation.json') -Encoding UTF8 -Raw|ConvertFrom-Json
if($Marker.product -ne 'playhub-iis-poc'){throw 'Invalid installation marker.'}
$BackupDirectory=Join-Path $InstallRoot 'backups'
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null

# Establish an exact protected DACL before the snapshot is created. A fresh
# DirectorySecurity object also removes pre-existing explicit ordinary-user grants.
$BackupAcl=New-Object System.Security.AccessControl.DirectorySecurity
$BackupAcl.SetAccessRuleProtection($true,$false)
foreach($SidText in @('S-1-5-32-544','S-1-5-18')){
    $Identity=New-Object System.Security.Principal.SecurityIdentifier($SidText)
    $Rule=New-Object System.Security.AccessControl.FileSystemAccessRule(
        $Identity,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $BackupAcl.AddAccessRule($Rule)
}
Set-Acl -LiteralPath $BackupDirectory -AclObject $BackupAcl
& icacls.exe $BackupDirectory /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect the backup directory. No snapshot was created.'}
# Existing snapshots must inherit the same restricted parent DACL as new ones.
if(@(Get-ChildItem -LiteralPath $BackupDirectory -Force).Count -gt 0){
    & icacls.exe (Join-Path $BackupDirectory '*') /reset /T /C | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Unable to protect existing backup files. No new snapshot was created.'}
}
$AllowedSids=@('S-1-5-32-544','S-1-5-18')
$EffectiveAcl=Get-Acl -LiteralPath $BackupDirectory
if(-not $EffectiveAcl.AreAccessRulesProtected){throw 'Backup directory ACL still inherits permissions. No snapshot was created.'}
foreach($Rule in $EffectiveAcl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){
    if($Rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $Rule.IdentityReference.Value -notin $AllowedSids){throw 'Unexpected access grant remains on the backup directory. No snapshot was created.'}
}
$Destination=Join-Path $BackupDirectory ('platform-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)+'.sqlite')
& $Marker.nodePath (Join-Path $Marker.releaseDir 'tools\backup.mjs') --config $Marker.configPath --out $Destination
if($LASTEXITCODE -ne 0){throw 'Database backup failed.'}
Write-Host 'A consistent SQLite snapshot and SHA-256 record were created. Keep backups outside the public web roots.'
