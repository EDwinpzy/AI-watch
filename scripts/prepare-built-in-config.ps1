#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ApiKey = $env:MAGPIE_API_KEY,
    [string]$BaseUrl = 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1',
    [string]$Model = 'workbuddy/deepseek-v4.1-flash',
    [string]$ClientBaseUrl = $env:NOVA_MODEL_CLIENT_BASE_URL,
    [string]$ClientToken = $env:NOVA_MODEL_CLIENT_TOKEN,
    [string]$CodexBaseUrl = $env:NOVA_CODEX_BASE_URL,
    [string]$CodexToken = $env:NOVA_CODEX_TOKEN,
    [string]$CodexRepoId = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$secretFile = Join-Path $repoRoot '.secrets\built-in-service.json'

if (Test-Path -LiteralPath $secretFile) {
    $secret = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        $ApiKey = [string]$secret.apiKey
    }
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and $secret.baseUrl) {
        $BaseUrl = [string]$secret.baseUrl
    }
    if ([string]::IsNullOrWhiteSpace($Model) -and $secret.model) {
        $Model = [string]$secret.model
    }
    if ([string]::IsNullOrWhiteSpace($CodexBaseUrl) -and $secret.codexBaseUrl) {
        $CodexBaseUrl = [string]$secret.codexBaseUrl
    }
    if ([string]::IsNullOrWhiteSpace($CodexToken) -and $secret.codexToken) {
        $CodexToken = [string]$secret.codexToken
    }
    if ([string]::IsNullOrWhiteSpace($CodexRepoId) -and $secret.codexRepoId) {
        $CodexRepoId = [string]$secret.codexRepoId
    }
    if ([string]::IsNullOrWhiteSpace($ClientBaseUrl) -and $secret.clientBaseUrl) {
        $ClientBaseUrl = [string]$secret.clientBaseUrl
    }
    if ([string]::IsNullOrWhiteSpace($ClientToken) -and $secret.clientToken) {
        $ClientToken = [string]$secret.clientToken
    }
}
if ([string]::IsNullOrWhiteSpace($CodexRepoId)) {
    $CodexRepoId = 'watch'
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "Missing API key. Set MAGPIE_API_KEY or create $secretFile with an apiKey field."
}
if ($ApiKey -notmatch '^sk-[A-Za-z0-9-]+$') {
    throw 'MAGPIE_API_KEY has an unexpected format.'
}
if ($BaseUrl -notmatch '^https://\S+$') {
    throw 'Upstream model base URL must use HTTPS.'
}
if ([string]::IsNullOrWhiteSpace($ClientBaseUrl)) {
    $ClientBaseUrl = $BaseUrl
}
if ($ClientBaseUrl -notmatch '^https?://\S+$') {
    throw 'Watch model client URL must use HTTP or HTTPS.'
}
if ([string]::IsNullOrWhiteSpace($ClientToken)) {
    $ClientToken = $ApiKey
}
if ($ClientToken -notmatch '^[A-Za-z0-9._-]{4,}$') {
    throw 'Watch model client token has an unexpected format.'
}
if ($Model -notmatch '^[A-Za-z0-9._/-]+$') {
    throw 'Built-in model contains unsupported characters.'
}
if (-not [string]::IsNullOrWhiteSpace($CodexBaseUrl) -and $CodexBaseUrl -notmatch '^https?://\S+$') {
    throw 'Codex bridge URL must use HTTP or HTTPS.'
}
if (-not [string]::IsNullOrWhiteSpace($CodexToken) -and $CodexToken -notmatch '^[A-Za-z0-9_-]{4,}$') {
    throw 'Codex token has an unexpected format.'
}
if ($CodexRepoId -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'Codex repo id contains unsupported characters.'
}

$ApiKey = $ApiKey.Replace("'", "''")
$BaseUrl = $BaseUrl.Replace("'", "''")
$Model = $Model.Replace("'", "''")
$ClientBaseUrl = $ClientBaseUrl.Replace("'", "''")
$ClientToken = $ClientToken.Replace("'", "''")
$CodexBaseUrl = $CodexBaseUrl.Replace("'", "''")
$CodexToken = $CodexToken.Replace("'", "''")
$CodexRepoId = $CodexRepoId.Replace("'", "''")
$targetDirectory = Join-Path $repoRoot 'api8-watch\entry\src\main\js\HiWearMainAbility'
$target = Join-Path $targetDirectory 'built-in-config.js'
$content = @"
export default {
  baseUrl: '$ClientBaseUrl',
  apiKey: '$ClientToken',
  model: '$Model',
  codexBaseUrl: '$CodexBaseUrl',
  codexToken: '$CodexToken',
  codexRepoId: '$CodexRepoId'
};
"@

if (-not (Test-Path -LiteralPath $targetDirectory)) {
    throw "Round page directory is missing: $targetDirectory"
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8)
Write-Host "Generated local built-in config: $target"
