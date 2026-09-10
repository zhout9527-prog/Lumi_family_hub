[CmdletBinding()]
param(
  [ValidateSet("Client", "Server", "All")]
  [string]$Edition = "Client",
  [string]$TauriConfig,
  [switch]$SignUpdater
)

$ErrorActionPreference = "Stop"

if ($Edition -eq "All") {
  if ($TauriConfig) { throw "-TauriConfig cannot be combined with -Edition All." }
  & $PSCommandPath -Edition Client -SignUpdater:$SignUpdater
  if ($LASTEXITCODE -ne 0) { throw "Lumi Client build failed." }
  & $PSCommandPath -Edition Server -SignUpdater:$SignUpdater
  if ($LASTEXITCODE -ne 0) { throw "Lumi Server build failed." }
  return
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
Set-Location $projectRoot
Set-Variable -Scope Script -Name LumiArtifactOutputRoot -Value ([string](Join-Path $projectRoot "artifacts\windows")) -Option Constant
$tauriRoot = Join-Path $projectRoot "src-tauri"
$defaultTauriConfigPath = Join-Path $tauriRoot ($(if ($Edition -eq "Server") { "tauri.server.conf.json" } else { "tauri.conf.json" }))
$windowsTemplate = Join-Path $projectRoot "native\windows\installer.nsi"
$artifactRoot = Join-Path $projectRoot "artifacts\windows"
$isServer = $Edition -eq "Server"
$productName = if ($isServer) { "Lumi Server" } else { "Lumi Client" }
$productId = if ($isServer) { "cn.lumi.familyhub.server" } else { "cn.lumi.familyhub" }
$productSlug = if ($isServer) { "Lumi-Server" } else { "Lumi-Client" }
$binaryName = if ($isServer) { "lumi-server.exe" } else { "lumi-client.exe" }
$installSubdir = if ($isServer) { "LumiServer" } else { "LumiClient" }

function Remove-OldWindowsArtifacts([string]$KeepVersion, [string]$CurrentProductSlug) {
  if (-not (Test-Path -LiteralPath $artifactRoot)) { return }
  $escapedVersion = [regex]::Escape($KeepVersion)
  $escapedProduct = [regex]::Escape($CurrentProductSlug)
  Get-ChildItem -LiteralPath $artifactRoot -Force |
    Where-Object {
      $_.Name -match '^(?i)(Lumi-Family-Hub|lumi-family-hub)[_-]\d+\.\d+\.\d+_' -or
      ($_.Name -match "^(?i)${escapedProduct}[_-]\d+\.\d+\.\d+_" -and $_.Name -notmatch "[_-]${escapedVersion}_")
    } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
      Write-Host "Removed old Windows artifact: $($_.Name)"
    }
}

function Invoke-CheckedExternalCommand {
  param(
    [string]$Description,
    [scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Copy-DirectoryTree([string]$Source, [string]$Destination) {
  if ([string]::IsNullOrWhiteSpace($Source) -or -not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Core source directory is missing: $Source"
  }
  if ([string]::IsNullOrWhiteSpace($Destination)) {
    throw "Core destination directory is empty."
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  # Robocopy 对 PyInstaller 的大型 onedir 文件树比 Copy-Item 更稳定。
  & robocopy.exe $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  $robocopyExitCode = $LASTEXITCODE
  if ($robocopyExitCode -ge 8) {
    throw "Core directory copy failed with Robocopy exit code $robocopyExitCode."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $Destination "lumi-server-core.exe") -PathType Leaf)) {
    throw "Core directory copy did not produce lumi-server-core.exe: $Destination"
  }
}

function Get-Sha256([string]$Path) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '')
  } finally {
    $stream.Dispose()
    $algorithm.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $windowsTemplate)) {
  throw "Windows installer template is missing: $windowsTemplate"
}

$tauriConfigPath = if ($TauriConfig) {
  (Resolve-Path -LiteralPath $TauriConfig).Path
} else {
  $defaultTauriConfigPath
}
$config = [System.IO.File]::ReadAllText($tauriConfigPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$version = [string]$config.version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Windows installer requires an x.y.z version in $tauriConfigPath."
}

$tauriArguments = @("scripts\run-tauri.mjs", "build", "--no-bundle", "--no-sign")
if ($isServer -or $TauriConfig) {
  $tauriArguments += @("--config", $tauriConfigPath)
}
Invoke-CheckedExternalCommand "Tauri $productName executable build" { node @tauriArguments }

$appBinary = Join-Path $tauriRoot "target\release\lumi-family-hub.exe"
if (-not (Test-Path -LiteralPath $appBinary)) {
  throw "Windows executable was not produced: $appBinary"
}
$makensisCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"),
  (Join-Path $env:ProgramFiles "NSIS\makensis.exe")
)
$makensis = $makensisCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $makensis) {
  throw "NSIS 3 is required. Install it with: winget install --id NSIS.NSIS --exact"
}

$webViewCandidates = @(
  (Join-Path $env:LOCALAPPDATA "tauri\MicrosoftEdgeWebview2Setup.exe"),
  (Join-Path $env:LOCALAPPDATA "tauri\MicrosoftEdgeWebview2Setup.exe.IPGSD")
)
$webViewBootstrapper = $webViewCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $webViewBootstrapper) {
  throw "Microsoft Edge WebView2 bootstrapper is missing from the Tauri cache."
}

$stageParent = [System.IO.Path]::GetTempPath()
$stageRoot = Join-Path $stageParent ("lumi-windows-" + [guid]::NewGuid().ToString("N"))
$stageOutput = Join-Path $stageRoot "${productSlug}_${version}_x64-setup.exe"
$artifactInstaller = Join-Path $artifactRoot "${productSlug}_${version}_x64-setup.exe"
$artifactBinary = Join-Path $artifactRoot "$($binaryName.Substring(0, $binaryName.Length - 4))_${version}_x64.exe"
$serverCore = $null
$serverCoreBundleDir = $null

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

try {
  if ($isServer) {
    $pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $pythonPath)) { throw "Python virtual environment is missing." }
    Invoke-CheckedExternalCommand "PyInstaller availability check" { & $pythonPath -c "import PyInstaller" }
    $backendSource = Join-Path $stageRoot "backend-source"
    $backendPackage = Join-Path $backendSource "familyhub"
    New-Item -ItemType Directory -Path $backendPackage -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot "backend\server_entry.py") -Destination $backendSource -Force
    Get-ChildItem -LiteralPath (Join-Path $projectRoot "backend\familyhub") -Filter "*.py" -File |
      Copy-Item -Destination $backendPackage -Force
    $pyinstallerRoot = Join-Path $stageRoot "pyinstaller"
    $pyinstallerDist = Join-Path $pyinstallerRoot "dist"
    $pyinstallerWork = Join-Path $pyinstallerRoot "work"
    $pyinstallerSpec = Join-Path $pyinstallerRoot "spec"
    New-Item -ItemType Directory -Path $pyinstallerDist, $pyinstallerWork, $pyinstallerSpec -Force | Out-Null
    Invoke-CheckedExternalCommand "Lumi Server core build" {
      & $pythonPath -m PyInstaller `
        --noconfirm `
        --noupx `
        --onedir `
        --name lumi-server-core `
        --paths $backendSource `
        --distpath $pyinstallerDist `
        --workpath $pyinstallerWork `
        --specpath $pyinstallerSpec `
        --hidden-import uvicorn.logging `
        --hidden-import uvicorn.loops.auto `
        --hidden-import uvicorn.protocols.http.auto `
        --hidden-import uvicorn.protocols.websockets.auto `
        --hidden-import uvicorn.lifespan.on `
        --collect-all yt_dlp `
        --collect-all imageio_ffmpeg `
        (Join-Path $backendSource "server_entry.py")
    }
    $serverCoreBundleDir = Join-Path $pyinstallerDist "lumi-server-core"
    $serverCore = Join-Path $serverCoreBundleDir "lumi-server-core.exe"
    if (-not (Test-Path -LiteralPath $serverCore)) { throw "Lumi Server core executable was not produced." }
    if (-not $serverCoreBundleDir) { throw "Lumi Server core directory path was not set." }
  }

  if ($isServer) {
    # 先于 NSIS 调用准备便携文件树。NSIS 会改变当前 PowerShell 进程的
    # 部分上下文，因此 Core 目录复制必须在外部安装器运行前完成。
    $artifactOutputRoot = $script:LumiArtifactOutputRoot
    if ([string]::IsNullOrWhiteSpace($artifactOutputRoot)) { throw "Windows artifact directory is unavailable." }
    $rootCoreTarget = "$artifactOutputRoot\lumi-server-core"
    if (Test-Path -LiteralPath $rootCoreTarget) {
      Remove-Item -LiteralPath $rootCoreTarget -Recurse -Force
    }
    $legacyCoreTarget = "$artifactOutputRoot\lumi-server-core.exe"
    if (Test-Path -LiteralPath $legacyCoreTarget) {
      Remove-Item -LiteralPath $legacyCoreTarget -Force
    }
    Copy-DirectoryTree $serverCoreBundleDir $rootCoreTarget
    $portableTarget = "$artifactOutputRoot\${productSlug}_${version}_x64-portable"
    if (Test-Path -LiteralPath $portableTarget) {
      Remove-Item -LiteralPath $portableTarget -Recurse -Force
    }
    New-Item -ItemType Directory -Path $portableTarget -Force | Out-Null
    Copy-Item -LiteralPath $appBinary -Destination "$portableTarget\$binaryName" -Force
    Copy-DirectoryTree $serverCoreBundleDir "$portableTarget\lumi-server-core"
  }

  $nsisArguments = @(
    "/DAPP_BINARY=$appBinary",
    "/DWEBVIEW2_BOOTSTRAPPER=$webViewBootstrapper",
    "/DOUTPUT_FILE=$stageOutput",
    "/DAPP_VERSION=$version",
    "/DPRODUCT_NAME=$productName",
    "/DPRODUCT_ID=$productId",
    "/DMAIN_BINARY=$binaryName",
    "/DINSTALL_SUBDIR=$installSubdir"
  )
  if ($isServer) {
    if (-not $serverCoreBundleDir) { throw "Lumi Server core directory path was lost before packaging." }
    $nsisArguments += @(
      "/DSERVER_CORE_DIR=$serverCoreBundleDir",
      "/DSERVER_CORE_BINARY=lumi-server-core.exe"
    )
  }
  $nsisArguments += $windowsTemplate
  Invoke-CheckedExternalCommand "$productName NSIS setup build" { & $makensis @nsisArguments }

  Copy-Item -LiteralPath $stageOutput -Destination $artifactInstaller -Force
  Copy-Item -LiteralPath $appBinary -Destination $artifactBinary -Force
} finally {
  if ((Test-Path -LiteralPath $stageRoot) -and $stageRoot.StartsWith($stageParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}

foreach ($artifact in @($artifactInstaller, $artifactBinary)) {
  $bytes = [System.IO.File]::ReadAllBytes($artifact)
  if ($bytes.Length -lt 2 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
    throw "Windows artifact is not a valid PE executable: $artifact"
  }
  $hash = Get-Sha256 $artifact
  Write-Host "$artifact SHA256=$hash"
}

Remove-OldWindowsArtifacts $version $productSlug

if ($SignUpdater) {
  if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
    throw "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for updater signing."
  }
  Invoke-CheckedExternalCommand "Tauri updater artifact signing" {
    node scripts\run-tauri.mjs signer sign $artifactInstaller
  }
}

Write-Host "$productName artifacts are under artifacts\windows."
