[CmdletBinding()]
param(
  [switch]$IgnoreNightWindow
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) { throw "未找到虚拟环境。" }
Set-Location $projectRoot
$workerArgs = @("-m", "backend.familyhub.worker", "--once")
if ($IgnoreNightWindow) { $workerArgs += "--ignore-window" }
& $pythonPath @workerArgs
exit $LASTEXITCODE
