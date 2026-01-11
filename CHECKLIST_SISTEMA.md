# Checklist do Sistema (SMagenda)

## 0) Visão geral (tudo que existe no sistema)

- [ ] Frontend (SPA): Vite/React (`smagenda/package.json:6-11`).
- [ ] Backend (BaaS): Supabase (Auth + Postgres + Storage + Edge Functions).
- [ ] Integrações externas:
  - [ ] Stripe (assinatura no cartão + pagamento único PIX + taxa de agendamento em standby) (`smagenda/supabase/functions/payments/index.ts:293-408`, `smagenda/supabase/functions/payments/index.ts:883-1105`).
  - [ ] Evolution API (WhatsApp via QR/pareamento) (`smagenda/supabase/functions/whatsapp/index.ts`).
  - [ ] Resend (validação de domínio e envio de teste) (`smagenda/supabase/functions/resend-domain/index.ts:145`).
- [ ] Deploy do frontend:
  - [ ] Vercel com rewrite de SPA (`smagenda/vercel.json:1-3`).
  - [ ] Headers de cache para assets (`smagenda/public/_headers:1-8`).

## Documentação de produto

- [ ] Documento multi-modal (setores) e roadmap: `DOCUMENTACAO_MULTI_MODAL.md`.

## 1) Repositório e comandos

- [ ] Git: repositório inicializado na raiz e branch `main` pronta para push.
- [ ] Rodar local: `npm run dev` (Vite) (`smagenda/package.json:7-11`).
- [ ] Validar qualidade: `npm run lint` (ESLint) (`smagenda/package.json:8-10`).
- [ ] Validar build: `npm run build` (TypeScript + Vite) (`smagenda/package.json:8-10`).
- [ ] Preview do build: `npm run preview` (`smagenda/package.json:10-10`).

## 2) Frontend (Vite/React)

### 2.1) Variáveis de ambiente (dados reais)

- [ ] Definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (obrigatórias) (`smagenda/src/lib/supabase.ts:4-15`).
- [ ] Confirmar que, sem essas envs, o app bloqueia e mostra tela de “Configuração necessária” (`smagenda/src/main.tsx:11-44`).
- [ ] (Opcional) Definir `VITE_SUPPORT_WHATSAPP_NUMBER` para botão “Suporte WhatsApp” (apenas PRO/TEAM/ENTERPRISE) (`smagenda/src/components/layout/AppShell.tsx:13-58`).
- [ ] Confirmar que o JWT pertence ao mesmo projeto do Supabase (mismatch) (`smagenda/src/lib/supabase.ts:34-41`).
- [ ] (Standby) Definir `VITE_ENABLE_TAXA_AGENDAMENTO=1` para exibir/ativar a taxa de agendamento (`smagenda/src/views/app/ServicosPage.tsx:51-53`, `smagenda/src/views/public/PublicBookingPage.tsx:330-366`).

### 2.2) Rotas e papéis (RBAC)

- [ ] Conferir rotas públicas de agendamento:
  - [ ] `/agendar/:slug` (página pública) (`smagenda/src/App.tsx:34-36`).
  - [ ] `/agendar/:slug/:unidadeSlug` (multi-unidades) (`smagenda/src/App.tsx:34-36`).
- [ ] Conferir rotas de autenticação:
  - [ ] `/login`, `/cadastro` (`smagenda/src/App.tsx:37-40`).
  - [ ] `/esqueci-senha`, `/resetar-senha` (`smagenda/src/App.tsx:38-40`).
  - [ ] `/onboarding` (apenas `usuario`) (`smagenda/src/App.tsx:41-48`).
- [ ] Conferir rotas do app (apenas `usuario`):
  - [ ] `/dashboard`, `/servicos`, `/clientes`, `/clientes/:telefone`, `/relatorios`, `/pagamento`, `/funcionarios` (`smagenda/src/App.tsx:50-105`).
  - [ ] `/configuracoes/whatsapp`, `/configuracoes/mensagens`, `/configuracoes/pagina-publica` (`smagenda/src/App.tsx:106-129`).
- [ ] Conferir rota de funcionário (apenas `funcionario`):
  - [ ] `/funcionario/agenda` (`smagenda/src/App.tsx:130-137`).
- [ ] Conferir rotas do Super Admin (apenas `super_admin`):
  - [ ] `/admin/login`, `/admin/dashboard`, `/admin/clientes`, `/admin/clientes/:id`, `/admin/whatsapp`, `/admin/configuracoes`, `/admin/logs` (`smagenda/src/App.tsx:140-188`).
- [ ] Confirmar que `/admin/bootstrap` só existe em DEV (`smagenda/src/App.tsx:139-140`).

### 2.3) Autenticação, perfis e impersonação

- [ ] Perfis suportados: `usuario`, `funcionario`, `super_admin` (`smagenda/src/state/auth/types.ts:55-58`).
- [ ] Resolução do perfil:
  - [ ] Tenta `super_admin`, depois `funcionarios`, depois `usuarios` (`smagenda/src/state/auth/AuthProvider.tsx:88-116`).
  - [ ] Se não existir `usuarios`, chama RPC `ensure_usuario_profile` (`smagenda/src/state/auth/AuthProvider.tsx:117-125`).
- [ ] Impersonação (Super Admin “virar cliente”) salva em `localStorage` (`smagenda/src/state/auth/AuthProvider.tsx:135-205`).
- [ ] Bloqueio por cobrança (status/trial vencido) redireciona para `/pagamento` (`smagenda/src/state/auth/RequireAuth.tsx:101-174`).

### 2.4) Onboarding do cliente

- [ ] Etapa 1: horário/dias/intervalo + logo (Storage bucket `logos`) (`smagenda/src/views/auth/OnboardingPage.tsx:72-199`).
- [ ] Etapa 2: criação do primeiro serviço (`smagenda/src/views/auth/OnboardingPage.tsx:266-276`).
- [ ] Link público gerado: `${origin}/agendar/${slug}` (`smagenda/src/views/auth/OnboardingPage.tsx:44`).

### 2.5) Agenda (Dashboard)

- [ ] Criar/editar/cancelar agendamentos e bloqueios (UI principal) (`smagenda/src/views/app/DashboardPage.tsx`).
- [ ] Redirecionar checkout para `/pagamento` quando query tiver `checkout=success|cancel` (`smagenda/src/views/app/DashboardPage.tsx:264-265`).

### 2.5.1) Agenda do funcionário

- [ ] Funcionário pode ajustar o próprio horário (início/fim/dias/intervalo) e salvar via RPC `funcionario_update_horarios` (`smagenda/src/views/app/FuncionarioAgendaPage.tsx:793-824`).
- [ ] Card “Meu horário de funcionamento” fica no topo da tela do funcionário (`smagenda/src/views/app/FuncionarioAgendaPage.tsx:834-1000`).
- [ ] Bloqueio de horários do funcionário continua separado do ajuste de horário (UI e SQL) (`smagenda/src/views/app/FuncionarioAgendaPage.tsx`).

### 2.6) Serviços

- [ ] CRUD de serviços (preço/duração/cor) (`smagenda/src/views/app/ServicosPage.tsx`).
- [ ] (Standby) Taxa por serviço: UI/CRUD e leitura são liberadas só com `VITE_ENABLE_TAXA_AGENDAMENTO=1` (inclui fallback para não exigir coluna quando desligado) (`smagenda/src/views/app/ServicosPage.tsx:51-140`, `smagenda/src/views/app/ServicosPage.tsx:212-230`).
- [ ] (PRO+) Foto de serviço via Storage bucket `servicos` (políticas e trigger no SQL) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).

### 2.7) Funcionários

- [ ] CRUD de funcionários no app (`smagenda/src/views/app/FuncionariosPage.tsx`).
- [ ] Criação via Edge Function `create-funcionario` (`smagenda/src/views/app/FuncionariosPage.tsx:310`, `smagenda/supabase/functions/create-funcionario/index.ts:40-42`).
- [ ] Permissões por funcionário (flags no perfil) (`smagenda/src/state/auth/types.ts:33-45`).

### 2.8) Clientes e relatórios

- [ ] Listagem e resumo por telefone (`smagenda/src/views/app/ClientesPage.tsx`).
- [ ] Detalhes do cliente por `:telefone` (`smagenda/src/views/app/ClienteDetalhesPage.tsx`).
- [ ] Relatórios (export/financeiro) (`smagenda/src/views/app/RelatoriosPage.tsx`).

### 2.9) Configurações do cliente

- [ ] WhatsApp (conectar, status, desconectar, teste) (`smagenda/src/views/app/WhatsappSettingsPage.tsx`).
- [ ] Mensagens automáticas (templates e personalização) (`smagenda/src/views/app/MensagensSettingsPage.tsx:1-55`).
- [ ] Página pública: slug, cores, fundo, logo, tipo de negócio (`smagenda/src/views/app/PaginaPublicaSettingsPage.tsx:111-260`).

### 2.10) Página pública (agendamento)

- [ ] Carregar dados via RPCs públicas (link público) (`smagenda/src/views/public/PublicBookingPage.tsx:150-215`).
- [ ] Labels dinâmicos por `tipo_negocio` (`smagenda/src/views/public/PublicBookingPage.tsx:62-70`).
- [ ] Implementado labels e opções de `tipo_negocio` adicionais: manicure, pilates e faxina (`smagenda/src/views/public/PublicBookingPage.tsx`, `smagenda/src/views/app/PaginaPublicaSettingsPage.tsx`).
- [ ] Lava-jato: exigir placa e embutir no nome do cliente (compatibilidade) (`smagenda/src/views/public/PublicBookingPage.tsx:137-138`, `smagenda/src/views/public/PublicBookingPage.tsx:326-352`).
- [ ] (Standby) Cobrança de taxa no agendamento público (checkout + retorno `paid=1&session_id=...`) é habilitada por flag e usa a Edge Function `payments` (`smagenda/src/views/public/PublicBookingPage.tsx:333-862`, `smagenda/supabase/functions/payments/index.ts:883-1105`).

### 2.11) Super Admin (painel)

- [ ] Login Super Admin (`smagenda/src/views/admin/AdminLoginPage.tsx`).
- [ ] Dashboard (visão geral) (`smagenda/src/views/admin/AdminDashboardPage.tsx`).
- [ ] Lista de clientes + impersonação (`smagenda/src/views/admin/AdminClientesPage.tsx`).
- [ ] Detalhe do cliente + gerar checkout + criar funcionário (`smagenda/src/views/admin/AdminClienteDetalhesPage.tsx:246-248`, `smagenda/src/views/admin/AdminClienteDetalhesPage.tsx:478-481`).
- [ ] Avisos WhatsApp (broadcast) (`smagenda/src/views/admin/AdminWhatsappAvisosPage.tsx`).
- [ ] Configurações (SQL “fonte da verdade” + Resend DNS checker) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] Logs de auditoria (`smagenda/src/views/admin/AdminLogsPage.tsx`).

## 3) Supabase (Auth + Banco + Storage + RPC + RLS)

### 3.1) Supabase Auth (contas reais)

- [ ] Configurar Site URL e Redirect URLs para o domínio real do app (reset de senha e links de confirmação).
- [ ] Confirmar cadastro/login e status de confirmação consultando `/auth/v1/settings` (uso no frontend) (`smagenda/src/views/auth/CadastroPage.tsx:60-67`, `smagenda/src/views/auth/LoginPage.tsx:241-246`).

### 3.2) Schema/RLS: “fonte da verdade”

- [ ] Aplicar os blocos SQL exibidos em `/admin/configuracoes` (é o schema do projeto).
- [ ] Blocos relevantes (mínimo para rodar 100%):
  - [ ] SQL base (tabelas app + RLS + helpers como `is_super_admin`).
  - [ ] SQL do link público (listar + agendar) + grants para `anon`.
  - [ ] SQL do horário do funcionário: cria a função `public.funcionario_update_horarios(...)` e libera `execute` para `authenticated` (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx:2283-2366`).
  - [ ] (Standby) SQL da taxa de agendamento (créditos): adiciona `servicos.taxa_agendamento`, cria `taxa_agendamento_pagamentos` e atualiza RPCs públicas (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx:3378-3390`, `smagenda/src/views/admin/AdminConfiguracoesPage.tsx:777-923`).
  - [ ] SQL do Storage (logos) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
  - [ ] SQL do Storage (fotos de serviços) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
  - [ ] SQL de fotos nos serviços (PRO+) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
  - [ ] SQL WhatsApp (Super Admin / habilitação / automação / cron / triggers).
  - [ ] SQL Cobrança (cron diário + trigger de status).
  - [ ] SQL de Logs de Auditoria (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).

### 3.3) Tabelas principais (mínimo esperado)

- [ ] `public.usuarios` (perfil do cliente/empresa, plano, cobrança, configs, WhatsApp).
- [ ] `public.funcionarios` (perfil e permissões do funcionário).
- [ ] `public.servicos` (catálogo do cliente).
- [ ] `public.agendamentos` (agenda, status, flags de confirmação/lembrete).
- [ ] `public.bloqueios` (bloqueios de horário).
- [ ] `public.super_admin` (config global, inclusive Evolution API) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] `public.unidades` (multi-unidades ENTERPRISE) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] `public.audit_logs` (auditoria) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).

### 3.4) RPCs públicas (link público)

- [ ] `public_get_usuario_publico` (com `tipo_negocio` e unidade quando aplicável) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] `public_get_servicos_publicos`, `public_get_funcionarios_publicos`, `public_get_slots_publicos`, `public_create_agendamento_publico`.
- [ ] (Standby) `public_get_servicos_publicos` retorna `taxa_agendamento` quando o SQL da taxa foi aplicado (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx:897-923`).

### 3.5) Storage (dados reais)

- [ ] Bucket `logos` público com write restrito por `auth.uid()` (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] Bucket `servicos` público com write restrito por `auth.uid()` (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).

### 3.6) Multi-unidades (ENTERPRISE)

- [ ] Aplicar SQL de multi-unidades e validar rota `/agendar/:slug/:unidadeSlug` (`smagenda/src/App.tsx:34-36`).

## 4) Edge Functions (Supabase)

### 4.1) Regras gerais

- [ ] Deploy de todas as funções em `smagenda/supabase/functions/`.
- [ ] Confirmar `verify_jwt=false` nos `config.toml` (ex.: `smagenda/supabase/functions/payments/config.toml:1`).
- [ ] Definir secrets padrão (mínimo): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.

### 4.2) `payments` (Stripe)

- [ ] Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`/`APP_URL` (`smagenda/supabase/functions/payments/index.ts:293-310`, `smagenda/supabase/functions/payments/index.ts:598-600`).
- [ ] (Standby) Secret: `ENABLE_BOOKING_FEE=1` para liberar ações de taxa de agendamento e o processamento do webhook `kind=booking_fee` (`smagenda/supabase/functions/payments/index.ts:883-940`, `smagenda/supabase/functions/payments/index.ts:1084-1105`).
- [ ] Webhook Stripe apontando para `https://<PROJECT_REF>.supabase.co/functions/v1/payments`.
- [ ] Eventos mínimos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` (`smagenda/supabase/functions/payments/index.ts:332-408`).
- [ ] PIX (plano 30 dias): configurar `STRIPE_PRICE_<PLANO>_PIX` (Prices one-time em BRL) (`smagenda/supabase/functions/payments/index.ts:640`).
- [ ] UI cliente: botões “PIX (30 dias)” e “Cartão (assinatura)” (`smagenda/src/views/app/PagamentoPage.tsx:456-459`).
- [ ] Plano PRO: 4 profissionais inclusos + até 2 adicionais (máximo 6); acima disso, usar EMPRESA.
- [ ] Implementado PRO (4 inclusos, até 2 adicionais; máx 6): UI do cliente (`smagenda/src/views/app/PagamentoPage.tsx`) + UI do Super Admin (`smagenda/src/views/admin/AdminClienteDetalhesPage.tsx`) + validação/checkout na Edge Function (`smagenda/supabase/functions/payments/index.ts`).
- [ ] UI de planos: exibe aviso de pré-venda “válido até 08/02/2026” nos cards.
- [ ] UI Super Admin: gerar checkout PIX/cartão (`smagenda/src/views/admin/AdminClienteDetalhesPage.tsx:478-481`).

### 4.3) `whatsapp` (Evolution API)

- [ ] Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SERVICE_ROLE_KEY` (necessária para config global) (`smagenda/supabase/functions/whatsapp/index.ts`).
- [ ] Config global (Super Admin): preencher `super_admin.whatsapp_api_url` e `super_admin.whatsapp_api_key` via SQL + UI.
- [ ] Validar que a URL da Evolution é pública (não localhost/IP privado) (`smagenda/supabase/functions/whatsapp/index.ts`).

### 4.4) `whatsapp-lembretes` (cron + cobrança)

- [ ] Secret: `CRON_SECRET` (se definido, exige header `x-cron-secret`) (`smagenda/supabase/functions/whatsapp-lembretes/index.ts:406`).
- [ ] Validar SQL do cron (pg_cron) e triggers de confirmação/lembrete/billing em `/admin/configuracoes`.

### 4.5) `resend-domain` (Email)

- [ ] Secret: `RESEND_API_KEY` (`smagenda/supabase/functions/resend-domain/index.ts:145`).
- [ ] Validar domínio/DNS e enviar teste via checker no `/admin/configuracoes` (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).

### 4.6) `create-funcionario` / `admin-create-funcionario`

- [ ] Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY` (`smagenda/supabase/functions/create-funcionario/index.ts:40-42`, `smagenda/supabase/functions/admin-create-funcionario/index.ts:36-38`).
- [ ] Confirmar chamada do app e do admin:
  - [ ] App chama `/functions/v1/create-funcionario` (`smagenda/src/views/app/FuncionariosPage.tsx:310`).
  - [ ] Admin chama `admin-create-funcionario` via helper `callFn` (`smagenda/src/views/admin/AdminClienteDetalhesPage.tsx:246`).

## 5) Cobrança e bloqueio de acesso

- [ ] Bloqueio no frontend por `status_pagamento` e por trial vencido (`smagenda/src/state/auth/RequireAuth.tsx:101-174`).
- [ ] Stripe webhook atualiza: `usuarios.status_pagamento`, `usuarios.data_vencimento`, `usuarios.plano` (`smagenda/supabase/functions/payments/index.ts:332-408`).

## 6) WhatsApp (Evolution API) — Infra (dados reais)

- [ ] Subir Evolution API com persistência de sessão (QR não pode “sumir”).
- [ ] Confirmar volumes e serviços (api + postgres + redis) (`smagenda/docker-compose.evolution.yml:4-50`).
- [ ] Configurar variáveis do Docker conforme `docker-compose.evolution.yml` (`smagenda/docker-compose.evolution.yml:11-45`).
- [ ] Teste obrigatório de reinício: conectar 1 WhatsApp, reiniciar containers/host, confirmar que volta conectado.

## 7) Observabilidade, operação e segurança

- [ ] Logs de auditoria ativos e visíveis em `/admin/logs` (SQL `audit_logs`) (`smagenda/src/views/admin/AdminConfiguracoesPage.tsx`).
- [ ] Separar ambientes (DEV/PROD): cada frontend aponta para seu Supabase e Stripe correspondentes.
- [ ] Gerenciar secrets apenas via Supabase/Vercel (nunca em código).
- [ ] Backups/retention do Postgres do Supabase (ou estratégia equivalente).
- [ ] Confirmar headers/cache no deploy (assets com cache longo; HTML sem cache) (`smagenda/public/_headers:1-8`).

## 8) “Não usar simulação em produção”

- [ ] Stripe em modo Live: `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` do Live + webhook Live.
- [ ] PIX real habilitado no Stripe e Prices PIX reais configurados.
- [ ] Evolution API real: URL pública acessível e API Key correta.
- [ ] Storage real: buckets/policies reais no projeto Supabase de produção.
- [ ] (Standby) Só ativar taxa de agendamento após: aplicar o SQL da taxa + configurar Stripe Live + definir `VITE_ENABLE_TAXA_AGENDAMENTO=1` (frontend) e `ENABLE_BOOKING_FEE=1` (Edge Function) (`smagenda/src/views/public/PublicBookingPage.tsx:333-862`, `smagenda/supabase/functions/payments/index.ts:883-1105`).
