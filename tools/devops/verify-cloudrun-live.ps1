param(
  [string]$BaseUrl = "https://playhub-hub-88778617121.us-west1.run.app"
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")
$jar = Join-Path $env:TEMP "playhub-verify-cookies.txt"
Remove-Item $jar -Force -ErrorAction SilentlyContinue

try {
  $ver = (curl.exe -s "$base/api/version") | ConvertFrom-Json
  $sess = (curl.exe -s -c $jar -b $jar "$base/api/session") | ConvertFrom-Json
  $billCat = (curl.exe -s -b $jar "$base/api/billing/catalog?currency=KRW&channel=web_browser") | ConvertFrom-Json
  $billWal = (curl.exe -s -b $jar "$base/api/billing/wallet") | ConvertFrom-Json
  $storeSess = (curl.exe -s -b $jar "$base/api/store/session") | ConvertFrom-Json
  $forgeHtml = curl.exe -s -b $jar "$base/forge/OfficialGodot/"
  $forgeSess = (curl.exe -s -b $jar "$base/forge/api/session") | ConvertFrom-Json

  [PSCustomObject]@{
    baseUrl = $base
    buildId = $ver.buildInfo.buildId
    buildCode = $ver.buildInfo.buildCode
    sessionIdPresent = [bool]$sess.sessionId
    googleEnabled = $sess.googleEnabled
    naverEnabled = $sess.naverEnabled
    emailEnabled = $sess.emailEnabled
    billingCatalogMode = $billCat.billingMode
    billingWalletMode = $billWal.billingMode
    storeAuthMode = $storeSess.account.auth_mode
    forgeHasLoginGate = ([string]$forgeHtml).Contains("PlayHub 로그인이 필요합니다")
    forgeAuthenticated = $forgeSess.authenticated
    forgeDisplayName = $forgeSess.displayName
  } | Format-List
} finally {
  Remove-Item $jar -Force -ErrorAction SilentlyContinue
}
