[CmdletBinding()]
param(
  [string]$DataRoot = "D:\FamilyHub",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$venvPath = Join-Path $projectRoot ".venv"
$dataPath = [System.IO.Path]::GetFullPath($DataRoot)

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "未找到 Python。请安装 Python 3.11+ 并重新运行。"
}

$pythonVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$versionParts = $pythonVersion.Trim().Split('.')
if ([int]$versionParts[0] -lt 3 -or ([int]$versionParts[0] -eq 3 -and [int]$versionParts[1] -lt 11)) {
  throw "Python 版本需要 3.11 或更高，当前为 $pythonVersion。"
}

Write-Host "项目目录: $projectRoot"
Write-Host "家庭数据目录: $dataPath"
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
foreach ($subdir in @("data", "inbox\cloud", "quarantine", "manifests", "works", "library\video", "library\books", "library\audio", "library\images", "logs", "backups")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dataPath $subdir) | Out-Null
}

if (-not (Test-Path -LiteralPath (Join-Path $venvPath "Scripts\python.exe"))) {
  Write-Host "创建 Python 虚拟环境..."
  & python -m venv $venvPath
}

if (-not $SkipInstall) {
  Write-Host "安装后端依赖..."
  & (Join-Path $venvPath "Scripts\python.exe") -m pip install -r (Join-Path $projectRoot "backend\requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "后端依赖安装失败。" }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "未找到 Node.js/npm。请安装 Node.js 20+ 并重新运行。"
}
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) { throw "Node.js 版本需要 20 或更高。" }

$envPath = Join-Path $projectRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  $randomBytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $secretSuffix = [Convert]::ToBase64String($randomBytes).Replace('+', 'A').Replace('/', 'B').Replace('=', 'C')
  $childPassword = "child-$($secretSuffix.Substring(0, 14))"
  $guardianPassword = "guardian-$($secretSuffix.Substring(14, 14))"
  $operatorPassword = "operator-$($secretSuffix.Substring(2, 18))"
  $runtimeForEnv = $dataPath.Replace('\', '/')
  $envText = @(
    "FAMILYHUB_ENVIRONMENT=production",
    "FAMILYHUB_RUNTIME_ROOT=$runtimeForEnv",
    "FAMILYHUB_SEED_DEMO=true",
    "FAMILYHUB_DEMO_CHILD_PASSWORD=$childPassword",
    "FAMILYHUB_DEMO_GUARDIAN_PASSWORD=$guardianPassword",
    "FAMILYHUB_DEMO_OPERATOR_PASSWORD=$operatorPassword",
    "FAMILYHUB_DIRECT_DOWNLOAD_ENABLED=false",
    "FAMILYHUB_DEFENDER_SCAN=true",
    "FAMILYHUB_NIGHTLY_START_HOUR=1",
    "FAMILYHUB_NIGHTLY_END_HOUR=6",
    "FAMILYHUB_MIN_FREE_RATIO=0.20",
    "FAMILYHUB_CORS_ORIGINS=http://localhost:2521,http://127.0.0.1:2521"
  )
  Set-Content -LiteralPath $envPath -Value $envText -Encoding utf8NoBOM
  Write-Host "已生成 .env，并创建一次性演示账号密码："
  Write-Host "  child-demo    $childPassword"
  Write-Host "  guardian-demo $guardianPassword"
  Write-Host "  operator-demo $operatorPassword"
  Write-Host "请把这三行保存到密码管理器；脚本不会再次显示它们。"
} else {
  Write-Host ".env 已存在，保留现有凭据。"
}

if (-not $SkipInstall) {
  Set-Location $projectRoot
  Write-Host "安装前端依赖并构建生产页面..."
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "前端依赖安装失败。" }
  Copy-Item -LiteralPath (Join-Path $projectRoot "package.template.json") -Destination (Join-Path $projectRoot "package.json") -Force
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "前端构建失败。" }
}

Set-Location $projectRoot
Write-Host "执行数据库迁移..."
& (Join-Path $venvPath "Scripts\python.exe") -m alembic -c backend\alembic.ini upgrade head
if ($LASTEXITCODE -ne 0) { throw "数据库迁移失败。" }

Write-Host "PC 家庭主机准备完成。下一步运行 .\scripts\start-familyhub.ps1。"
