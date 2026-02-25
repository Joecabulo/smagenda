#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/smagenda-evolution"
TUNNEL_TOKEN=""
PUBLIC_HOSTNAME=""
EVOLUTION_AUTH_KEY=""
EVOLUTION_AUTH_KEY_CLI=""
QUICK_TUNNEL="0"
NO_TUNNEL="0"
SYSTEM_UPGRADE="1"
RESET="0"
SKIP_DOCKER_INSTALL="0"
PROJECT_NAME="smagenda_evolution"

log() {
  echo "[SMagenda][Evolution][Ubuntu] $*"
}

die() {
  echo "[SMagenda][Evolution][Ubuntu][ERRO] $*" >&2
  exit 1
}

is_wsl() {
  grep -qi microsoft /proc/version 2>/dev/null
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --tunnel-token)
      TUNNEL_TOKEN="$2"
      shift 2
      ;;
    --hostname)
      PUBLIC_HOSTNAME="$2"
      shift 2
      ;;
    --api-key)
      EVOLUTION_AUTH_KEY_CLI="$2"
      shift 2
      ;;
    --quick-tunnel)
      QUICK_TUNNEL="1"
      shift
      ;;
    --no-tunnel)
      NO_TUNNEL="1"
      shift
      ;;
    --no-upgrade)
      SYSTEM_UPGRADE="0"
      shift
      ;;
    --reset)
      RESET="1"
      shift
      ;;
    --skip-docker-install)
      SKIP_DOCKER_INSTALL="1"
      shift
      ;;
    *)
      echo "Argumento inválido: $1" >&2
      echo "Uso: $0 [--tunnel-token <TOKEN> | --quick-tunnel | --no-tunnel] [--hostname <HOST>] [--dir <DIR>] [--api-key <KEY>] [--no-upgrade] [--reset] [--skip-docker-install]" >&2
      exit 2
      ;;
  esac
done

MODE="fixed"
if [ -z "$TUNNEL_TOKEN" ]; then
  if [ "$QUICK_TUNNEL" = "1" ]; then
    MODE="quick"
  elif [ "$NO_TUNNEL" = "1" ]; then
    MODE="none"
  else
    echo "Faltou configurar o acesso público. Use --tunnel-token <TOKEN> (túnel fixo), ou --quick-tunnel (URL temporária), ou --no-tunnel (apenas local)." >&2
    exit 2
  fi
fi

SUDO=""
if [ "${EUID:-0}" -ne 0 ]; then
  SUDO="sudo"
fi

USER_NAME="${SUDO_USER:-${USER:-}}"

$SUDO mkdir -p "$INSTALL_DIR"
$SUDO chown -R "${USER_NAME:-root}:" "$INSTALL_DIR" 2>/dev/null || true

LOG_TMP="/tmp/smagenda-evolution-install-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_TMP") 2>&1

LOG_FINAL="$INSTALL_DIR/install.log"
trap '$SUDO cp -f "$LOG_TMP" "$LOG_FINAL" 2>/dev/null || true' EXIT

log "Log: $LOG_TMP"
log "Kernel: $(uname -a)"
if [ -f /etc/os-release ]; then
  log "OS:"
  cat /etc/os-release
fi

if is_wsl; then
  log "Aviso: ambiente WSL detectado. Em WSL, Docker via systemctl pode não funcionar."
  log "Recomendado: usar Docker Desktop no Windows e integrar com WSL, ou instalar em Ubuntu nativo/VPS."
fi

if [ "$SYSTEM_UPGRADE" = "1" ]; then
  log "Atualizando o sistema (apt upgrade/full-upgrade)..."
  $SUDO apt-get update || die "Falha em apt-get update (verifique internet/DNS)"
  $SUDO apt-get -y upgrade || die "Falha em apt-get upgrade"
  $SUDO apt-get -y full-upgrade || die "Falha em apt-get full-upgrade"
  $SUDO apt-get -y autoremove || true
  $SUDO apt-get -y autoclean || true
fi

log "Instalando dependências básicas (ca-certificates/curl/gnupg/lsb-release/openssl)..."
$SUDO apt-get update || die "Falha em apt-get update (verifique internet/DNS)"
$SUDO apt-get install -y ca-certificates curl gnupg lsb-release openssl || die "Falha ao instalar dependências básicas"

if [ "$SKIP_DOCKER_INSTALL" = "0" ]; then
  if have_cmd docker; then
    log "Docker já existe. Pulando instalação." 
  else
    OS_ID="$(. /etc/os-release && echo "${ID:-}")"
    CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
    if [ -z "$CODENAME" ]; then
      CODENAME="$(lsb_release -cs 2>/dev/null || true)"
    fi

    $SUDO install -m 0755 -d /etc/apt/keyrings

    if [ "$OS_ID" = "ubuntu" ] || [ "$OS_ID" = "debian" ]; then
      if [ -z "$CODENAME" ]; then
        die "Não foi possível detectar o codename do $OS_ID (VERSION_CODENAME)."
      fi

      log "Instalando Docker (repo oficial) para $OS_ID/$CODENAME..."
      if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
      fi

      $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} $CODENAME stable
EOF

      $SUDO apt-get update || die "Falha em apt-get update após adicionar repo Docker"
      $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || die "Falha ao instalar Docker (repo oficial)"
    else
      log "Distro não suportada para repo oficial automaticamente (ID=$OS_ID). Usando pacotes da distro (docker.io)."
      $SUDO apt-get update || die "Falha em apt-get update"
      $SUDO apt-get install -y docker.io docker-compose-plugin || die "Falha ao instalar docker.io"
    fi
  fi
fi

if have_cmd systemctl; then
  log "Iniciando Docker via systemctl..."
  $SUDO systemctl enable --now docker || true
else
  log "systemctl não disponível. Se o Docker não iniciar, use o método do seu ambiente (WSL/VM)."
fi

log "Verificando Docker daemon..."
if ! $SUDO docker info >/dev/null 2>&1; then
  die "Docker daemon não está respondendo (docker info falhou). Abra/ative o serviço Docker e rode novamente."
fi

if [ -n "$USER_NAME" ]; then
  $SUDO usermod -aG docker "$USER_NAME" || true
fi

cd "$INSTALL_DIR"

COMPOSE_NETWORK="${PROJECT_NAME}_default"

if [ -f .env ] && [ "$RESET" != "1" ]; then
  log "Carregando variáveis existentes de $INSTALL_DIR/.env"
  set -a
  . "$INSTALL_DIR/.env" || true
  set +a
fi

if [ -n "$EVOLUTION_AUTH_KEY_CLI" ]; then
  EVOLUTION_AUTH_KEY="$EVOLUTION_AUTH_KEY_CLI"
fi

if [ "$RESET" = "1" ]; then
  log "Reset solicitado: derrubando stack e removendo containers antigos (se existirem)..."
  docker compose -p "$PROJECT_NAME" down --remove-orphans --volumes || true
  docker rm -f evolution_api evolution_db evolution_redis smagenda_cloudflared smagenda_cloudflared_quick 2>/dev/null || true
fi

if [ "$RESET" = "1" ]; then
  EVOLUTION_AUTH_KEY=""
  EVOLUTION_POSTGRES_PASSWORD=""
fi

if [ -z "${EVOLUTION_AUTH_KEY:-}" ]; then
  EVOLUTION_AUTH_KEY="${EVOLUTION_AUTH_KEY:-$(openssl rand -hex 32)}"
fi

if [ -z "${EVOLUTION_POSTGRES_PASSWORD:-}" ]; then
  EVOLUTION_POSTGRES_PASSWORD="$(openssl rand -hex 24)"
fi

cat > docker-compose.yml <<'YAML'
version: '3.9'

services:
  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    restart: always
    ports:
      - '127.0.0.1:8080:8080'
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
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ${EVOLUTION_POSTGRES_DB}
      POSTGRES_USER: ${EVOLUTION_POSTGRES_USER}
      POSTGRES_PASSWORD: ${EVOLUTION_POSTGRES_PASSWORD}
    volumes:
      - evolution_db_data:/var/lib/postgresql/data

  evolution_redis:
    image: redis:7-alpine
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - evolution_redis_data:/data
YAML

if [ "$MODE" = "fixed" ]; then
  cat >> docker-compose.yml <<'YAML'

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    network_mode: host
    command: ["tunnel", "--no-autoupdate", "run", "--token", "${CLOUDFLARE_TUNNEL_TOKEN}"]
YAML
fi

cat >> docker-compose.yml <<'YAML'

volumes:
  evolution_instances:
  evolution_db_data:
  evolution_redis_data:
YAML

umask 077

cat > .env <<ENV
EVOLUTION_AUTH_KEY=$EVOLUTION_AUTH_KEY
EVOLUTION_CORS_ORIGIN=*
EVOLUTION_CONFIG_SESSION_PHONE_VERSION=2.3000.1030444778

EVOLUTION_DATABASE_ENABLED=true
EVOLUTION_DATABASE_PROVIDER=postgresql
EVOLUTION_POSTGRES_DB=evolution
EVOLUTION_POSTGRES_USER=evolution
EVOLUTION_POSTGRES_PASSWORD=$EVOLUTION_POSTGRES_PASSWORD
EVOLUTION_DATABASE_CONNECTION_URI=postgresql://evolution:$EVOLUTION_POSTGRES_PASSWORD@evolution_db:5432/evolution

EVOLUTION_CACHE_REDIS_ENABLED=true
EVOLUTION_CACHE_REDIS_URI=redis://evolution_redis:6379
EVOLUTION_CACHE_REDIS_PREFIX_KEY=evolution
ENV

if [ "$MODE" = "fixed" ]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN=$TUNNEL_TOKEN" >> .env
fi

log "Subindo containers (docker compose)..."
docker compose -p "$PROJECT_NAME" up -d

OK="0"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then
    OK="1"
    break
  fi
  sleep 2
done

if [ "$OK" != "1" ]; then
  echo "Evolution não respondeu em http://127.0.0.1:8080" >&2
  echo "Logs:" >&2
  docker compose -p "$PROJECT_NAME" logs --tail=200 evolution-api >&2 || true
  exit 1
fi

if [ "$MODE" = "quick" ]; then
  log "Iniciando Quick Tunnel (cloudflared) via Docker..."
  docker rm -f smagenda_cloudflared_quick >/dev/null 2>&1 || true

  docker run -d --name smagenda_cloudflared_quick --restart unless-stopped --network "$COMPOSE_NETWORK" cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://evolution-api:8080 >/dev/null

  QUICK_URL=""
  for i in $(seq 1 30); do
    LOGS="$(docker logs --tail 200 smagenda_cloudflared_quick 2>/dev/null || true)"
    QUICK_URL="$(echo "$LOGS" | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | head -n 1 || true)"
    if [ -n "$QUICK_URL" ]; then
      break
    fi
    sleep 2
  done

  if [ -n "$QUICK_URL" ]; then
    PUBLIC_HOSTNAME="$QUICK_URL"
    log "Quick Tunnel URL detectada: $QUICK_URL"
  else
    log "Quick Tunnel iniciado, mas não foi possível detectar a URL automaticamente. Rode: docker logs -f smagenda_cloudflared_quick"
  fi
fi

echo "OK"
echo "API Key: $EVOLUTION_AUTH_KEY"
if [ "$MODE" = "fixed" ]; then
  echo "API URL (fixa, Cloudflare): ${PUBLIC_HOSTNAME:-<defina --hostname ou use o hostname configurado no Cloudflare>}"
elif [ "$MODE" = "quick" ]; then
  echo "API URL (pública temporária): ${PUBLIC_HOSTNAME:-<veja docker logs -f smagenda_cloudflared_quick>}"
else
  echo "API URL (pública): <não configurada; modo apenas local>"
fi
echo "API URL (local): http://127.0.0.1:8080"
echo "Pasta: $INSTALL_DIR"
echo ""
echo "Se você adicionou este usuário ao grupo docker agora, pode ser necessário fazer logout/login para o docker funcionar sem sudo."
if [ "$MODE" = "fixed" ]; then
  echo "Se o hostname Cloudflare não responder, confirme no Zero Trust o Public Hostname apontando para http://localhost:8080."
elif [ "$MODE" = "quick" ]; then
  echo "Atenção: Quick Tunnel gera URL temporária (pode mudar) e depende do PC ficar ligado."
fi
