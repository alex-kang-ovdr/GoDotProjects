param(
  [string]$RepoPath = "d:\Github\GoDotProjects-worktrees\PlayHub-Platform",
  [string]$SshHostAlias = "github.com-havok",
  [string]$RepoOwner = "alex-kang-ovdr",
  [string]$RepoName = "GoDotProjects",
  [string]$SubmoduleName = "godot-engine"
)

$ErrorActionPreference = "Stop"

$originUrl = "git@${SshHostAlias}:${RepoOwner}/${RepoName}.git"
$submoduleUrl = "git@${SshHostAlias}:${RepoOwner}/${SubmoduleName}.git"
$sshCmd = "C:/Windows/System32/OpenSSH/ssh.exe -o BatchMode=yes"
$rewriteTarget = "git@${SshHostAlias}:${RepoOwner}/"

git -C $RepoPath config remote.origin.url $originUrl
git -C $RepoPath config submodule.godot.url $submoduleUrl
git -C $RepoPath config core.sshCommand $sshCmd
git -C $RepoPath config --unset-all "url.${rewriteTarget}.insteadOf" 2>$null
git -C $RepoPath config --add "url.${rewriteTarget}.insteadOf" "https://github.com/${RepoOwner}/"
git -C $RepoPath config --add "url.${rewriteTarget}.insteadOf" "git@github.com:${RepoOwner}/"

Write-Output "=== Configured Git SSH & Remote Settings ==="
git -C $RepoPath config --get-regexp "remote\.origin\.url|submodule\.godot\.url|core\.sshcommand|url\..*\.insteadof"
