param(
  [string]$Branch = "PlayHub-Platform",
  [string]$CommitPrefix = "",
  [int]$PerPage = 4
)

$ErrorActionPreference = "Stop"
$runsUrl = "https://api.github.com/repos/alex-kang-ovdr/GoDotProjects/actions/runs?branch=$([uri]::EscapeDataString($Branch))&per_page=$PerPage"
$r = Invoke-RestMethod -Uri $runsUrl -TimeoutSec 15

foreach ($w in $r.workflow_runs) {
  $sha8 = if ($w.head_sha -and $w.head_sha.Length -ge 8) { $w.head_sha.Substring(0, 8) } else { $w.head_sha }
  if ($CommitPrefix -and -not ([string]$w.head_sha).StartsWith($CommitPrefix)) { continue }
  Write-Output "$($w.id) | $($w.name) | $($w.status) | $($w.conclusion) | $sha8 | $($w.created_at)"
  if ($w.status -eq "in_progress" -or $CommitPrefix) {
    $jobs = Invoke-RestMethod -Uri "https://api.github.com/repos/alex-kang-ovdr/GoDotProjects/actions/runs/$($w.id)/jobs" -TimeoutSec 15
    foreach ($j in $jobs.jobs) {
      if ($j.conclusion -eq "skipped") { continue }
      Write-Output "  Job $($j.name): $($j.status) / $($j.conclusion)"
      foreach ($s in $j.steps) {
        if ($s.status -ne "queued") {
          Write-Output "    Step $($s.number) [$($s.status)/$($s.conclusion)] $($s.name)"
        }
      }
    }
  }
}
