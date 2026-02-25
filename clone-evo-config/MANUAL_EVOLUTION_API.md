# Manual completo de implantação — Evolution API (WhatsApp) para o SMagenda

Este manual descreve como subir a Evolution API (legado do SMagenda) em produção (servidor/VPS) ou em ambiente local do usuário, com persistência e URL pública, de forma que o SMagenda consiga enviar mensagens reais (confirmação/cancelamento/lembretes) usando os dados reais do Supabase.

## 1) O que o SMagenda espera da Evolution

O SMagenda chama a Evolution a partir de Edge Functions (Supabase). Isso implica:

- A URL da Evolution precisa ser pública e acessível pela internet (não pode ser localhost nem IP privado).
- A autenticação deve funcionar pelo header `apikey` (na v2.3.7, query `?apikey=`/`?token=` não autentica no fluxo do SMagenda).
- O endpoint raiz da URL deve responder com uma página/texto que contenha “Welcome to the Evolution API” (isso é usado como pista de validação quando a rota está errada).

Endpoints usados pelo SMagenda (Evolution):

- Criar instância: `POST /instance/create`
- Conectar instância (QR/pairing): `GET/POST /instance/connect...`
- Ver estado: `GET /instance/connectionState/{instanceName}`
- Desconectar: `DELETE /instance/logout/{instanceName}` (fallback `GET`)
- Enviar texto: `POST /message/sendText/{instanceName}` com body `{ number, text }`

Observação: o SMagenda usa múltiplas variações de formato de telefone (com/sem `55`, com `+`, com sufixos como `@s.whatsapp.net`) para maximizar compatibilidade.

## 2) Requisitos mínimos (produção)

- Servidor/VPS Linux 24/7 (recomendado): 2 vCPU, 2 GB RAM, 20+ GB SSD.
- Docker + Docker Compose.
- Domínio (recomendado) e HTTPS (recomendado), ou pelo menos porta pública liberada.

Persistência é obrigatória:

- Volume de instâncias (`/evolution/instances`) para que a sessão do WhatsApp não “suma” após reinício.
- Postgres e Redis (pelo compose) também com volume.

## 3) Compose usado pelo projeto

O repositório já contém um compose pronto: [docker-compose.evolution.yml](file:///c:/Users/Admin/Desktop/SMagenda/smagenda/docker-compose.evolution.yml).

Ele sobe 3 serviços:

- `evolution-api` (porta 8080)
- `evolution_db` (Postgres)
- `evolution_redis` (Redis)

## 4) Variáveis de ambiente (exemplo)

O compose lê variáveis via ambiente. Você pode usar um arquivo `.env` no mesmo diretório do compose (no servidor), ou exportar variáveis no shell.

Exemplo de `.env` (ajuste valores):

```bash
# Chave de autenticação (header apikey)
EVOLUTION_AUTH_KEY=troque-por-uma-chave-forte-e-longa

# CORS (se você expor publicamente e quiser consumir do browser)
EVOLUTION_CORS_ORIGIN=https://SEU-DOMINIO-DO-SMAGENDA.com

# Ajuste para reduzir problemas de QR/pareamento (padrão do compose)
EVOLUTION_CONFIG_SESSION_PHONE_VERSION=2.3000.1030444778

# Banco
EVOLUTION_DATABASE_ENABLED=true
EVOLUTION_DATABASE_PROVIDER=postgresql
EVOLUTION_POSTGRES_DB=evolution
EVOLUTION_POSTGRES_USER=evolution
EVOLUTION_POSTGRES_PASSWORD=troque-por-uma-senha-forte

# Ajuste o host do Postgres para o service name do compose
EVOLUTION_DATABASE_CONNECTION_URI=postgresql://evolution:troque-por-uma-senha-forte@evolution_db:5432/evolution

# Redis
EVOLUTION_CACHE_REDIS_ENABLED=true
EVOLUTION_CACHE_REDIS_URI=redis://evolution_redis:6379
EVOLUTION_CACHE_REDIS_PREFIX_KEY=evolution
```

Notas importantes:

- Use uma `EVOLUTION_AUTH_KEY` forte (mínimo 32 caracteres). Ela será usada no SMagenda como API Key.
- Se você usar proxy/tunnel (Cloudflare/Nginx), confirme que o header `apikey` chega até o container.

## 5) Subindo em servidor/VPS (recomendado)

Passo a passo sugerido:

1. Instale Docker e Docker Compose no servidor.

### 5.0) Instalador “executável” (Ubuntu) + Cloudflare Tunnel fixo

Se você quer algo no estilo “rodar 1 comando e pronto”, use o script:

- [smagenda-evolution-ubuntu-install.sh](file:///c:/Users/Admin/Desktop/SMagenda/smagenda-evolution-ubuntu-install.sh)

Ele faz:

- Atualiza o Ubuntu (por padrão).
- Instala Docker (repo oficial) + Docker Compose plugin.
- Sobe Evolution + Postgres + Redis com persistência.
- Sobe `cloudflared` via Docker com um tunnel fixo (token do Cloudflare).

Como usar no servidor (exemplo):

1) Copie o arquivo para o servidor (SCP/WinSCP).
2) No servidor:

```bash
chmod +x ./smagenda-evolution-ubuntu-install.sh
sudo ./smagenda-evolution-ubuntu-install.sh --tunnel-token "SEU_TOKEN" --hostname "https://evolution.seudominio.com"
```

Para não atualizar o sistema inteiro (mais rápido):

```bash
sudo ./smagenda-evolution-ubuntu-install.sh --no-upgrade --tunnel-token "SEU_TOKEN" --hostname "https://evolution.seudominio.com"
```

Pré-requisito do tunnel fixo:

- No Cloudflare Zero Trust, crie um Tunnel e um Public Hostname apontando para `http://localhost:8080`.
- Use o token desse tunnel no `--tunnel-token`.

O script publica a Evolution apenas em `127.0.0.1:8080` (não expõe a porta na internet) e o acesso externo ocorre via Cloudflare Tunnel.

Se aparecer erro “curl não é reconhecido / não encontrado” no Linux, significa apenas que o pacote não está instalado. Use um destes caminhos:

Ubuntu/Debian (recomendado):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Sem curl (usando wget):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates wget
wget -qO- https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Alternativa (pacotes da distro, sem script):

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Observação: em algumas VPS você precisa sair e entrar de novo para o grupo `docker` valer.

2. Copie o arquivo `docker-compose.evolution.yml` para o servidor.
3. Crie o `.env` ao lado do compose (ou configure variáveis no ambiente).
4. Suba os containers:

```bash
docker compose -f docker-compose.evolution.yml up -d
```

5. Verifique logs:

```bash
docker compose -f docker-compose.evolution.yml logs -f --tail=200 evolution-api
```

6. Teste o endpoint raiz no navegador:

- `http://SEU-IP:8080/` deve exibir algo como “Welcome to the Evolution API”.

### 5.1) Rodando localmente (Windows/Mac) — somente para teste

O SMagenda chama a Evolution a partir do Supabase (nuvem). Por isso, mesmo que você rode a Evolution localmente, ainda precisa expor uma URL pública.

Fluxo recomendado para teste:

1. Instale Docker Desktop.
2. Rode o compose localmente (porta 8080 publicada).
3. Exponha a porta 8080 com um tunnel (ex.: Cloudflare Tunnel, ngrok).
4. Use a URL pública do tunnel como “API URL” no SMagenda.

Limitações importantes:

- Se o tunnel gerar URL temporária (muda a cada execução), você terá que atualizar a API URL no SMagenda sempre que reiniciar o tunnel.
- Se o tunnel/proxy não repassar o header `apikey`, o SMagenda vai falhar com `401 Unauthorized`.
- Para uso real em produção, evite “PC do usuário” e use um servidor 24/7.

### 5.2) Instalação no Windows (Docker Desktop) — passo a passo

Este passo a passo serve para quem precisa rodar a Evolution no Windows (PC do usuário). Funciona, mas para uso real/contínuo o ideal é VPS 24/7.

Forma mais simples (quase “instalável”):

- Use o script [SMagenda_Evolution_Windows_Installer.ps1](file:///c:/Users/Admin/Desktop/SMagenda/SMagenda_Evolution_Windows_Installer.ps1). Ele tenta instalar WSL2 + Docker Desktop, sobe a Evolution com persistência, verifica `http://localhost:8080` e gera uma API Key automaticamente.

Como executar:

1) Clique com o botão direito no arquivo `.ps1` e escolha “Executar com PowerShell” (ou abra PowerShell como Admin e rode o comando abaixo).

2) Em PowerShell (Admin), dentro da pasta onde está o script:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\SMagenda_Evolution_Windows_Installer.ps1
```

Se aparecer erro do tipo “o termo … não é reconhecido como nome de cmdlet”, quase sempre é um destes casos:

- Você não está na pasta onde o arquivo está (use `cd` para entrar na pasta).
- Você tentou executar sem `./` ou `.\` (no PowerShell é obrigatório para executar arquivo na pasta atual).

Forma que não falha (usando caminho completo):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\CAMINHO\SMagenda_Evolution_Windows_Installer.ps1" -QuickTunnel
```

Se o Windows bloquear por “arquivo baixado da internet”, rode:

```powershell
Unblock-File -Path "C:\CAMINHO\SMagenda_Evolution_Windows_Installer.ps1"
```

Alternativa mais fácil (duplo clique):

- Use [SMagenda_Evolution_Windows_Installer.cmd](file:///c:/Users/Admin/Desktop/SMagenda/SMagenda_Evolution_Windows_Installer.cmd) na mesma pasta do `.ps1`.
- Ele chama o PowerShell com `ExecutionPolicy Bypass` automaticamente.

Quick Tunnel (sem conta Cloudflare) — mais simples, porém URL temporária:

```powershell
.\SMagenda_Evolution_Windows_Installer.ps1 -QuickTunnel
```

O instalador inicia um tunnel “temporário” e tenta imprimir uma URL do tipo `https://xxxx.trycloudflare.com`.

- Vantagem: o cliente não precisa criar conta nem configurar domínio.
- Desvantagem: a URL pode mudar e o PC precisa ficar ligado; para cada mudança, você precisa atualizar a API URL no SMagenda.

Ao final ele imprime:

- API URL (local): `http://localhost:8080`
- API Key: (gerada automaticamente)

Opcional (para tunnel Cloudflare já provisionado):

```powershell
.\SMagenda_Evolution_Windows_Installer.ps1 -CloudflareTunnelToken "SEU_TOKEN" -PublicApiUrl "https://evolution.seudominio.com"
```

Observação: o script consegue iniciar o cloudflared com um token, mas a URL pública depende do hostname configurado no Cloudflare Zero Trust para esse tunnel.

Observação importante sobre “precisei instalar Visual Studio”:

- Para rodar a Evolution via Docker, você não deveria precisar do Visual Studio.
- O que às vezes é necessário em algumas máquinas é algum requisito indireto do Docker/WSL (por exemplo, runtime do Windows/atualizações) ou o usuário instalou Visual Studio para obter ferramentas/terminais.
- Se você estava tentando rodar `npm install`/`npm run build` do frontend (SMagenda), aí sim pode aparecer exigência de “Build Tools” em Windows por causa de dependências nativas; isso é separado da Evolution.

Pré-requisitos:

- Windows 10/11 com virtualização habilitada na BIOS/UEFI.
- Docker Desktop (usa WSL2 por padrão).
- Espaço em disco para volumes (sessão + banco + redis).

Passo a passo:

1) Habilitar WSL2 (se ainda não tiver)

No PowerShell (Admin):

```powershell
wsl --install
```

Reinicie o Windows quando solicitado.

2) Instalar Docker Desktop

- Instale o Docker Desktop.
- Em Settings do Docker: confirme que está usando o backend WSL2.
- Inicie o Docker Desktop e confirme que ele está “Running”.

3) Preparar arquivos

- Crie uma pasta, por exemplo: `C:\evolution`.
- Copie o arquivo [docker-compose.evolution.yml](file:///c:/Users/Admin/Desktop/SMagenda/smagenda/docker-compose.evolution.yml) para essa pasta.
- Crie um arquivo `.env` na mesma pasta com as variáveis do item “4) Variáveis de ambiente (exemplo)”.

4) Subir os containers

Abra um PowerShell na pasta e execute:

```powershell
docker compose -f docker-compose.evolution.yml up -d
```

5) Verificar se está no ar

- Abra no navegador: `http://localhost:8080/` e confirme “Welcome to the Evolution API”.
- Ver logs:

```powershell
docker compose -f docker-compose.evolution.yml logs -f --tail=200 evolution-api
```

6) Expor uma URL pública (obrigatório para o SMagenda)

Mesmo rodando no Windows, o SMagenda chama a Evolution a partir do Supabase (nuvem). Portanto, `http://localhost:8080` não funciona no SMagenda.

Você precisa expor a porta 8080 para uma URL pública (ex.: via Cloudflare Tunnel/ngrok) e então usar essa URL pública no SMagenda.

Regras importantes:

- O proxy/tunnel precisa repassar o header `apikey` até a Evolution.
- Evite URLs temporárias para produção (quando mudar, precisa atualizar no SMagenda).

7) Evitar “cair” (importante no Windows)

- Desative suspensão/hibernação do PC, ou o tunnel + containers vão parar.
- Configure o Docker Desktop para iniciar com o Windows.

Quando usar Windows em produção (não recomendado):

- Somente se o usuário realmente precisa hospedar localmente e entende que precisa manter o PC ligado 24/7.

## 6) Expondo com URL pública (HTTPS recomendado)

O SMagenda rejeita URL local/privada. Você precisa de um endereço público.

Opções:

### Opção A — Nginx (porta 443)

- Rode a Evolution internamente na 8080 e publique no 443.
- Garanta que o Nginx repasse o header `apikey`.

Configuração mínima (exemplo conceitual):

- Proxy para `http://127.0.0.1:8080`
- Preserve headers, em especial `apikey`

### Opção B — Cloudflare Tunnel (quando não tem IP público)

- Funciona para expor a URL, mas precisa rodar 24/7.
- Se o tunnel cair, o SMagenda vai falhar com erro característico (1033).

Para produção, a correção permanente é manter:

- containers com `restart: always`
- processo do tunnel como serviço 24/7

## 7) Validação técnica (curl)

Troque `EVOLUTION_URL` e `EVOLUTION_AUTH_KEY` pelos seus valores.

1) Raiz:

```bash
curl -i https://EVOLUTION_URL/
```

2) Conexão (estado) de uma instância (exemplo `smagenda`):

```bash
curl -i \
  -H "apikey: EVOLUTION_AUTH_KEY" \
  https://EVOLUTION_URL/instance/connectionState/smagenda
```

Se vier `401`, a API Key não está batendo ou o proxy/tunnel está removendo o header `apikey`.

## 8) Configurando no SMagenda

Existem dois modos para apontar o SMagenda para a Evolution:

### 8.1) Configuração global (Super Admin)

1. Acesse o painel do Super Admin.
2. Em WhatsApp (config global), preencha:
   - API URL: a URL pública da Evolution (ex.: `https://evolution.seudominio.com`)
   - API Key: a mesma `EVOLUTION_AUTH_KEY` do container
3. Salve.
4. Conecte a instância (QR code) pelo próprio painel.

### 8.2) Gateway próprio por cliente (BYO Evolution)

Se o cliente tiver o próprio servidor:

1. No painel do cliente (Configurações > WhatsApp), preencha “Meu gateway (Evolution)” com:
   - API URL pública
   - API Key
2. Salve.

Quando preenchido, o SMagenda prioriza esse gateway por cliente em vez da configuração global.

## 9) Checklist de validação obrigatória (produção)

- Abrir a URL pública no navegador e confirmar “Welcome to the Evolution API”.
- Configurar URL/Key no SMagenda e salvar.
- Conectar WhatsApp (QR) e confirmar status como conectado.
- Enviar teste real pelo SMagenda e confirmar recebimento no WhatsApp de destino.
- Reiniciar containers (`docker compose restart`) e confirmar que a instância continua conectada.
- Reiniciar o host (se possível) e repetir a verificação de conexão.

## 10) Problemas comuns e correções

### 10.1) `401 Unauthorized`

- Confirme que `AUTHENTICATION_TYPE=apikey` e `AUTHENTICATION_API_KEY` no container.
- Confirme que o SMagenda está enviando pelo header `apikey` e que o proxy não remove esse header.

### 10.2) “URL não aponta para a Evolution” / rotas 404 / HTML

- A URL pública pode estar indo para o serviço errado, porta errada ou para uma página HTML do proxy.
- Acesse a URL no navegador: deve aparecer “Welcome to the Evolution API”.

### 10.3) Erro Cloudflare Tunnel 1033

- O tunnel/origem está offline.
- A correção permanente é manter o container e o tunnel rodando 24/7 como serviço.

### 10.4) Falha de rede / timeout

- Libere portas no firewall (se usar IP:porta).
- Prefira HTTPS/443 com proxy.
- Confirme latência/estabilidade do servidor.

### 10.5) Número “exists=false” / “Quote command returned error”

- Confirme telefone com DDD + 55 (ex.: `5531999999999`).
- Verifique logs da Evolution.
- Em alguns casos, atualizar `CONFIG_SESSION_PHONE_VERSION` ajuda quando o WhatsApp Web está desatualizado.

## 11) Operação e atualização

- Backups: faça backup dos volumes (instâncias, Postgres, Redis).
- Atualização: altere a tag da imagem (`evoapicloud/evolution-api:v2.3.7`) e reinicie com `docker compose pull && docker compose up -d`.
- Segurança: mantenha a API Key fora do código; use secrets/variáveis e rotacione a chave quando necessário.
