param(
  [string]$Version = '',
  [string]$SdkHome = $env:OHOS_BASE_SDK_HOME,
  [string]$HwSdk = $env:HWSDK,
  [string]$NodeExe = '',
  [string]$JavaExe = 'java',
  [string]$OutputDir = '',
  [switch]$AllowDirty,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $root 'api8-watch'
$appConfig = Join-Path $apiRoot 'AppScope\app.json5'
$moduleConfig = Join-Path $apiRoot 'entry\src\main\config.json'
$hvigor = Join-Path $apiRoot 'node_modules\@ohos\hvigor\bin\hvigor.js'
$sourceHap = Join-Path $apiRoot 'entry\build\default\outputs\default\entry-default-signed.hap'
$evidenceDir = Join-Path $root 'artifacts\release-v1.2.0'
$signatureDir = Join-Path $evidenceDir 'signing-verify'

if (-not $Version) {
  $appText = Get-Content -Raw $appConfig
  $match = [regex]::Match($appText, '"versionName"\s*:\s*"([^"]+)"')
  if (-not $match.Success) { throw 'versionName not found in AppScope/app.json5' }
  $Version = $match.Groups[1].Value
}
if (-not $SdkHome) { throw 'Set OHOS_BASE_SDK_HOME or pass -SdkHome.' }
if (-not $HwSdk) { throw 'Set HWSDK or pass -HwSdk.' }
if (-not $NodeExe) {
  $NodeExe = (Get-Command node -ErrorAction Stop).Source
}
if (-not $OutputDir) {
  $OutputDir = Join-Path $root 'signing'
}
if (-not (Test-Path -LiteralPath $hvigor)) {
  throw "Hvigor not found: $hvigor"
}

$status = @(git -C $root status --porcelain=v1)
if ($status.Count -gt 0 -and -not $AllowDirty) {
  throw 'Release build requires a clean Git worktree.'
}

$appText = Get-Content -Raw $appConfig
$moduleText = Get-Content -Raw $moduleConfig
if ($appText -notmatch ('"versionName"\s*:\s*"' + [regex]::Escape($Version) + '"')) {
  throw "AppScope versionName does not match $Version"
}
if ($moduleText -notmatch ('"name"\s*:\s*"' + [regex]::Escape($Version) + '"')) {
  throw "Module version does not match $Version"
}

$env:OHOS_BASE_SDK_HOME = $SdkHome
$env:HWSDK = $HwSdk
Push-Location $root
try {
  npm run check:source
  if ($LASTEXITCODE -ne 0) { throw 'check:source failed' }
  npm run check:core
  if ($LASTEXITCODE -ne 0) { throw 'check:core failed' }
  npm run check:api8
  if ($LASTEXITCODE -ne 0) { throw 'check:api8 failed' }
  python -m unittest -v scripts.test_codex_bridge
  if ($LASTEXITCODE -ne 0) { throw 'backend tests failed' }
  node --check prototypes/aurora-watch/app.js
  if ($LASTEXITCODE -ne 0) { throw 'prototype syntax check failed' }
} finally {
  Pop-Location
}

Push-Location $apiRoot
try {
  & $NodeExe $hvigor clean --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Hvigor clean failed' }
  & $NodeExe $hvigor assembleHap -m module `
    -p product=default -p module=entry@default -p buildMode=release `
    --no-daemon --no-incremental
  if ($LASTEXITCODE -ne 0) { throw 'Release HAP build failed' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $sourceHap)) {
  throw "Signed HAP not found: $sourceHap"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path $signatureDir -Force | Out-Null
$releaseName = "NOVA-Watch-AI-fa-api8-v$Version-release.hap"
$releaseHap = Join-Path $OutputDir $releaseName
if ((Test-Path -LiteralPath $releaseHap) -and -not $Force) {
  throw "Release HAP already exists: $releaseHap. Pass -Force to replace it."
}
Copy-Item -LiteralPath $sourceHap -Destination $releaseHap -Force:$Force

$hash = (Get-FileHash -LiteralPath $releaseHap -Algorithm SHA256).Hash
$size = (Get-Item -LiteralPath $releaseHap).Length
$hashFile = "$releaseHap.sha256"
Set-Content -LiteralPath $hashFile -Value "$hash *$releaseName" -Encoding ascii

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($releaseHap)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName })
} finally {
  $archive.Dispose()
}
$media = @($entries | Where-Object {
  $_ -match '\.(wav|mp3|ogg|aac|m4a|gif)$'
})
if ($media.Count -gt 0) {
  throw "Audio or animation media found in HAP: $($media -join ', ')"
}

$hapSignJar = Get-ChildItem -Path (Join-Path $HwSdk 'hmscore') `
  -Filter 'hapsigntoolv2.jar' -Recurse -ErrorAction Stop |
  Select-Object -First 1
if (-not $hapSignJar) {
  throw 'hapsigntoolv2.jar not found under HWSDK/hmscore.'
}
$sigCer = Join-Path $signatureDir "v$Version-cert-chain.cer"
$sigProfile = Join-Path $signatureDir "v$Version-profile.p7b"
$verifyOutput = & $JavaExe -jar $hapSignJar.FullName verify `
  -inputFile $releaseHap `
  -outcertchain $sigCer `
  -outprofile $sigProfile 2>&1
$verifyExit = $LASTEXITCODE
$verifyText = ($verifyOutput | Out-String)
$verifyText
if ($verifyExit -ne 0 -or $verifyText -notmatch 'verify: Verify success') {
  throw 'HAP signature verification failed'
}
foreach ($proof in @($sigCer, $sigProfile)) {
  if (-not (Test-Path -LiteralPath $proof) -or
      (Get-Item -LiteralPath $proof).Length -le 0) {
    throw "HAP signature proof was not written: $proof"
  }
}

$commit = (git -C $root rev-parse HEAD).Trim()
$report = [ordered]@{
  version = $Version
  buildMode = 'release'
  commit = $commit
  dirty = $status.Count -gt 0
  artifact = $releaseHap
  size = $size
  sha256 = $hash
  entries = $entries.Count
  mediaEntries = $media
  signature = 'verified'
  signingBoundary = 'local installable signing profile; not an AppGallery production certificate'
  createdAt = (Get-Date).ToString('o')
}
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$reportPath = Join-Path $evidenceDir 'build-report.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8

$report | ConvertTo-Json -Depth 5
