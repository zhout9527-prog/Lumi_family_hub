[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Write-Host "This script prints the recommended toolchain. Installation still requires explicit user confirmation in the installers."
Write-Host ""
Write-Host "1. Rust: install rustup with the stable-msvc toolchain."
Write-Host "2. Windows: install Visual Studio Build Tools with Desktop development with C++."
Write-Host "3. Windows: ensure Microsoft Edge WebView2 Runtime is installed."
Write-Host "4. Android/TV: install Android Studio, SDK Platform 35, Build Tools, Platform-Tools, NDK side-by-side, and JDK 17."
Write-Host "5. Set ANDROID_HOME to %LOCALAPPDATA%\Android\Sdk and NDK_HOME to its installed NDK directory."
Write-Host ""
Write-Host "After installation run .\scripts\native-check.ps1."
