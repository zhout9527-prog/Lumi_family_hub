[CmdletBinding()]
param(
  [int]$Port = 2521,
  [string]$DataRoot = "D:\FamilyHub"
)

$ErrorActionPreference = "Stop"
$healthUri = "http://127.0.0.1:$Port/api/v1/health"
try {
  $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 5
  Write-Host "API: $($health.status) / database: $($health.database)"
} catch {
  Write-Warning "API 未响应: $($_.Exception.Message)"
}

$resolvedDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
if (Test-Path -LiteralPath $resolvedDataRoot) {
  $drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($resolvedDataRoot).TrimEnd('\').TrimEnd(':'))
  $freeRatio = if ($drive.Used + $drive.Free -gt 0) { $drive.Free / ($drive.Used + $drive.Free) } else { 0 }
  Write-Host ("磁盘: {0:P1} 可用 ({1:N1} GB)" -f $freeRatio, ($drive.Free / 1GB))
  if ($freeRatio -lt 0.20) { Write-Warning "低于默认 20% 安全阈值，Worker 会自动暂停。" }
} else {
  Write-Warning "数据目录不存在: $resolvedDataRoot"
}
