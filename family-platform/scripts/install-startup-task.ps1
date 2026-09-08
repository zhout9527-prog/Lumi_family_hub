[CmdletBinding()]
param(
  [string]$TaskName = "Lumi Family Hub"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$startScript = Join-Path $projectRoot "scripts\start-familyhub.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "登录 Windows 后启动 Lumi 家庭主机 API 与 Worker" -Force | Out-Null
Write-Host "已注册登录启动任务: $TaskName"
Write-Host "如需删除：Unregister-ScheduledTask -TaskName '$TaskName'"
