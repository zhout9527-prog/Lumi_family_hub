[CmdletBinding()]
param(
  [int]$Port = 8000,
  [int]$WebPort = 4173,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "未找到虚拟环境，请先运行 .\scripts\prepare-pc.ps1。"
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\index.html"))) {
  throw "未找到前端构建产物，请先运行 .\scripts\prepare-pc.ps1 或 npm run build。"
}

function Test-PortAvailable([int]$Candidate) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Candidate)
  try {
    $listener.Start()
    return $true
  } catch [System.Net.Sockets.SocketException] {
    return $false
  } finally {
    $listener.Stop()
  }
}

function Find-AvailablePort([int]$StartPort) {
  for ($candidate = $StartPort; $candidate -lt ($StartPort + 30); $candidate++) {
    if (Test-PortAvailable $candidate) { return $candidate }
  }
  throw "从端口 $StartPort 开始的 30 个端口均不可用。"
}

Set-Location $projectRoot
$env:FAMILYHUB_API_PORT = "$Port"
$env:FAMILYHUB_API_HOST = "0.0.0.0"
$env:FAMILYHUB_PROXY_TARGET = "http://127.0.0.1:$Port"
$logRoot = Join-Path $projectRoot "runtime\logs"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

if ($Foreground) {
  & $pythonPath -m uvicorn backend.familyhub.main:app --host 0.0.0.0 --port $Port
  exit $LASTEXITCODE
}

if (-not (Test-PortAvailable $Port)) {
  throw "API 端口 $Port 已被占用。请先运行 .\scripts\stop-familyhub.ps1，或使用 -Port 指定其他端口。"
}
$actualWebPort = Find-AvailablePort $WebPort

$apiLog = Join-Path $logRoot "api.log"
$apiErr = Join-Path $logRoot "api.err.log"
$workerLog = Join-Path $logRoot "worker.log"
$workerErr = Join-Path $logRoot "worker.err.log"
$webLog = Join-Path $logRoot "web.log"
$webErr = Join-Path $logRoot "web.err.log"
$apiProcess = Start-Process -FilePath $pythonPath -ArgumentList @("-m", "uvicorn", "backend.familyhub.main:app", "--host", "0.0.0.0", "--port", "$Port") -WorkingDirectory $projectRoot -RedirectStandardOutput $apiLog -RedirectStandardError $apiErr -WindowStyle Hidden -PassThru
$workerProcess = Start-Process -FilePath $pythonPath -ArgumentList @("-m", "backend.familyhub.worker") -WorkingDirectory $projectRoot -RedirectStandardOutput $workerLog -RedirectStandardError $workerErr -WindowStyle Hidden -PassThru
$webProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--host", "0.0.0.0", "--port", "$actualWebPort", "--strictPort") -WorkingDirectory $projectRoot -RedirectStandardOutput $webLog -RedirectStandardError $webErr -WindowStyle Hidden -PassThru

function Get-ProcessStartedAt([int]$ProcessId) {
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  $process.Refresh()
  return $process.StartTime.ToUniversalTime().ToString("o")
}

$apiStartedAt = Get-ProcessStartedAt $apiProcess.Id
$workerStartedAt = Get-ProcessStartedAt $workerProcess.Id
$webStartedAt = Get-ProcessStartedAt $webProcess.Id

$apiReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/health" -TimeoutSec 1
    $apiReady = $true
    break
  } catch {
    # The API may still be loading the database and seed data.
  }
}
if (-not $apiReady) {
  Stop-Process -Id $apiProcess.Id, $workerProcess.Id, $webProcess.Id -Force -ErrorAction SilentlyContinue
  throw "家庭主机没有在预期时间内通过健康检查。请查看 $logRoot。"
}

$processFile = Join-Path $logRoot "familyhub-processes.json"
[ordered]@{
  api = $apiProcess.Id
  worker = $workerProcess.Id
  web = $webProcess.Id
  api_process_name = (Get-Process -Id $apiProcess.Id).ProcessName
  worker_process_name = (Get-Process -Id $workerProcess.Id).ProcessName
  web_process_name = (Get-Process -Id $webProcess.Id).ProcessName
  api_started_at = $apiStartedAt
  worker_started_at = $workerStartedAt
  web_started_at = $webStartedAt
  api_port = $Port
  web_port = $actualWebPort
  started_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8NoBOM

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host "家庭主机已启动。"
  Write-Host "  API PID: $($apiProcess.Id)"
  Write-Host "  Worker PID: $($workerProcess.Id)"
  Write-Host "  Web PID: $($webProcess.Id)"
  Write-Host "  本机地址: http://localhost:$actualWebPort"
  if ($lanAddress) { Write-Host "  局域网地址: http://${lanAddress}:$actualWebPort" }
  else { Write-Host "  局域网地址: 请通过 ipconfig 查看本机 IPv4 地址后加 :$actualWebPort" }
Write-Host "日志目录: $logRoot"
