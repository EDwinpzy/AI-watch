param(
  [string]$AllowClient = '192.168.1.89',
  [int]$Port = 8787,
  [string]$Model = 'translategemma:4b',
  [string]$WhisperModel = 'base'
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
Write-Host "Starting NOVA AI service on http://${ip}:$Port"
Write-Host "Allowed watch client: $AllowClient"
Write-Host 'Keep this process running while testing the watch.'
& $python (Join-Path $root 'scripts\ai_service.py') `
  --host $ip `
  --port $Port `
  --allow-client $AllowClient `
  --allow-client 127.0.0.1 `
  --allow-client $ip `
  --model $Model `
  --whisper-model $WhisperModel `
  --evidence-dir $evidence
