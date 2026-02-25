param(
  [string]$InstallDir = "",
  [switch]$SkipDockerInstall = $false,
  [switch]$SkipWslInstall = $false,
  [switch]$QuickTunnel = $false,
  [string]$CloudflareTunnelToken = "",
  [string]$PublicApiUrl = ""
)

$ErrorActionPreference = 'Stop'

function WriteInfo([string]$msg) { Write-Host "[SMagenda] $msg" }

function IsAdmin() {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function RelaunchAsAdmin() {
  $ps = (Get-Process -Id $PID).Path
  $args = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"' + $PSCommandPath + '"')
  )

  foreach ($kv in $PSBoundParameters.GetEnumerator()) {
    $key = [string]$kv.Key
    $val = $kv.Value

    if ($val -is [switch]) {
      if ($val.IsPresent) { $args += ('-' + $key) }
      continue
    }

    if ($null -eq $val) { continue }
    $args += ('-' + $key)
    $args += ('"' + ([string]$val).Replace('"', '""') + '"')
  }

  Start-Process -FilePath $ps -Verb RunAs -ArgumentList $args
  exit 0
}

function HasCommand([string]$name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function WaitForDocker([int]$timeoutSeconds = 600) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      docker version | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 5
    }
  }
  return $false
}

function RandomHex([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return -join ($b | ForEach-Object { $_.ToString('x2') })
}

if (-not $InstallDir.Trim()) {
  $InstallDir = Join-Path $env:ProgramData 'SMagenda\Evolution'
}

$needsAdmin = (-not $SkipDockerInstall.IsPresent) -or (-not $SkipWslInstall.IsPresent) -or ($InstallDir -like "$env:ProgramData*")
if ($needsAdmin -and -not (IsAdmin)) {
  WriteInfo 'Reabrindo como Administrador para instalar dependências e configurar o ambiente...'
  RelaunchAsAdmin
}

WriteInfo "Pasta de instalação: $InstallDir"

$composeProject = 'smagenda_evolution'
$composeNetwork = "${composeProject}_default"

if (-not $SkipWslInstall.IsPresent) {
  if (-not (HasCommand 'wsl')) {
    WriteInfo 'WSL não encontrado. Tentando instalar (wsl --install)...'
    try {
      wsl --install
      WriteInfo 'WSL foi iniciado para instalação. Reinicie o Windows e execute este instalador novamente.'
      exit 0
    } catch {
      throw 'Falha ao instalar WSL automaticamente. Instale WSL2 manualmente e execute novamente.'
    }
  }
}

if (-not $SkipDockerInstall.IsPresent) {
  if (-not (HasCommand 'docker')) {
    if (-not (HasCommand 'winget')) {
      throw 'winget não encontrado. Instale o Docker Desktop manualmente (ou instale o winget) e execute novamente.'
    }

    WriteInfo 'Docker não encontrado. Instalando Docker Desktop via winget...'
    winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
  }
}

if (-not (HasCommand 'docker')) {
  throw 'Docker ainda não está disponível. Abra o Docker Desktop e tente novamente.'
}

if (-not (WaitForDocker -timeoutSeconds 900)) {
  WriteInfo 'Docker não respondeu a tempo. Abra o Docker Desktop (e aguarde ficar “Running”), depois execute novamente.'
  exit 1
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$composePath = Join-Path $InstallDir 'docker-compose.evolution.yml'
$envPath = Join-Path $InstallDir '.env'

$apiKey = RandomHex 32
$dbPass = RandomHex 24

$compose = @'
version: '3.9'

services:
  evolution-api:
    container_name: evolution_api
    image: evoapicloud/evolution-api:v2.3.7
    restart: always
    ports:
      - '8080:8080'
    environment:
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: ${EVOLUTION_AUTH_KEY}
      CORS_ORIGIN: ${EVOLUTION_CORS_ORIGIN}
      CONFIG_SESSION_PHONE_VERSION: ${EVOLUTION_CONFIG_SESSION_PHONE_VERSION:-2.3000.1030444778}
      DATABASE_ENABLED: ${EVOLUTION_DATABASE_ENABLED}
      DATABASE_PROVIDER: ${EVOLUTION_DATABASE_PROVIDER}
      DATABASE_CONNECTION_URI: ${EVOLUTION_DATABASE_CONNECTION_URI}
      CACHE_REDIS_ENABLED: ${EVOLUTION_CACHE_REDIS_ENABLED}
      CACHE_REDIS_URI: ${EVOLUTION_CACHE_REDIS_URI}
      CACHE_REDIS_PREFIX_KEY: ${EVOLUTION_CACHE_REDIS_PREFIX_KEY}
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      - evolution_db
      - evolution_redis

  evolution_db:
    container_name: evolution_db
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ${EVOLUTION_POSTGRES_DB}
      POSTGRES_USER: ${EVOLUTION_POSTGRES_USER}
      POSTGRES_PASSWORD: ${EVOLUTION_POSTGRES_PASSWORD}
    volumes:
      - evolution_db_data:/var/lib/postgresql/data

  evolution_redis:
    container_name: evolution_redis
    image: redis:7-alpine
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - evolution_redis_data:/data

volumes:
  evolution_instances:
  evolution_db_data:
  evolution_redis_data:
'@

Set-Content -Path $composePath -Value $compose -Encoding UTF8

$envFile = @(
  "EVOLUTION_AUTH_KEY=$apiKey",
  "EVOLUTION_CORS_ORIGIN=*",
  "EVOLUTION_CONFIG_SESSION_PHONE_VERSION=2.3000.1030444778",
  "EVOLUTION_DATABASE_ENABLED=true",
  "EVOLUTION_DATABASE_PROVIDER=postgresql",
  "EVOLUTION_POSTGRES_DB=evolution",
  "EVOLUTION_POSTGRES_USER=evolution",
  "EVOLUTION_POSTGRES_PASSWORD=$dbPass",
  "EVOLUTION_DATABASE_CONNECTION_URI=postgresql://evolution:$dbPass@evolution_db:5432/evolution",
  "EVOLUTION_CACHE_REDIS_ENABLED=true",
  "EVOLUTION_CACHE_REDIS_URI=redis://evolution_redis:6379",
  "EVOLUTION_CACHE_REDIS_PREFIX_KEY=evolution"
) -join "`n"

Set-Content -Path $envPath -Value $envFile -Encoding UTF8

WriteInfo 'Subindo Evolution API (Docker Compose)...'
Push-Location $InstallDir
try {
  docker compose -p $composeProject -f $composePath up -d
} finally {
  Pop-Location
}

WriteInfo 'Verificando Evolution em http://localhost:8080 ...'
$ok = $false
for ($i = 0; $i -lt 24; $i += 1) {
  try {
    $res = Invoke-WebRequest -Uri 'http://localhost:8080/' -UseBasicParsing -TimeoutSec 10
    $body = [string]$res.Content
    if ($body -match 'Evolution' -or $body -match 'Welcome to the Evolution API') {
      $ok = $true
      break
    }
  } catch {
  }
  Start-Sleep -Seconds 5
}

if (-not $ok) {
  WriteInfo 'A Evolution não respondeu como esperado. Veja logs com:'
  WriteHost "  docker compose -f `"$composePath`" logs -f --tail=200 evolution-api"
  exit 1
}

$localUrl = 'http://localhost:8080'
WriteInfo 'Instalação concluída.'
WriteHost "API URL (local): $localUrl"
WriteHost "API Key: $apiKey"

if ($PublicApiUrl.Trim()) {
  WriteHost "API URL (pública): $PublicApiUrl"
}

WriteInfo 'Importante: o SMagenda em produção (Supabase) NÃO consegue acessar localhost.'
WriteInfo 'Para usar envio automático com clientes rodando localmente, é obrigatório expor uma URL pública via tunnel/proxy (que repasse o header apikey).'

if ($QuickTunnel.IsPresent) {
  WriteInfo 'Iniciando Quick Tunnel (cloudflared) via Docker...'
  $existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq 'smagenda_cloudflared_quick' }
  if ($existing) {
    docker rm -f smagenda_cloudflared_quick | Out-Null
  }

  docker run -d --name smagenda_cloudflared_quick --restart unless-stopped --network $composeNetwork cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://evolution-api:8080 | Out-Null

  $publicUrl = ''
  for ($i = 0; $i -lt 24; $i += 1) {
    try {
      $logs = docker logs --tail 200 smagenda_cloudflared_quick 2>$null
      $m = [regex]::Match([string]$logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($m.Success) {
        $publicUrl = $m.Value
        break
      }
    } catch {
    }
    Start-Sleep -Seconds 2
  }

  if ($publicUrl) {
    WriteHost "API URL (pública temporária): $publicUrl"
    WriteInfo 'Atenção: Quick Tunnel gera URL temporária (pode mudar) e depende do PC ficar ligado.'
  } else {
    WriteInfo 'Quick Tunnel iniciado, mas não foi possível detectar a URL automaticamente nos logs.'
    WriteInfo 'Veja logs com: docker logs -f smagenda_cloudflared_quick'
  }
}

if ($CloudflareTunnelToken.Trim()) {
  WriteInfo 'Subindo Cloudflare Tunnel (cloudflared) via Docker...'
  $existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq 'smagenda_cloudflared' }
  if ($existing) {
    docker rm -f smagenda_cloudflared | Out-Null
  }
  docker run -d --name smagenda_cloudflared --restart unless-stopped cloudflare/cloudflared:latest tunnel --no-autoupdate run --token $CloudflareTunnelToken | Out-Null
  WriteInfo 'Tunnel iniciado. A URL pública depende do hostname configurado no Cloudflare Zero Trust para este tunnel.'
}
