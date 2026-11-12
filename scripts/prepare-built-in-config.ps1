#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ApiKey = $env:MAGPIE_API_KEY,
    [string]$BaseUrl = 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1',
    [string]$Model = 'group/ai-watch'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$secretFile = Join-Path $repoRoot '.secrets\built-in-service.json'

if ([string]::IsNullOrWhiteSpace($ApiKey) -and (Test-Path -LiteralPath $secretFile)) {
    $secret = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
    $ApiKey = [string]$secret.apiKey
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and $secret.baseUrl) {
        $BaseUrl = [string]$secret.baseUrl
    }
    if ([string]::IsNullOrWhiteSpace($Model) -and $secret.model) {
        $Model = [string]$secret.model
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "Missing API key. Set MAGPIE_API_KEY or create $secretFile with an apiKey field."
}
if ($ApiKey -notmatch '^sk-[A-Za-z0-9-]+$') {
    throw 'MAGPIE_API_KEY has an unexpected format.'
}
if ($BaseUrl -notmatch '^https://\S+$') {
    throw 'Built-in base URL must use HTTPS.'
}
if ($Model -notmatch '^[A-Za-z0-9._/-]+$') {
    throw 'Built-in model contains unsupported characters.'
}

$ApiKey = $ApiKey.Replace("'", "''")
$BaseUrl = $BaseUrl.Replace("'", "''")
$Model = $Model.Replace("'", "''")
$targetDirectory = Join-Path $repoRoot 'api8-watch\entry\src\main\js\HiWearMainAbility\pages\round'
$target = Join-Path $targetDirectory 'built-in-config.js'
$content = @"
export default {
  baseUrl: '$BaseUrl',
  apiKey: '$ApiKey',
  model: '$Model'
};
"@

if (-not (Test-Path -LiteralPath $targetDirectory)) {
    throw "Round page directory is missing: $targetDirectory"
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8)
Write-Host "Generated local built-in config: $target"
