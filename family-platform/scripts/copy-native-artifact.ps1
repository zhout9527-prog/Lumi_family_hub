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

function Assert-ZipSignature([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $signature = New-Object byte[] 4
    if ($stream.Read($signature, 0, 4) -ne 4 -or
        $signature[0] -ne 0x50 -or $signature[1] -ne 0x4B -or
        $signature[2] -notin @(0x03, 0x05, 0x07) -or $signature[3] -notin @(0x04, 0x06, 0x08)) {
      throw "Native artifact is not a valid ZIP container: $Path"
    }
  }
  finally {
    $stream.Dispose()
  }
}

Assert-ZipSignature $sourcePath
New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
if (Test-Path -LiteralPath $destinationPath) {
  Remove-Item -LiteralPath $destinationPath -Force
}
Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
Assert-ZipSignature $destinationPath

$hash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash
Write-Output "$destinationPath SHA256=$hash"
