#Requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$Dialog=New-Object System.Windows.Forms.OpenFileDialog
$Dialog.Title='Select your installed RebexTinyWebServer.exe'
$Dialog.Filter='Rebex Tiny Web Server|RebexTinyWebServer.exe'
$Dialog.CheckFileExists=$true
$Dialog.Multiselect=$false
try{
    if($Dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){exit 3}
    [Console]::WriteLine($Dialog.FileName)
}finally{$Dialog.Dispose()}
