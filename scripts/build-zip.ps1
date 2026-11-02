$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$package = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$source = Join-Path $root 'release\win-unpacked'
$stage = Join-Path $root 'release\Bsky-Spider'
$zip = Join-Path $root "release\Bsky-Spider-$version-win-x64.zip"

if (-not (Test-Path (Join-Path $source 'Bsky-Spider.exe'))) {
  throw 'release\win-unpacked\Bsky-Spider.exe 不存在，请先运行 npm run build:exe:dir'
}

if (Test-Path $stage) {
  Remove-Item -Recurse -Force $stage
}
Copy-Item -Recurse -Force $source $stage

if (Test-Path $zip) {
  Remove-Item -Force $zip
}
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal

Write-Host "Created $zip"
