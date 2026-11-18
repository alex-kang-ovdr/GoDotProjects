#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstanceRoot)

# Protect and observe only the instance root. Existing child ACLs are not audited here.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

try {
    $Full=[IO.Path]::GetFullPath($InstanceRoot)
    if(-not [IO.Path]::IsPathRooted($Full) -or $Full.StartsWith('\\')){throw 'INSTANCE_PATH_INVALID'}
    $Directory=Get-Item -LiteralPath $Full -Force
    if(-not ($Directory -is [IO.DirectoryInfo]) -or $null -eq $Directory.Parent){throw 'INSTANCE_DIRECTORY_REQUIRED'}
    $Cursor=$Directory
    while($null -ne $Cursor){
        if(($Cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'INSTANCE_LINK_REJECTED'}
        $Cursor=$Cursor.Parent
    }

    $Current=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if($null -eq $Current){throw 'CURRENT_USER_SID_UNAVAILABLE'}
    $Allowed=@(@($Current.Value,'S-1-5-18','S-1-5-32-544') | Select-Object -Unique)
    $Inheritance=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    $FullControl=[Security.AccessControl.FileSystemRights]::FullControl
    $None=[Security.AccessControl.PropagationFlags]::None
    $Allow=[Security.AccessControl.AccessControlType]::Allow

    $Acl=$Directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
    # Discard inherited entries, then remove every explicit allow/deny entry.
    # /grant:r alone would leave unrelated explicit principals behind.
    $Acl.SetAccessRuleProtection($true,$false)
    foreach($Rule in @($Acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){
        $Acl.RemoveAccessRuleSpecific($Rule)
    }
    foreach($SidText in $Allowed){
        $Sid=[Security.Principal.SecurityIdentifier]::new($SidText)
        $Rule=[Security.AccessControl.FileSystemAccessRule]::new($Sid,$FullControl,$Inheritance,$None,$Allow)
        $Acl.AddAccessRule($Rule)
    }
    # Persist only changed access rules; Set-Acl can request SACL privileges.
    $Directory.SetAccessControl($Acl)

    # Read the actual descriptor back; a successful write alone is not proof.
    $Observed=$Directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
    if(-not $Observed.AreAccessRulesProtected){throw 'INSTANCE_INHERITANCE_NOT_PROTECTED'}
    $Rules=@($Observed.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if($Rules.Count -ne $Allowed.Count){throw 'INSTANCE_UNEXPECTED_ACE_COUNT'}
    $Seen=@{}
    foreach($Rule in $Rules){
        $Identity=$Rule.IdentityReference.Value
        if($Allowed -notcontains $Identity -or $Rule.IsInherited -or $Rule.AccessControlType -ne $Allow){throw 'INSTANCE_UNEXPECTED_ACE'}
        if($Rule.FileSystemRights -ne $FullControl -or $Rule.InheritanceFlags -ne $Inheritance -or $Rule.PropagationFlags -ne $None){throw 'INSTANCE_ACE_RIGHTS_MISMATCH'}
        if($Seen.ContainsKey($Identity)){throw 'INSTANCE_DUPLICATE_ACE'}
        $Seen[$Identity]=$true
    }
    foreach($Identity in $Allowed){if(-not $Seen.ContainsKey($Identity)){throw 'INSTANCE_REQUIRED_ACE_MISSING'}}

    [Console]::WriteLine((@{
        method='windows-dacl';scope='instance-root';verified=$true
        inheritanceProtected=$true;childAclVerified=$false
        allowedPrincipals=@('current-user','SYSTEM','Administrators')
    } | ConvertTo-Json -Compress -Depth 4))
    exit 0
} catch {
    # Do not include paths, raw ACLs or exception text in the process result.
    [Console]::WriteLine((@{
        method='windows-dacl';scope='instance-root';verified=$false
        childAclVerified=$false;error=@{code='INSTANCE_ACL_PROTECTION_FAILED'}
    } | ConvertTo-Json -Compress -Depth 4))
    exit 1
}
