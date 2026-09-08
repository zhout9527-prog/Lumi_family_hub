[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$destinationPath = [IO.Path]::GetFullPath($Destination)

if (Test-Path -LiteralPath $destinationPath) {
  throw "Android staging destination already exists: $destinationPath"
}

$parent = Split-Path -Parent $destinationPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse

$required = @(
  "build.gradle.kts",
  "settings.gradle",
  "app\build.gradle.kts",
  "app\src\main\AndroidManifest.xml"
)
foreach ($relativePath in $required) {
  $path = Join-Path $destinationPath $relativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Android staging template is incomplete: $path"
  }
}
