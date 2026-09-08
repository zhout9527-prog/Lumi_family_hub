[CmdletBinding()]
param(
  [switch]$Media
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
Set-Location $projectRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "未找到 Docker Desktop。" }
if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  throw "已创建 .env 模板，请先替换所有 CHANGE_ME 值，再重新运行。"
}
$composeArgs = @("compose")
if ($Media) { $composeArgs += @("--profile", "media") }
$composeArgs += @("up", "-d", "--build")
& docker @composeArgs
if ($LASTEXITCODE -ne 0) { throw "Docker Compose 启动失败。" }
Write-Host "家庭平台容器已启动: http://localhost:8000"
