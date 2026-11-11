param(
  [string]$AllowClient = '192.168.1.89',
  [int]$Port = 8787,
  [string]$Model = 'translategemma:4b',
  [string]$WhisperModel = 'base',
  [string]$CodexToken = '',
  [string]$CodexModel = 'commandcode-plan/deepseek/deepseek-v4.1-flash',
  [string]$CodexRepo = 'D:\MyProjects\AI-watch',
  [string]$CodexBackendUrl = 'http://127.0.0.1:3425/v1'
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
$evidence = Join-Path $root 'artifacts\ai-service\runtime-20261025'
$codexTasks = Join-Path $root 'artifacts\codex-watch\tasks'
if (-not $CodexToken) {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $CodexToken = -join (1..28 | ForEach-Object {
    $alphabet[(Get-Random -Minimum 0 -Maximum $alphabet.Length)]
  })
}
Write-Host "Starting NOVA AI service on http://${ip}:$Port"
Write-Host "Allowed watch client: $AllowClient"
Write-Host "Codex access token: $CodexToken"
Write-Host "Codex read-only repo: $CodexRepo"
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
  --evidence-dir $evidence
