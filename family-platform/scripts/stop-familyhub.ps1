[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$processFile = Join-Path $projectRoot "runtime\logs\familyhub-processes.json"
if (-not (Test-Path -LiteralPath $processFile)) {
  Write-Host "没有找到由启动脚本创建的进程清单。若服务在前台运行，请在对应终端按 Ctrl+C 停止。"
  exit 0
}

$record = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
$stopped = 0
foreach ($name in @("api", "worker", "web")) {
  $processId = [int]$record.PSObject.Properties[$name].Value
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { continue }

  $expectedNameProperty = $record.PSObject.Properties["${name}_process_name"]
  if ($expectedNameProperty -and $expectedNameProperty.Value -and $process.ProcessName -ne $expectedNameProperty.Value) {
    Write-Warning "$name 的 PID $processId 当前是 $($process.ProcessName)，与清单中的 $($expectedNameProperty.Value) 不一致，已跳过。"
    continue
  }

  $expectedStartProperty = $record.PSObject.Properties["${name}_started_at"]
  if ($expectedStartProperty -and $expectedStartProperty.Value) {
    try {
      $actualStart = $process.StartTime.ToUniversalTime()
      $expectedStart = [DateTime]::Parse($expectedStartProperty.Value).ToUniversalTime()
      if ($actualStart -ne $expectedStart) {
        Write-Warning "$name 的 PID $processId 启动时间不一致，已跳过以避免误停其他进程。"
        continue
      }
    } catch {
      Write-Warning "无法校验 $name 的 PID $processId，已跳过。"
      continue
    }
  }

  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  Write-Host "已停止 $name (PID $processId)"
  $stopped++
}
Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
if ($stopped -eq 0) { Write-Host "进程清单中的服务均未运行。" }
