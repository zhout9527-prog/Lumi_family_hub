[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
Set-Location $projectRoot

function Check-Command([string]$Name, [string]$InstallHint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    Write-Host "[ok] $Name -> $($command.Source)"
    return $true
  }
  Write-Host "[missing] $Name — $InstallHint"
  return $false
}

$rust = Check-Command "rustup" "安装 Rustup，并选择 stable-msvc 工具链"
$cargo = Check-Command "cargo" "Rustup 会提供 cargo"
$java = Check-Command "java" "安装 Android Studio 自带的 JDK 17"
$adb = Check-Command "adb" "在 Android SDK Manager 安装 Platform-Tools"

$androidSdk = $env:ANDROID_HOME
if (-not $androidSdk) { $androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (Test-Path -LiteralPath $androidSdk) { Write-Host "[ok] Android SDK -> $androidSdk" } else { Write-Host "[missing] Android SDK -> $androidSdk" }

Write-Host ""
Write-Host "Web build:" -NoNewline
npm run build

if ($rust -and $cargo) {
  Write-Host "Native CLI info:"
  node -e "require('@tauri-apps/cli').run(['info']).catch(() => process.exit(1))"
} else {
  Write-Host "Native CLI info skipped until Rust is installed."
}

Write-Host ""
Write-Host "Build targets after prerequisites:"
Write-Host "  Windows installer: npm run native:build"
Write-Host "  Android project:   npm run android:init"
Write-Host "  Android APK:       npm run android:apk"
Write-Host "  Android AAB:       npm run android:aab"
