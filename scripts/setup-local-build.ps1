param(
  [string]$SigningConfigPath = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root 'api8-watch\build-profile.example.json5'
$target = Join-Path $root 'api8-watch\build-profile.json5'

if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "Local build profile already exists: $target. Pass -Force to replace it."
}

$profile = Get-Content -LiteralPath $template -Raw | ConvertFrom-Json
if ($SigningConfigPath) {
  $signingPath = (Resolve-Path -LiteralPath $SigningConfigPath).Path
  $signing = Get-Content -LiteralPath $signingPath -Raw | ConvertFrom-Json
  $configs = @($signing.signingConfigs)
  if ($configs.Count -eq 0 -or -not $configs[0].name) {
    throw 'Signing config must contain at least one named signingConfigs entry.'
  }
  $profile.app.signingConfigs = $configs
  $profile.app.products[0] | Add-Member `
    -NotePropertyName signingConfig `
    -NotePropertyValue $configs[0].name `
    -Force
}

$profile | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $target -Encoding utf8
Write-Host "Local build profile written: $target"
if ($SigningConfigPath) {
  Write-Host 'Local signing config attached. Keep the source file outside Git tracking.'
} else {
  Write-Host 'No signing config attached; HAP builds will be unsigned.'
}
