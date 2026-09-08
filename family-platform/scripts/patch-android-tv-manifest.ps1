[CmdletBinding()]
param(
  [string]$ManifestPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
if (-not $ManifestPath) {
  $ManifestPath = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\AndroidManifest.xml"
}
if (-not (Test-Path -LiteralPath $ManifestPath)) {
  throw "AndroidManifest.xml 不存在，请先运行 npm run android:init。"
}

$xml = Get-Content -LiteralPath $ManifestPath -Raw
if ($xml -notmatch 'android:name="android\.permission\.INTERNET"') {
  $xml = [regex]::Replace($xml, '(<manifest\b[^>]*>)', "`$1`r`n    <uses-permission android:name=`"android.permission.INTERNET`" />", 1)
}
if ($xml -notmatch 'android\.software\.leanback') {
  $features = "`r`n    <uses-feature android:name=`"android.software.leanback`" android:required=`"false`" />`r`n    <uses-feature android:name=`"android.hardware.touchscreen`" android:required=`"false`" />"
  $xml = [regex]::Replace($xml, '(<manifest\b[^>]*>)', "`$1$features", 1)
}
if ($xml -notmatch 'android:usesCleartextTraffic=') {
  $xml = [regex]::Replace($xml, '(<application\b)', '$1 android:usesCleartextTraffic="true" android:banner="@mipmap/ic_launcher"', 1)
}
if ($xml -notmatch 'android\.intent\.category\.LEANBACK_LAUNCHER') {
  $xml = [regex]::Replace($xml, '(<category\s+android:name="android\.intent\.category\.LAUNCHER"\s*/>)', "`$1`r`n                <category android:name=`"android.intent.category.LEANBACK_LAUNCHER`" />", 1)
}

Set-Content -LiteralPath $ManifestPath -Value $xml -Encoding utf8
Write-Host "已为 Android 手机和电视补充 INTERNET、局域网 HTTP 与 Leanback 启动入口：$ManifestPath"
