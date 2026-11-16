#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PlayHubJob {
 // Console.In.ReadLineAsync is synchronous in .NET Framework. Read on a
 // managed thread so the PowerShell loop can still observe a dead Rebex child.
 public static System.Threading.Tasks.Task<string> ReadCommandAsync(){
  return System.Threading.Tasks.Task.Run(() => Console.In.ReadLine());
 }
 [StructLayout(LayoutKind.Sequential)] public struct BasicLimits {
  public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit;
  public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize;
  public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
 }
 [StructLayout(LayoutKind.Sequential)] public struct IoCounters {public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
 [StructLayout(LayoutKind.Sequential)] public struct ExtendedLimits {public BasicLimits BasicLimitInformation;public IoCounters IoInfo;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attrs,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int infoClass,IntPtr information,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
 public static IntPtr CreateKillOnCloseJob(){
  IntPtr job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new InvalidOperationException("JOB_CREATE_FAILED");
  ExtendedLimits limits=new ExtendedLimits();limits.BasicLimitInformation.LimitFlags=0x2000;
  int size=Marshal.SizeOf(typeof(ExtendedLimits));IntPtr memory=Marshal.AllocHGlobal(size);
  try{Marshal.StructureToPtr(limits,memory,false);if(!SetInformationJobObject(job,9,memory,(uint)size)){CloseHandle(job);throw new InvalidOperationException("JOB_LIMIT_FAILED");}}
  finally{Marshal.FreeHGlobal(memory);}return job;
 }
}
'@
$Job=[IntPtr]::Zero;$Child=$null;$Failure=$false
try{
    $Job=[PlayHubJob]::CreateKillOnCloseJob()
    $Start=New-Object Diagnostics.ProcessStartInfo
    $Start.FileName=[IO.Path]::GetFullPath($ExecutablePath)
    $Start.WorkingDirectory=[IO.Path]::GetDirectoryName($Start.FileName)
    $Start.UseShellExecute=$false
    $Start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Minimized
    $Child=[Diagnostics.Process]::Start($Start)
    if($null -eq $Child -or -not [PlayHubJob]::AssignProcessToJobObject($Job,$Child.Handle)){
        if($null -ne $Child -and -not $Child.HasExited){$Child.Kill()}
        throw 'OWNED_PROCESS_JOB_FAILED'
    }
    [Console]::WriteLine((@{type='rebex-process';pid=$Child.Id}|ConvertTo-Json -Compress))
    $Read=[PlayHubJob]::ReadCommandAsync()
    while(-not $Read.IsCompleted){
        if($Child.HasExited){throw 'REBEX_EXITED'}
        Start-Sleep -Milliseconds 200
    }
    # A stop line or pipe EOF closes the job and only the child owned by this guard.
}catch{
    $Failure=$true
    [Console]::Error.WriteLine('REBEX_GUARD_FAILED')
}finally{
    if($Job -ne [IntPtr]::Zero){[void][PlayHubJob]::CloseHandle($Job)}
    if($null -ne $Child){try{[void]$Child.WaitForExit(4000)}catch{};$Child.Dispose()}
}
if($Failure){exit 1}
exit 0
