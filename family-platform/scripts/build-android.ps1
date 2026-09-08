[CmdletBinding()]
param(
  [ValidateSet("apk", "aab")]
  [string]$Format = "apk",
  [ValidateSet("debug", "release")]
  [string]$BuildType = "debug",
  [ValidateSet("arm64", "arm", "x86", "x86_64", "universal")]
  [string]$Abi = "arm64",
  [switch]$Init,
  [switch]$UseTauriCli
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$arguments = @("scripts\build-android.mjs", "-Format", $Format, "-BuildType", $BuildType, "-Abi", $Abi)
if ($Init) {
  $arguments += "-Init"
}
if ($UseTauriCli) {
  $arguments += "-UseTauriCli"
}

& node @arguments
exit $LASTEXITCODE
