param(
  [string]$AllowClient = '192.168.1.89',
  [int]$Port = 8787,
  [string]$Model = 'workbuddy/deepseek-v4.1-flash',
  [string]$WhisperModel = 'small',
  [string]$CodexToken = '',
  [string]$CodexModel = 'commandcode-plan/deepseek/deepseek-v4.1-flash',
  [string]$CodexRepo = 'D:\MyProjects\AI-watch',
  [string]$CodexBackendUrl = 'http://127.0.0.1:3425/v1',
  [string]$ModelApiUrl = $env:MAGPIE_BASE_URL,
  [string]$ModelApiKey = $env:MAGPIE_API_KEY,
  [string]$ModelApiName = $env:MAGPIE_MODEL,
  [string]$LocalModelApiUrl = $env:MAGPIE_LOCAL_BASE_URL,
  [int]$ModelApiTimeout = 30,
  [string]$ModelClientToken = $env:NOVA_MODEL_CLIENT_TOKEN
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ip = (Get-NetIPConfiguration |
  Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } |
  Where-Object { $_ -like '192.168.*' -and $_ -notlike '192.168.56.*' } |
  Select-Object -First 1)
if (-not $ip) {
  throw 'No active LAN IPv4 address was found.'
}

$python = (Get-Command python -ErrorAction Stop).Source
$evidence = Join-Path $root 'artifacts\ai-service\runtime'
$codexTasks = Join-Path $root 'artifacts\codex-watch\tasks'
$secretFile = Join-Path $root '.secrets\built-in-service.json'
if (Test-Path -LiteralPath $secretFile) {
  $secret = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($ModelApiUrl) -and $secret.baseUrl) {
    $ModelApiUrl = [string]$secret.baseUrl
  }
  if ([string]::IsNullOrWhiteSpace($ModelApiKey) -and $secret.apiKey) {
    $ModelApiKey = [string]$secret.apiKey
  }
  if ([string]::IsNullOrWhiteSpace($ModelApiName) -and $secret.model) {
    $ModelApiName = [string]$secret.model
  }
  if ([string]::IsNullOrWhiteSpace($LocalModelApiUrl) -and $secret.localModelBaseUrl) {
    $LocalModelApiUrl = [string]$secret.localModelBaseUrl
  }
  if ([string]::IsNullOrWhiteSpace($ModelClientToken) -and $secret.clientToken) {
    $ModelClientToken = [string]$secret.clientToken
  }
  if ([string]::IsNullOrWhiteSpace($CodexToken) -and $secret.codexToken) {
    $CodexToken = [string]$secret.codexToken
  }
}
if ([string]::IsNullOrWhiteSpace($ModelApiName)) {
  $ModelApiName = 'workbuddy/deepseek-v4.1-flash'
}
if (-not [string]::IsNullOrWhiteSpace($LocalModelApiUrl)) {
  $ModelApiUrl = $LocalModelApiUrl
}
if (-not $CodexToken) {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $CodexToken = -join (1..28 | ForEach-Object {
    $alphabet[(Get-Random -Minimum 0 -Maximum $alphabet.Length)]
  })
}
Write-Host "Starting NOVA AI service on http://${ip}:$Port"
Write-Host "Allowed watch client: $AllowClient"
Write-Host "Whisper model: $WhisperModel"
Write-Host 'Codex access token: configured'
Write-Host "Codex read-only repo: $CodexRepo"
Write-Host "Model API: $ModelApiUrl ($ModelApiName)"
Write-Host 'Keep this process running while testing the watch.'
& $python (Join-Path $root 'scripts\ai_service.py') `
  --host $ip `
  --port $Port `
  --allow-client $AllowClient `
  --allow-client 127.0.0.1 `
  --allow-client $ip `
  --model $Model `
  --whisper-model $WhisperModel `
  --codex-token $CodexToken `
  --codex-model $CodexModel `
  --codex-repo "watch=$CodexRepo" `
  --codex-backend-url $CodexBackendUrl `
  --codex-evidence-dir $codexTasks `
  --evidence-dir $evidence `
  --model-api-url $ModelApiUrl `
  --model-api-key $ModelApiKey `
  --model-api-name $ModelApiName `
  --model-api-timeout $ModelApiTimeout `
  --model-client-token $ModelClientToken
