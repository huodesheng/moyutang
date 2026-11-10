# Build a self-contained, shareable zip of the 摸鱼塘 plugin.
#
# Only runtime files go in: the package manifest, the two halves, the patch,
# locales, the icon, the README and the three asset folders. Working material
# (assets/raw, assets/gen, tools, screenshots) stays out.
#
#   pwsh -File tools/pack.ps1
#
# Output: dist/dsh-moyutang-<version>.zip

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$manifest = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$name = 'dsh-moyutang'
$version = $manifest.version
$stage = Join-Path $dist 'stage'
$folder = Join-Path $stage "$name-$version"
$zip = Join-Path $dist "$name-$version.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $folder -Force | Out-Null

$files = @(
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'README.md',
  'INSTALL.md'
)
foreach ($file in $files) {
  $source = Join-Path $root $file
  if (Test-Path $source) { Copy-Item $source $folder }
  else { Write-Warning "missing $file" }
}

foreach ($sub in @('locale', 'assets\fish', 'assets\items', 'assets\ponds')) {
  $source = Join-Path $root $sub
  if (-not (Test-Path $source)) { continue }
  $target = Join-Path $folder $sub
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Get-ChildItem $source -File | Where-Object { $_.Extension -in '.json', '.webp' } | ForEach-Object {
    Copy-Item $_.FullName $target
  }
}

$count = (Get-ChildItem $folder -Recurse -File).Count
$bytes = (Get-ChildItem $folder -Recurse -File | Measure-Object Length -Sum).Sum
Compress-Archive -Path $folder -DestinationPath $zip -CompressionLevel Optimal

$zipFile = Get-Item $zip
Write-Output ("packed {0} files ({1:N0} KB) -> {2} ({3:N1} KB zip)" -f $count, ($bytes / 1KB), $zipFile.FullName, ($zipFile.Length / 1KB))
