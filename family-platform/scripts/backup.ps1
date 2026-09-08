[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [string]$DataRoot = "D:\FamilyHub",
  [switch]$IncludeLibrary
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) { throw "未找到虚拟环境。" }
$sourceRoot = [System.IO.Path]::GetFullPath($DataRoot)
$destinationRoot = [System.IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $sourceRoot)) { throw "数据目录不存在: $sourceRoot" }
New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null

Set-Location $projectRoot
$env:FAMILYHUB_RUNTIME_ROOT = $sourceRoot
$backupArgs = @("-m", "backend.familyhub.backup", $destinationRoot)
if ($IncludeLibrary) { $backupArgs += "--include-library" }
& $pythonPath @backupArgs
if ($LASTEXITCODE -ne 0) { throw "备份失败。" }
