# 📱 SMagenda - Sistema de Agendamento Inteligente - Documentação Completa

## 🎯 Visão Geral do Produto

**Nome:** SMagenda  
**Proposta de Valor:** "Pare de perder dinheiro com clientes que não aparecem. Automatize lembretes e organize sua agenda em um só lugar."

**Diferencial Principal:** Sistema 100% mobile, link direto (sem necessidade de app), lembretes automáticos via WhatsApp e setup em menos de 10 minutos.

### Persona 4: **Dono de Barbearia com Equipe** ⭐ NOVO
- **Idade:** 30-50 anos
- **Dor:** Desorganização da equipe, não sabe quem atendeu quem, dificuldade de controlar horários
- **Comportamento:** Quer profissionalizar o negócio, precisa de controle sem microgerenciar
- **Onde encontrar:** Associações de barbearias, grupos no WhatsApp, eventos do setor
- **Ticket médio:** R$ 179-299/mês (maior valor!)

---

#### Tela 9: **Gestão de Funcionários** (Somente Master) ⭐ NOVO
**URL:** `/funcionarios`

**Layout:**
```
┌─────────────────────────────────────┐
│ [☰ Menu]  Funcionários    [+ Novo] │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 Carlos Silva           [✏️] ││
│  │ carlos@email.com                ││
│  │ 📱 (11) 98888-8888              ││
│  │                                 ││
│  │ 🟢 Ativo • Funcionário          ││
│  │ 📅 Atende: Seg-Sex 9h-18h       ││
│  │ ✂️ 23 agendamentos este mês      ││
│  │                                 ││
│  │ Permissões:                     ││
│  │ ✅ Ver agenda                   ││
│  │ ✅ Criar agendamentos           ││
│  │ ❌ Ver financeiro               ││
│  │ ❌ Gerenciar serviços           ││
│  │                                 ││
│  │ [Editar] [Desativar]            ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 Maria Santos           [✏️] ││
│  │ maria@email.com                 ││
│  │ 📱 (11) 97777-7777              ││
│  │                                 ││
│  │ 🟢 Ativo • Admin                ││
│  │ 📅 Atende: Ter-Sab 10h-19h      ││
│  │ ✂️ 31 agendamentos este mês      ││
│  │                                 ││
│  │ Permissões:                     ││
│  │ ✅ Ver agenda                   ││
│  │ ✅ Criar agendamentos           ││
│  │ ✅ Ver financeiro               ││
│  │ ✅ Gerenciar serviços           ││
│  │                                 ││
│  │ [Editar] [Desativar]            ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Modal de Adicionar Funcionário:**
```
┌─────────────────────────────────────┐
│ Adicionar Funcionário         [✕]  │
├─────────────────────────────────────┤
│                                     │
│ Dados Básicos:                     │
│ ┌─────────────────────────────┐    │
│ │ Nome completo               │    │
│ └─────────────────────────────┘    │
│                                     │
│ ┌─────────────────────────────┐    │
│ │ Email (para login)          │    │
│ └─────────────────────────────┘    │
│                                     │
│ ┌─────────────────────────────┐    │
│ │ (11) 9____-____             │    │
│ └─────────────────────────────┘    │
│                                     │
│ ┌─────────────────────────────┐    │
│ │ Senha inicial               │    │
│ └─────────────────────────────┘    │
│                                     │
│ Nível de Acesso:                   │
│ ( ) Admin - Acesso quase total     │
│ (•) Funcionário - Acesso limitado  │
│                                     │
│ Horário de Trabalho:               │
│ Das [09:00] às [18:00]             │
│ Dias: [S][T][Q][Q][S][S][D]        │
│                                     │
│ Permissões Detalhadas:             │
│ [✓] Ver agenda                     │
│ [✓] Criar agendamentos             │
│ [✓] Cancelar agendamentos          │
│ [✓] Bloquear horários próprios     │
│ [ ] Ver valores/financeiro         │
│ [ ] Gerenciar serviços             │
│ [ ] Ver clientes de outros         │
│                                     │
│      [Cancelar] [Criar Acesso]    │
└─────────────────────────────────────┘
```

---

#### Tela 10: **Dashboard do Funcionário** (Visão Limitada) ⭐ NOVO
**URL:** `/funcionario/agenda`

**Diferenças do Dashboard Master:**

```
┌─────────────────────────────────────┐
│ [☰ Menu]    SMagenda       [🔔][👤] │
│ Olá, Carlos! 👋                     │
├─────────────────────────────────────┤
│                                     │
│  [< Hoje - 25 Dez >]    [+ Novo]   │
│                                     │
│  🔍 Mostrando: Meus Agendamentos   │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 09:00 - João Silva            │ │
│  │ 📱 (11) 99999-9999            │ │
│  │ ✂️ Corte Masculino             │ │
│  │ [✓ Confirmar] [✗ Cancelar]   │ │
│  ├───────────────────────────────┤ │
│  │ 10:00 - LIVRE                 │ │
│  ├───────────────────────────────┤ │
│  │ 11:00 - Maria Santos          │ │
│  │ 📱 (11) 98888-8888            │ │
│  │ 💇 Escova                      │ │
│  │ ✅ Confirmado                 │ │
│  └───────────────────────────────┘ │
│                                     │
│  Resumo do Seu Dia:                │
│  ⏰ 5 agendamentos                  │
│  (valores ocultos)                 │
└─────────────────────────────────────┘
```

**Menu do Funcionário (Limitado):**
- 📅 Minha Agenda
- 👥 Meus Clientes (só os que ele atendeu)
- 🔒 Meus Horários Bloqueados
- ⚙️ Meu Perfil
- ❓ Ajuda
- 🚪 Sair

**O que o Funcionário NÃO vê:**
- ❌ Valores/receitas (a menos que tenha permissão)
- ❌ Agendamentos de outros funcionários
- ❌ Configurações do negócio
- ❌ Gestão de serviços (preços)
- ❌ Mensagens automáticas
- ❌ Evolution API
- ❌ Planos/pagamentos

---

#### Tela 11: **Agenda Completa do Dono** (Visão Master) ⭐ NOVO
**URL:** `/dashboard` (com filtros)

```
┌─────────────────────────────────────┐
│ [☰ Menu]    AgendaFácil    [🔔][👤] │
├─────────────────────────────────────┤
│                                     │
│  [< Hoje - 25 Dez >]    [+ Novo]   │
│                                     │
│  Filtrar por:                      │
│  [Todos] [Carlos] [Maria] [João]  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 09:00 👤 Carlos               │ │
│  │ Cliente: João Silva           │ │
│  │ ✂️ Corte - R$ 50               │ │
│  ├───────────────────────────────┤ │
│  │ 09:00 👤 Maria                │ │
│  │ Cliente: Ana Costa            │ │
│  │ 💇 Escova - R$ 40              │ │
│  ├───────────────────────────────┤ │
│  │ 10:00 👤 Carlos - LIVRE       │ │
│  ├───────────────────────────────┤ │
│  │ 10:00 👤 Maria                │ │
│  │ Cliente: Beatriz              │ │
│  │ 💅 Manicure - R$ 35            │ │
│  └───────────────────────────────┘ │
│                                     │
│  Resumo do Dia:                    │
│  💰 R$ 650,00 • 15 agendamentos    │
│  👤 Carlos: R$ 250 (5 clientes)   │
│  👤 Maria: R$ 400 (10 clientes)   │
└─────────────────────────────────────┘
```

---

### 👤 LADO DO CLIENTE (Página de Agendamento com Funcionários)

#### Tela 12: **Escolher Funcionário** ⭐ NOVO
**URL:** `/agendar/{slug}`

**Após escolher o serviço, antes da data:**

```
┌─────────────────────────────────────┐
│  [← Voltar]                        │
│                                     │
│  Com qual profissional?            │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ [Foto] Carlos Silva             ││
│  │ ⭐⭐⭐⭐⭐ (45 avaliações)        ││
│  │ Especialidade: Cortes modernos  ││
│  │ [Selecionar]                    ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ [Foto] Maria Santos             ││
│  │ ⭐⭐⭐⭐⭐ (62 avaliações)        ││
│  │ Especialidade: Coloração        ││
│  │ [Selecionar]                    ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 🤷 Tanto faz, primeiro disponível││
│  │ [Selecionar]                    ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

**Lógica:**
- Cliente escolhe o profissional OU "tanto faz"
- Sistema mostra horários apenas daquele profissional
- Se escolher "tanto faz", mostra TODOS os horários livres de qualquer um

---

## 🏗️ Arquitetura Técnica

### Stack Escolhida (100% Gratuita)

| Componente | Tecnologia | Custo | Limite Gratuito |
|------------|------------|-------|-----------------|
| **Frontend** | React + Vite + TailwindCSS | R$ 0 | Ilimitado |
| **Backend/BD** | Supabase | R$ 0 | 500MB BD + 2GB storage + 50k usuários |
| **Hospedagem** | Vercel | R$ 0 | 100GB bandwidth/mês |
| **WhatsApp** | Evolution API v2 | R$ 0 | Self-hosted (Railway free tier) |
| **Domínio** | Hostinger/Registro.br | R$ 40/ano | - |

### Tipo de Aplicação
**PWA (Progressive Web App)** - Funciona como site + app sem precisar de lojas

---

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

#### 1. **usuarios** (Profissionais - Conta Master)
```sql
id: UUID (PK)
nome_completo: TEXT
nome_negocio: TEXT
slug: TEXT (UNIQUE) -- ex: "barbearia-do-joao"
telefone: TEXT
email: TEXT (UNIQUE)
senha_hash: TEXT
foto_perfil: TEXT (URL)
endereco: TEXT (opcional)
horario_inicio: TIME -- ex: "08:00"
horario_fim: TIME -- ex: "18:00"
dias_trabalho: JSONB -- ex: [1,2,3,4,5,6] (seg a sab)
intervalo_inicio: TIME (opcional) -- ex: "12:00"
intervalo_fim: TIME (opcional) -- ex: "13:00"
whatsapp_api_url: TEXT (URL da Evolution API)
whatsapp_api_key: TEXT
plano: TEXT (free, basic, pro, team, enterprise)
tipo_conta: TEXT -- 'master', 'individual'
limite_funcionarios: INTEGER -- baseado no plano
status_pagamento: TEXT -- 'ativo', 'inadimplente', 'cancelado', 'trial'
data_cadastro: TIMESTAMP
data_vencimento: DATE -- próximo pagamento
ativo: BOOLEAN
```

#### 0. **super_admin** (VOCÊ - Administrador do Sistema) ⭐⭐ NOVO
```sql
id: UUID (PK)
nome: TEXT
email: TEXT (UNIQUE)
senha_hash: TEXT
nivel: TEXT -- 'super_admin', 'suporte'
ultimo_acesso: TIMESTAMP
criado_em: TIMESTAMP
```

#### 1.1. **funcionarios** (Sub-contas/Colaboradores) ⭐ NOVO
```sql
id: UUID (PK)
usuario_master_id: UUID (FK -> usuarios) -- dono do negócio
nome_completo: TEXT
email: TEXT (UNIQUE)
senha_hash: TEXT
telefone: TEXT
foto_perfil: TEXT (URL)
permissao: TEXT -- 'admin', 'funcionario'
horario_inicio: TIME -- horário de trabalho deste funcionário
horario_fim: TIME
dias_trabalho: JSONB
intervalo_inicio: TIME (opcional)
intervalo_fim: TIME (opcional)
pode_ver_financeiro: BOOLEAN -- se pode ver valores/receitas
pode_gerenciar_servicos: BOOLEAN
pode_bloquear_horarios: BOOLEAN
pode_cancelar_agendamentos: BOOLEAN
ativo: BOOLEAN
criado_em: TIMESTAMP
desativado_em: TIMESTAMP (nullable)
```

#### 2. **servicos**
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios)
nome: TEXT -- ex: "Corte Masculino"
descricao: TEXT (opcional)
duracao_minutos: INTEGER -- ex: 45
preco: DECIMAL(10,2)
cor: TEXT -- para visualização na agenda (ex: "#FF5733")
ativo: BOOLEAN
ordem: INTEGER -- para ordenar na listagem
```

#### 3. **agendamentos**
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios) -- dono do negócio
funcionario_id: UUID (FK -> funcionarios) -- quem vai atender ⭐ NOVO
servico_id: UUID (FK -> servicos)
cliente_nome: TEXT
cliente_telefone: TEXT
data: DATE
hora_inicio: TIME
hora_fim: TIME (calculado automaticamente)
status: TEXT -- 'confirmado', 'cancelado', 'concluido', 'nao_compareceu'
lembrete_enviado: BOOLEAN
data_lembrete: TIMESTAMP (quando foi enviado)
observacoes: TEXT (opcional)
criado_em: TIMESTAMP
criado_por: UUID -- pode ser usuario_id ou funcionario_id ⭐ NOVO
cancelado_em: TIMESTAMP (nullable)
cancelado_por: UUID (nullable) ⭐ NOVO
```

#### 4. **clientes** (Cache de clientes recorrentes)
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios)
nome: TEXT
telefone: TEXT
total_agendamentos: INTEGER
ultimo_agendamento: TIMESTAMP
criado_em: TIMESTAMP

UNIQUE(usuario_id, telefone)
```

#### 5. **bloqueios** (Horários bloqueados pelo profissional)
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios)
data: DATE
hora_inicio: TIME
hora_fim: TIME
motivo: TEXT (opcional) -- "Almoço", "Compromisso pessoal"
criado_em: TIMESTAMP
```

#### 6. **configuracoes_mensagens**
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios)
mensagem_confirmacao: TEXT
mensagem_lembrete: TEXT
horas_antecedencia: INTEGER -- default: 24
enviar_confirmacao: BOOLEAN
enviar_lembrete: BOOLEAN
```

#### 7. **logs_admin** (Auditoria das suas ações) ⭐⭐ NOVO
```sql
id: UUID (PK)
super_admin_id: UUID (FK -> super_admin)
usuario_afetado_id: UUID (FK -> usuarios) -- qual cliente foi afetado
acao: TEXT -- 'login_como_usuario', 'excluir_funcionario', 'alterar_plano', 'suspender_conta', 'reativar_conta'
detalhes: JSONB -- dados da ação
ip_address: TEXT
criado_em: TIMESTAMP
```

#### 8. **assinaturas** (Controle de pagamentos) ⭐⭐ NOVO
```sql
id: UUID (PK)
usuario_id: UUID (FK -> usuarios)
plano: TEXT
valor: DECIMAL(10,2)
status: TEXT -- 'ativa', 'cancelada', 'inadimplente', 'trial'
metodo_pagamento: TEXT -- 'cartao', 'boleto', 'pix'
data_inicio: DATE
data_vencimento: DATE
data_cancelamento: DATE (nullable)
gateway_subscription_id: TEXT -- ID do Stripe/Mercado Pago
criado_em: TIMESTAMP
```

---

## 🎨 Telas Detalhadas

---

## 🔧 PAINEL SUPER ADMIN (VOCÊ - Dono do Sistema) ⭐⭐ NOVO

### Tela SA-1: **Login Super Admin**
**URL:** `/admin/login`

```
┌─────────────────────────────────────┐
│                                     │
│         🛠️ SUPER ADMIN               │
│         SMagenda                    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Email                       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Senha                       │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Entrar no Painel Admin]         │
│                                     │
│  ⚠️ Acesso restrito                │
└─────────────────────────────────────┘
```

---

### Tela SA-2: **Dashboard Super Admin**
**URL:** `/admin/dashboard`

```
┌─────────────────────────────────────┐
│ [☰] SMagenda - Admin       [👤][🚪]│
├─────────────────────────────────────┤
│                                     │
│  📊 Visão Geral                    │
│                                     │
│  ┌──────┐  ┌──────┐  ┌──────┐     │
│  │  47  │  │ R$   │  │ 312  │     │
│  │Clien-│  │7.320 │  │Func. │     │
│  │tes   │  │ MRR  │  │Total │     │
│  └──────┘  └──────┘  └──────┘     │
│                                     │
│  ┌──────────────────┐  ┌─────────┐│
│  │ 🟢 38 ativos     │  │ Últimas ││
│  │ 🟡 5 trial       │  │ Ações:  ││
│  │ 🔴 4 inadimp.    │  │         ││
│  └──────────────────┘  │ • Login ││
│                        │   João  ││
│  Crescimento:          │         ││
│  📈 +12% este mês      │ • Plano ││
│                        │   Maria ││
│  Churn: 8%             │   ->PRO ││
│  ✅ Meta: <10%         │         ││
│                        └─────────┘│
└─────────────────────────────────────┘
```

**Menu Lateral:**
- 🏠 Dashboard
- 👥 Todos os Clientes
- 💰 Assinaturas
- 📊 Relatórios
- 🔍 Logs de Auditoria
- ⚙️ Configurações do Sistema
- 🚪 Sair

---

### Tela SA-3: **Lista de Clientes (Todos os Masters)**
**URL:** `/admin/clientes`

```
┌─────────────────────────────────────┐
│ [☰] Todos os Clientes              │
├─────────────────────────────────────┤
│                                     │
│ Buscar: [____________] [🔍]        │
│                                     │
│ Filtros:                           │
│ [Todos] [Ativos] [Trial] [Inadimp]│
│ [Free] [Basic] [Pro] [Team] [Ent] │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🟢 Barbearia do João            ││
│ │ João Silva • joao@email.com     ││
│ │ 📱 (11) 99999-9999              ││
│ │                                 ││
│ │ Plano: PRO (R$ 99,90/mês)      ││
│ │ Status: ✅ Ativo                ││
│ │ Venc: 05/01/2026                ││
│ │ Funcionários: 2/2               ││
│ │ Agendamentos: 234 (total)       ││
│ │ Cadastro: 15/08/2025            ││
│ │                                 ││
│ │ [🔐 Logar Como] [✏️ Editar]    ││
│ │ [📊 Detalhes] [⚠️ Suspender]   ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🟡 Salão da Maria               ││
│ │ Maria Santos • maria@email.com  ││
│ │ 📱 (11) 98888-8888              ││
│ │                                 ││
│ │ Plano: TRIAL → PRO              ││
│ │ Status: ⏳ Trial (5 dias rest.) ││
│ │ Venc: 30/12/2025                ││
│ │ Funcionários: 1/2               ││
│ │ Agendamentos: 23 (trial)        ││
│ │ Cadastro: 20/12/2025            ││
│ │                                 ││
│ │ [🔐 Logar Como] [✏️ Editar]    ││
│ │ [📊 Detalhes] [💰 Cobrar]      ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🔴 Studio de Tatuagem           ││
│ │ Carlos Mendes • carlos@email.com││
│ │ 📱 (11) 97777-7777              ││
│ │                                 ││
│ │ Plano: TEAM (R$ 179,90/mês)    ││
│ │ Status: ⚠️ Inadimplente (12d)  ││
│ │ Venc: 13/12/2025                ││
│ │ Funcionários: 4/5 (bloqueados) ││
│ │ Agendamentos: 567 (total)       ││
│ │ Cadastro: 03/05/2025            ││
│ │                                 ││
│ │ [🔐 Logar Como] [✏️ Editar]    ││
│ │ [📧 Enviar Cobrança] [❌ Canc.]││
│ └─────────────────────────────────┘│
│                                     │
│ Mostrando 3 de 47 clientes         │
│ [← 1 2 3 4 5 →]                   │
└─────────────────────────────────────┘
```

---

### Tela SA-4: **Detalhes do Cliente**
**URL:** `/admin/clientes/{id}`

```
┌─────────────────────────────────────┐
│ [← Voltar] Barbearia do João       │
├─────────────────────────────────────┤
│                                     │
│ 👤 Informações do Dono              │
│ ┌─────────────────────────────────┐│
│ │ Nome: João Silva                ││
│ │ Email: joao@email.com           ││
│ │ Telefone: (11) 99999-9999       ││
│ │ Slug: barbearia-do-joao         ││
│ │ Link: smagenda.com/...          ││
│ │ Cadastro: 15/08/2025            ││
│ │ Último acesso: Há 2 horas       ││
│ └─────────────────────────────────┘│
│                                     │
│ 💳 Assinatura                       │
│ ┌─────────────────────────────────┐│
│ │ Plano: PRO                      ││
│ │ Valor: R$ 99,90/mês             ││
│ │ Status: 🟢 Ativo                ││
│ │ Próximo venc: 05/01/2026        ││
│ │ Método: Cartão (••4532)         ││
│ │ [Alterar Plano] [Ver Histórico]││
│ └─────────────────────────────────┘│
│                                     │
│ 👥 Funcionários (2/2 permitidos)    │
│ ┌─────────────────────────────────┐│
│ │ • Carlos Silva (Funcionário)    ││
│ │   carlos@email.com              ││
│ │   [Ver] [❌ Excluir]            ││
│ │                                 ││
│ │ • Ana Costa (Admin)             ││
│ │   ana@email.com                 ││
│ │   [Ver] [❌ Excluir]            ││
│ └─────────────────────────────────┘│
│                                     │
│ 📊 Estatísticas                     │
│ ┌─────────────────────────────────┐│
│ │ • 234 agendamentos (total)      ││
│ │ • 187 agendamentos (últimos 30d)││
│ │ • 12 clientes cadastrados       ││
│ │ • 5 serviços ativos             ││
│ │ • Taxa no-show: 8%              ││
│ │ • WhatsApp conectado: ✅        ││
│ └─────────────────────────────────┘│
│                                     │
│ 🛠️ Ações Administrativas            │
│ ┌─────────────────────────────────┐│
│ │ [🔐 Logar como este usuário]   ││
│ │ [✏️ Editar dados]               ││
│ │ [📝 Adicionar observação]       ││
│ │ [⬆️ Upgrade de plano]           ││
│ │ [⬇️ Downgrade de plano]         ││
│ │ [⏸️ Suspender temporariamente]  ││
│ │ [❌ Cancelar assinatura]        ││
│ │ [🔄 Resetar senha]              ││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

### Tela SA-5: **Logar Como Cliente** (Impersonation)
**URL:** Ação que redireciona para `/dashboard`

**Fluxo:**
```
1. Você clica em "Logar Como" no painel admin

2. Sistema registra no log:
   - Quem: seu email admin
   - Quando: timestamp
   - Cliente: qual conta acessou
   - IP: seu endereço IP

3. Você é redirecionado para o dashboard DO CLIENTE
   - Vê exatamente o que ele vê
   - Pode fazer tudo que ele pode

4. Banner de alerta aparece no topo:
   ┌─────────────────────────────────────┐
   │ ⚠️ MODO ADMIN: Você está logado    │
   │ como "João Silva"                   │
   │ [🚪 Voltar ao Admin]               │
   └─────────────────────────────────────┘

5. Pode:
   - Ver agenda dele
   - Acessar funcionários dele
   - Excluir funcionários se necessário
   - Testar funcionalidades
   - Resolver problemas

6. Ao clicar "Voltar ao Admin":
   - Sistema registra saída no log
   - Você volta para seu painel admin
```

---

### Tela SA-6: **Gerenciar Funcionários do Cliente**
**URL:** `/admin/clientes/{id}/funcionarios`

```
┌─────────────────────────────────────┐
│ [← Voltar] Funcionários             │
│ Barbearia do João                   │
├─────────────────────────────────────┤
│                                     │
│ Plano atual: PRO (2/2 funcionários) │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 👤 Carlos Silva                 ││
│ │ carlos@email.com                ││
│ │ 📱 (11) 98888-8888              ││
│ │                                 ││
│ │ Tipo: Funcionário               ││
│ │ Status: 🟢 Ativo                ││
│ │ Cadastrado: 20/08/2025          ││
│ │ Último acesso: Há 3 horas       ││
│ │ Agendamentos: 89 (total)        ││
│ │                                 ││
│ │ Permissões:                     ││
│ │ ✅ Ver agenda                   ││
│ │ ✅ Criar agendamentos           ││
│ │ ❌ Ver financeiro               ││
│ │                                 ││
│ │ [✏️ Editar] [❌ Excluir]       ││
│ │ [⏸️ Desativar] [🔄 Resetar Senha]││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 👤 Ana Costa                    ││
│ │ ana@email.com                   ││
│ │ 📱 (11) 97777-7777              ││
│ │                                 ││
│ │ Tipo: Admin                     ││
│ │ Status: 🟢 Ativo                ││
│ │ Cadastrado: 15/09/2025          ││
│ │ Último acesso: Há 1 dia         ││
│ │ Agendamentos: 45 (total)        ││
│ │                                 ││
│ │ Permissões:                     ││
│ │ ✅ Ver agenda                   ││
│ │ ✅ Criar agendamentos           ││
│ │ ✅ Ver financeiro               ││
│ │ ✅ Gerenciar serviços           ││
│ │                                 ││
│ │ [✏️ Editar] [❌ Excluir]       ││
│ │ [⏸️ Desativar] [🔄 Resetar Senha]││
│ └─────────────────────────────────┘│
│                                     │
│ ⚠️ Limite atingido (2/2)            │
│ Para adicionar mais funcionários,   │
│ upgrade para TEAM necessário.       │
│                                     │
│ [⬆️ Fazer Upgrade para TEAM]       │
└─────────────────────────────────────┘
```

**Ao clicar em "Excluir Funcionário":**
```
┌─────────────────────────────────────┐
│ ⚠️ Confirmar Exclusão               │
├─────────────────────────────────────┤
│                                     │
│ Você está prestes a EXCLUIR:       │
│                                     │
│ 👤 Carlos Silva                     │
│ carlos@email.com                    │
│                                     │
│ ⚠️ ATENÇÃO:                         │
│ • 89 agendamentos vinculados a ele │
│ • Agendamentos futuros (12) serão  │
│   mantidos mas sem responsável     │
│ • Histórico será preservado        │
│ • Ação irreversível                │
│                                     │
│ Motivo (opcional):                 │
│ ┌─────────────────────────────┐   │
│ │ Ex: Saiu da empresa         │   │
│ └─────────────────────────────┘   │
│                                     │
│ [Cancelar] [❌ Confirmar Exclusão] │
└─────────────────────────────────────┘
```

---

### Tela SA-7: **Alterar Plano do Cliente**
**URL:** Modal em `/admin/clientes/{id}`

```
┌─────────────────────────────────────┐
│ Alterar Plano - Barbearia do João  │
├─────────────────────────────────────┤
│                                     │
│ Plano Atual: PRO (R$ 99,90/mês)    │
│                                     │
│ Escolha o novo plano:              │
│                                     │
│ ( ) FREE                           │
│     R$ 0 • 30 agends/mês • 0 func  │
│                                     │
│ ( ) BASIC                          │
│     R$ 59,90 • Ilimitado • 0 func  │
│                                     │
│ (•) PRO (atual)                    │
│     R$ 99,90 • Ilimitado • 2 func  │
│                                     │
│ ( ) TEAM                           │
│     R$ 179,90 • Ilimitado • 5 func │
│                                     │
│ ( ) ENTERPRISE                     │
│     R$ 299,90 • Ilimitado • ∞ func │
│                                     │
│ ⚠️ Atenção ao mudar:                │
│ • Downgrade: funcionalidades podem │
│   ser bloqueadas imediatamente     │
│ • Upgrade: cobra diferença propor- │
│   cional no próximo venc.          │
│                                     │
│ Motivo da alteração:               │
│ ┌─────────────────────────────┐   │
│ │ Cliente solicitou upgrade   │   │
│ └─────────────────────────────┘   │
│                                     │
│ [Cancelar] [Confirmar Alteração]  │
└─────────────────────────────────────┘
```

---

### Tela SA-8: **Logs de Auditoria**
**URL:** `/admin/logs`

```
┌─────────────────────────────────────┐
│ [☰] Logs de Auditoria              │
├─────────────────────────────────────┤
│                                     │
│ Filtros:                           │
│ [Todas Ações] [Últimos 7 dias]     │
│                                     │
│ Buscar: [____________] [🔍]        │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🔐 LOGIN COMO USUÁRIO            ││
│ │ 25/12/2025 14:32                ││
│ │                                 ││
│ │ Admin: voce@admin.com           ││
│ │ Cliente: João Silva             ││
│ │ (Barbearia do João)             ││
│ │ IP: 192.168.1.100               ││
│ │ Duração: 8 minutos              ││
│ │                                 ││
│ │ [Ver Detalhes]                  ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ❌ EXCLUIR FUNCIONÁRIO           ││
│ │ 25/12/2025 11:15                ││
│ │                                 ││
│ │ Admin: voce@admin.com           ││
│ │ Cliente: Maria Santos           ││
│ │ Funcionário: Pedro Costa        ││
│ │ Motivo: "Saiu da empresa"       ││
│ │ IP: 192.168.1.100               ││
│ │                                 ││
│ │ [Ver Detalhes]                  ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ⬆️ ALTERAR PLANO                ││
│ │ 24/12/2025 16:45                ││
│ │                                 ││
│ │ Admin: voce@admin.com           ││
│ │ Cliente: Carlos Mendes          ││
│ │ De: BASIC → Para: PRO           ││
│ │ Motivo: "Cliente solicitou"     ││
│ │ IP: 192.168.1.100               ││
│ │                                 ││
│ │ [Ver Detalhes]                  ││
│ └─────────────────────────────────┘│
│                                     │
│ Mostrando 3 de 127 registros       │
│ [← 1 2 3 4 5 →]                   │
└─────────────────────────────────────┘
```

---

### Tela SA-9: **Configurações do Sistema**
**URL:** `/admin/configuracoes`

```
┌─────────────────────────────────────┐
│ [☰] Configurações do Sistema       │
├─────────────────────────────────────┤
│                                     │
│ 🎨 Planos e Limites                │
│ ┌─────────────────────────────────┐│
│ │ FREE:                           ││
│ │ Agendamentos/mês: [30]          ││
│ │ Funcionários: [0]               ││
│ │                                 ││
│ │ BASIC: R$ [59.90]               ││
│ │ Agendamentos/mês: [Ilimitado]   ││
│ │ Funcionários: [0]               ││
│ │                                 ││
│ │ PRO: R$ [99.90]                 ││
│ │ Agendamentos/mês: [Ilimitado]   ││
│ │ Funcionários: [2]               ││
│ │                                 ││
│ │ TEAM: R$ [179.90]               ││
│ │ Funcionários: [5]               ││
│ │                                 ││
│ │ ENTERPRISE: R$ [299.90]         ││
│ │ Funcionários: [Ilimitado]       ││
│ │                                 ││
│ │ [Salvar Alterações]             ││
│ └─────────────────────────────────┘│
│                                     │
│ 💳 Gateways de Pagamento            │
│ ┌─────────────────────────────────┐│
│ │ [ ] Stripe                      ││
│ │     API Key: [___________]      ││
│ │                                 ││
│ │ [✓] Mercado Pago                ││
│ │     Access Token: [•••••••••]   ││
│ │     Status: 🟢 Conectado        ││
│ │                                 ││
│ │ [Salvar]                        ││
│ └─────────────────────────────────┘│
│                                     │
│ 📧 Email/Notificações               │
│ ┌─────────────────────────────────┐│
│ │ Email de suporte:               ││
│ │ [suporte@smagenda.com]          ││
│ │                                 ││
│ │ [✓] Notificar novos cadastros  ││
│ │ [✓] Alertas de inadimplência   ││
│ │ [✓] Resumo diário (9h)          ││
│ │                                 ││
│ │ [Salvar]                        ││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## 📱 LADO DO PROFISSIONAL (Dashboard)

#### Tela 1: **Login/Cadastro**
**URL:** `/login` e `/cadastro`

**Campos de Cadastro:**
- Nome completo
- Nome do negócio
- Telefone (com WhatsApp)
- Email
- Senha
- Slug personalizado (ex: "joao-barbeiro") - auto-gerado mas editável

**Layout:**
- Logo centralizado
- Formulário limpo
- Botão "Criar conta grátis"
- Link "Já tenho conta"

---

#### Tela 2: **Onboarding (Pós-cadastro)**
**URL:** `/onboarding`

**Etapa 1 - Horário de Funcionamento:**
- Seletor de horário início (ex: 08:00)
- Seletor de horário fim (ex: 18:00)
- Checkbox dos dias da semana
- Intervalo (opcional): início e fim

**Etapa 2 - Primeiro Serviço:**
- Nome do serviço
- Duração (em minutos)
- Preço
- Botão "Adicionar mais serviços depois"

**Etapa 3 - Configurar WhatsApp:**
- Opções:
  - [ ] "Enviar manualmente por enquanto" (gera link do WhatsApp)
  - [ ] "Configurar Evolution API agora" (mostra tutorial)
- Link do tutorial: como instalar Evolution API no Railway (gratuito)

**Etapa 4 - Pronto!:**
- Mostra o link de agendamento: `agendafacil.com/joao-barbeiro`
- Botão "Copiar link"
- Botão "Compartilhar no WhatsApp"
- Botão "Ir para minha agenda"

---

#### Tela 3: **Dashboard Principal (Agenda)**
**URL:** `/dashboard`

**Layout:**
```
┌─────────────────────────────────────┐
│ [☰ Menu]    AgendaFácil    [🔔][👤] │
├─────────────────────────────────────┤
│                                     │
│  [< Hoje - 25 Dez >]    [+ Novo]   │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 08:00 - LIVRE                 │ │
│  ├───────────────────────────────┤ │
│  │ 09:00 - João Silva            │ │
│  │ 📱 (11) 99999-9999            │ │
│  │ ✂️ Corte Masculino - R$ 50    │ │
│  │ [✓ Confirmar] [✗ Cancelar]   │ │
│  ├───────────────────────────────┤ │
│  │ 10:00 - LIVRE                 │ │
│  ├───────────────────────────────┤ │
│  │ 11:00 - Maria Santos          │ │
│  │ 📱 (11) 98888-8888            │ │
│  │ 💇 Escova - R$ 40             │ │
│  │ ✅ Confirmado                 │ │
│  ├───────────────────────────────┤ │
│  │ 12:00 - 🔒 BLOQUEADO (Almoço)│ │
│  └───────────────────────────────┘ │
│                                     │
│  Resumo do Dia:                    │
│  💰 R$ 250,00 • 5 agendamentos     │
└─────────────────────────────────────┘
```

**Funcionalidades:**
- Navegação entre dias (setas < >)
- Visualização semanal (toggle)
- Cards de agendamento clicáveis
- Status visual com cores
- Botão flutuante "+ Novo Agendamento"
- Filtro rápido: "Todos", "Confirmados", "Pendentes"

---

#### Tela 4: **Menu Lateral**
**URL:** Slide-in menu

**Itens:**
- 📅 Agenda (tela principal)
- ✂️ Meus Serviços
- 👥 Clientes
- 👨‍💼 Funcionários (só para Master/Admin) ⭐ NOVO
- 🔗 Meu Link de Agendamento
- ⚙️ Configurações
- 💬 Mensagens Automáticas
- 📊 Relatórios (futuro)
- 🎨 Personalizar Página
- ❓ Ajuda
- 🚪 Sair

---

#### Tela 5: **Meus Serviços**
**URL:** `/servicos`

**Layout:**
- Lista de cards de serviços
- Cada card mostra:
  - Nome do serviço
  - Duração e preço
  - Toggle ativo/inativo
  - Ícone de editar e deletar
- Botão "+ Adicionar Serviço"
- Drag-and-drop para reordenar (mobile friendly)

**Modal de Adicionar/Editar:**
- Nome
- Descrição (opcional)
- Duração (em minutos)
- Preço
- Cor (seletor visual)
- Toggle "Ativo"

---

#### Tela 6: **Configurações de WhatsApp**
**URL:** `/configuracoes/whatsapp`

**Seção 1 - Status da Conexão:**
```
┌─────────────────────────────────────┐
│ Status: 🟢 Conectado                │
│ Instância: minha-barbearia          │
│ Número: +55 11 99999-9999           │
│ [Desconectar] [Testar Envio]       │
└─────────────────────────────────────┘
```

**Seção 2 - Configurar Evolution API:**
- Campo: URL da API (ex: `https://sua-instancia.railway.app`)
- Campo: API Key
- Botão "Conectar"
- Link: "Não tem Evolution API? Veja como criar grátis"

**Seção 3 - Preferências de Envio:**
- Toggle: "Enviar confirmação ao agendar"
- Toggle: "Enviar lembrete automático"
- Slider: "Enviar lembrete X horas antes" (4h a 72h)

---

#### Tela 7: **Mensagens Automáticas**
**URL:** `/configuracoes/mensagens`

**Mensagem de Confirmação:**
```
┌─────────────────────────────────────┐
│ Olá {nome}! 👋                      │
│                                     │
│ Seu agendamento foi confirmado:    │
│ 📅 {data} às {hora}                 │
│ ✂️ {servico}                        │
│ 💰 {preco}                          │
│                                     │
│ Local: {endereco}                  │
│                                     │
│ Nos vemos em breve!                │
│ {nome_negocio}                     │
│                                     │
│ [Editar Mensagem]                  │
└─────────────────────────────────────┘
```

**Mensagem de Lembrete:**
```
┌─────────────────────────────────────┐
│ Oi {nome}! 🔔                       │
│                                     │
│ Lembrete: você tem agendamento     │
│ AMANHÃ às {hora}                   │
│                                     │
│ Se não puder comparecer, me avise! │
│ {telefone_profissional}            │
│                                     │
│ [Editar Mensagem]                  │
└─────────────────────────────────────┘
```

**Variáveis disponíveis:**
- {nome} - nome do cliente
- {data} - data do agendamento
- {hora} - horário
- {servico} - nome do serviço
- {preco} - valor
- {endereco} - endereço do profissional
- {nome_negocio} - nome do negócio

---

### 👤 LADO DO CLIENTE (Página de Agendamento)

#### Tela 8: **Página Pública de Agendamento**
**URL:** `/agendar/{slug}` ex: `/agendar/joao-barbeiro`

**Layout:**
```
┌─────────────────────────────────────┐
│  [Foto]                            │
│  Barbearia do João                 │
│  ⭐⭐⭐⭐⭐ (23 avaliações)          │
│  📍 Rua das Flores, 123            │
│                                     │
├─────────────────────────────────────┤
│ Escolha o serviço:                 │
│                                     │
│ [✂️ Corte Masculino                │
│  ⏱️ 45 min • 💰 R$ 50,00 ]         │
│                                     │
│ [💇 Barba                           │
│  ⏱️ 30 min • 💰 R$ 35,00 ]         │
│                                     │
│ [🎨 Corte + Barba (COMBO)          │
│  ⏱️ 1h 15min • 💰 R$ 75,00 ]       │
│                                     │
└─────────────────────────────────────┘
```

**Após selecionar serviço → Tela de Data:**
```
┌─────────────────────────────────────┐
│  [← Voltar]                        │
│                                     │
│  Escolha a data:                   │
│                                     │
│  [ Dezembro 2025 ]                 │
│                                     │
│  D  S  T  Q  Q  S  S              │
│     1  2  3  4  5  6              │
│  7  8  9 10 11 12 13              │
│ 14 15 16 17 18 19 20              │
│ 21 22 23 24[25]26 27              │
│ 28 29 30 31                        │
│                                     │
│  Dias com ❌ estão indisponíveis   │
└─────────────────────────────────────┘
```

**Após selecionar data → Tela de Horário:**
```
┌─────────────────────────────────────┐
│  [← Voltar]                        │
│                                     │
│  Horários disponíveis:             │
│  25 de Dezembro                    │
│                                     │
│  Manhã:                            │
│  [08:00] [09:00] [10:00] [11:00]  │
│                                     │
│  Tarde:                            │
│  [14:00] [15:00] [16:00] [17:00]  │
│                                     │
│  (12:00 e 13:00 indisponíveis)    │
└─────────────────────────────────────┘
```

**Após selecionar horário → Tela de Dados:**
```
┌─────────────────────────────────────┐
│  [← Voltar]                        │
│                                     │
│  Resumo do Agendamento:            │
│  ✂️ Corte Masculino                 │
│  📅 25/12/2025 às 09:00            │
│  💰 R$ 50,00                        │
│                                     │
│  Seus dados:                       │
│  ┌─────────────────────────────┐  │
│  │ Nome completo               │  │
│  └─────────────────────────────┘  │
│                                     │
│  ┌─────────────────────────────┐  │
│  │ (11) 9____-____             │  │
│  └─────────────────────────────┘  │
│                                     │
│  [ ] Já sou cliente               │
│                                     │
│  [Confirmar Agendamento]          │
│                                     │
│  Você receberá uma confirmação    │
│  no WhatsApp 📱                    │
└─────────────────────────────────────┘
```

**Tela de Sucesso:**
```
┌─────────────────────────────────────┐
│         ✅                          │
│                                     │
│  Agendamento Confirmado!           │
│                                     │
│  João Silva, seu horário está     │
│  garantido!                        │
│                                     │
│  📅 25 de Dezembro às 09:00        │
│  ✂️ Corte Masculino                 │
│  📍 Rua das Flores, 123            │
│                                     │
│  Você receberá:                    │
│  • Confirmação agora no WhatsApp  │
│  • Lembrete 24h antes             │
│                                     │
│  [Adicionar ao Calendário]        │
│  [Voltar ao Início]               │
│                                     │
│  Precisa cancelar?                 │
│  Fale com João: (11) 99999-9999   │
└─────────────────────────────────────┘
```

---

## 🤖 Integração com Evolution API (WhatsApp)

### Como Funciona a Automação

#### 1. **Setup da Evolution API (Gratuito)**

**Opções de Hospedagem:**
- **Railway** (recomendado): 500h gratuitas/mês
- **Render**: 750h gratuitas/mês
- **VPS própria**: $5-10/mês (alternativa)

**Instalação no Railway:**
```bash
1. Criar conta no Railway (railway.app)
2. Usar template da Evolution API:
   - GitHub: https://github.com/EvolutionAPI/evolution-api
3. Clicar em "Deploy"
4. Configurar variáveis de ambiente:
   - AUTHENTICATION_API_KEY=sua-chave-secreta-aqui
   - DATABASE_PROVIDER=postgresql
5. Deploy automático em ~3 minutos
6. Copiar URL: https://seu-app.railway.app
```

#### 2. **Conectar Instância no Sistema**

**Fluxo no Dashboard:**
```
Profissional → Configurações → WhatsApp
↓
Informar URL da Evolution API + API Key
↓
Sistema testa conexão (endpoint /instance/connect)
↓
Gera QR Code para conectar WhatsApp
↓
Profissional escaneia com WhatsApp
↓
✅ Conectado!
```

#### 3. **Endpoints Utilizados**

**a) Criar/Conectar Instância:**
```javascript
POST /instance/create
{
  "instanceName": "barbearia-joao",
  "token": "sua-chave-api",
  "qrcode": true
}

// Retorna QR Code para conectar
```

**b) Enviar Mensagem de Confirmação:**
```javascript
POST /message/sendText/{instanceName}
{
  "number": "5511999999999",
  "text": "Olá João Silva! 👋\n\nSeu agendamento foi confirmado:\n📅 25/12/2025 às 09:00\n✂️ Corte Masculino\n💰 R$ 50,00\n\nNos vemos em breve!\nBarbearia do João"
}
```

**c) Agendar Lembrete (usando cron job):**
```javascript
// No backend, criar job agendado:
// Verifica a cada 1 hora se há agendamentos nas próximas 24h

SELECT * FROM agendamentos 
WHERE data = CURRENT_DATE + 1
  AND lembrete_enviado = false
  AND status = 'confirmado'

// Para cada agendamento encontrado:
POST /message/sendText/{instanceName}
{
  "number": "5511999999999",
  "text": "Oi João Silva! 🔔\n\nLembrete: você tem agendamento AMANHÃ às 09:00\n\nSe não puder comparecer, me avise!\n(11) 98888-8888"
}

// Após enviar, marcar lembrete_enviado = true
```

#### 4. **Fallback Manual (Caso Evolution API não esteja configurada)**

**Quando profissional não tem WhatsApp automatizado:**

```javascript
// Sistema gera link do WhatsApp Web com mensagem pronta

function gerarLinkWhatsApp(agendamento) {
  const numero = agendamento.cliente_telefone.replace(/\D/g, '');
  const mensagem = encodeURIComponent(
    `Olá ${agendamento.cliente_nome}! 👋\n\n` +
    `Seu agendamento foi confirmado:\n` +
    `📅 ${agendamento.data} às ${agendamento.hora_inicio}\n` +
    `✂️ ${agendamento.servico.nome}\n` +
    `💰 R$ ${agendamento.servico.preco}\n\n` +
    `Nos vemos em breve!\n` +
    `${usuario.nome_negocio}`
  );
  
  return `https://wa.me/55${numero}?text=${mensagem}`;
}

// No dashboard, mostrar:
// "Clique para enviar confirmação: [Abrir WhatsApp]"
```

---

## ⚙️ Funcionalidades Avançadas (Diferenciais)

### 1. **Sistema de Notificações Inteligentes**
- Envio automático de confirmação (imediato)
- Lembrete 24h antes (padrão, configurável)
- Lembrete 2h antes (opcional)
- Mensagem de agradecimento pós-atendimento (opcional)

### 2. **Gestão de No-Shows**
- Marcar cliente como "não compareceu"
- Sistema sugere enviar mensagem automática perguntando motivo
- Histórico de no-shows por cliente
- Opção de pedir confirmação prévia para clientes com histórico

### 3. **Bloqueios e Disponibilidade**
- Bloquear horários pontuais (almoço, compromissos)
- Bloquear dias inteiros (férias, feriados)
- Bloqueios recorrentes (ex: toda segunda 12h-13h)

### 4. **Clientes Recorrentes**
- Sistema reconhece telefone do cliente
- Autopreenchimento de dados
- Histórico de agendamentos
- Sugestão de "mesmo horário de sempre"

### 5. **Personalização da Página**
- Upload de foto/logo
- Cores personalizadas (tema)
- Descrição do negócio
- Link para Instagram/redes sociais
- Galeria de fotos (trabalhos realizados)

### 6. **Métricas Básicas**
- Taxa de no-show (%)
- Receita prevista vs realizada
- Serviços mais agendados
- Horários de pico
- Clientes novos vs recorrentes

### 8. **Gestão de Equipe (Multi-usuário)** ⭐ ESSENCIAL
- Sistema de permissões granulares (Owner/Admin/Funcionário)
- Funcionários veem apenas seus próprios agendamentos
- Dono vê tudo e pode filtrar por funcionário
- Controle de visibilidade de valores financeiros
- Relatórios segmentados por profissional
- Cliente escolhe o profissional ao agendar (ou "qualquer um disponível")

### 9. **Integração com Google Calendar** (Futuro)
- Sincronização bidirecional
- Bloquear horários marcados no Google automaticamente

---

## 🚀 Roadmap de Desenvolvimento

### FASE 1 - MVP (2-3 semanas)
**Objetivo:** Sistema funcional para validar com primeiros clientes

- [x] Setup do projeto (React + Vite + Supabase)
- [x] Sistema de autenticação (login/cadastro)
- [x] CRUD de serviços
- [x] Lógica de cálculo de horários disponíveis
- [x] Página pública de agendamento
- [x] Dashboard com visualização de agenda (dia)
- [ ] Sistema de bloqueios simples
- [x] Geração de link de WhatsApp manual (sem Evolution API)
- [ ] Deploy na Vercel

**Entrega:** Sistema usável onde profissional pode receber agendamentos e enviar confirmações manualmente via WhatsApp.

---

### FASE 2 - Automação (1-2 semanas)
**Objetivo:** Reduzir trabalho manual do profissional

- [ ] Integração com Evolution API
- [ ] QR Code para conectar WhatsApp
- [ ] Envio automático de confirmação
- [ ] Cron job para lembretes automáticos
- [ ] Configuração de mensagens personalizadas
- [ ] Teste de envio de mensagens

**Entrega:** Sistema 100% automatizado para mensagens.

---

### FASE 3 - Experiência do Usuário (1 semana)
**Objetivo:** Melhorar usabilidade e conversão

- [x] Onboarding completo pós-cadastro
- [ ] Tutorial interativo no dashboard
- [ ] Visualização semanal da agenda
- [ ] Filtros e busca na agenda
- [ ] Status visual de agendamentos (cores)
- [ ] Página de agendamento com foto/logo
- [ ] Responsividade total (mobile-first)

**Entrega:** Sistema polido e fácil de usar.

---

### FASE 4 - Gestão Avançada (1-2 semanas)
**Objetivo:** Dar mais controle ao profissional

- [ ] Gestão de clientes recorrentes
- [ ] Histórico de agendamentos por cliente
- [ ] Sistema de no-shows
- [ ] Relatórios básicos (dashboard de métricas)
- [ ] Bloqueios recorrentes
- [ ] Exportação de agenda (CSV)

**Entrega:** Sistema completo de gestão.

---

### FASE 5 - Painel Super Admin (CRÍTICO) ⭐⭐
**Objetivo:** Você conseguir gerenciar TODOS os clientes

- [x] Sistema de autenticação super admin
- [x] Dashboard com visão geral (MRR, clientes ativos, etc)
- [ ] Lista de todos os clientes (com filtros)
- [x] Detalhes completos de cada cliente
- [ ] **"Logar como cliente" (impersonation)**
- [ ] Gerenciar funcionários dos clientes
- [ ] Alterar planos manualmente
- [ ] Suspender/reativar contas
- [ ] Logs de auditoria (tudo que você faz é registrado)
- [ ] Configurações de planos e preços
- [ ] Integração com gateway de pagamento

**Entrega:** Você com controle total do sistema.

---

### FASE 6 - Sistema Multi-usuário (ALTA PRIORIDADE)
**Objetivo:** Permitir que donos de negócio gerenciem funcionários

- [x] Sistema de permissões (Owner/Admin/Funcionário)
- [x] CRUD de funcionários
- [x] Dashboard do funcionário (visão limitada)
- [x] Agendamentos por funcionário
- [ ] Relatórios segmentados por funcionário
- [ ] Controle de acesso granular
- [x] **Validação de limites por plano**

**Entrega:** Sistema completo para salões/barbearias com equipe.

---

### FASE 7 - Monetização (1 semana)
**Objetivo:** Implementar planos pagos

- [ ] Integração com gateway de pagamento (Stripe/Mercado Pago)
- [ ] Sistema de planos (Free, Basic, Pro)
- [ ] Limites por plano (ex: free = 30 agendamentos/mês)
- [ ] Página de upgrade
- [x] Painel administrativo (para você gerenciar clientes)

**Entrega:** Sistema pronto para gerar receita recorrente.

---

### FASE 6 - Sistema Multi-usuário (ALTA PRIORIDADE)
**Objetivo:** Permitir que donos de negócio gerenciem funcionários

- [x] Sistema de permissões (Owner/Admin/Funcionário)
- [x] CRUD de funcionários
- [x] Dashboard do funcionário (visão limitada)
- [x] Agendamentos por funcionário
- [ ] Relatórios segmentados por funcionário
- [ ] Controle de acesso granular

**Entrega:** Sistema completo para salões/barbearias com equipe.

---

### BACKLOG (Futuro)
- [ ] App mobile nativo (quando tiver CNPJ)
- [ ] Integração com Google Calendar
- [ ] Sistema de avaliações/reviews
- [ ] Pagamento online na hora de agendar
- [ ] Programa de fidelidade (pontos)
- [ ] WhatsApp chatbot para agendar por conversa

---

## 💰 Estratégia de Monetização

### Planos Sugeridos

#### 🆓 Plano FREE
**R$ 0/mês - Para testar**
- Até 30 agendamentos por mês
- 1 profissional
- Lembretes manuais (link do WhatsApp)
- Suporte por email

#### ⭐ Plano BASIC
**R$ 59,90/mês**
- Agendamentos ilimitados
- 1 profissional
- **Lembretes automáticos via WhatsApp**
- Até 3 serviços
- Personalização básica da página
- Suporte prioritário

#### 🚀 Plano PRO
**R$ 99,90/mês**
- Tudo do Basic +
- Serviços ilimitados
- Gestão de clientes (histórico completo)
- Relatórios avançados
- Bloqueios recorrentes
- **Até 2 funcionários** ⭐
- Logo e galeria de fotos
- Suporte via WhatsApp

#### 💼 Plano TEAM ⭐ NOVO
**R$ 179,90/mês**
- Tudo do Pro +
- **Até 5 funcionários**
- Agenda unificada (filtro por profissional)
- Relatórios por funcionário
- Controle de permissões detalhado
- Cliente escolhe o profissional
- Suporte prioritário

#### 🏢 Plano ENTERPRISE ⭐ NOVO
**R$ 299,90/mês**
- Tudo do Team +
- **Funcionários ilimitados**
- Multi-unidades (filiais)
- API de integração
- Suporte dedicado via WhatsApp
- Treinamento da equipe incluído

---

### Serviços Adicionais

**Setup Completo:** R$ 150 (uma vez)
- Você configura tudo para o cliente
- Cadastra serviços, fotos, horários
- Conecta WhatsApp
- Testa envios
- Treina o cliente em 15 minutos

**Consultoria por Hora:** R$ 80/hora
- Ajuda com configurações avançadas
- Sugestões de otimização
- Dúvidas gerais

---

## 📊 Métricas de Sucesso

### Para Validação do MVP
- ✅ 5 profissionais usando ativamente
- ✅ 100+ agendamentos realizados
- ✅ Taxa de no-show reduzida em pelo menos 30%
- ✅ NPS (Net Promoter Score) acima de 8

### Para Crescimento
- 50 profissionais pagantes em 6 meses
- MRR de R$ 3.000 em 6 meses
- Taxa de churn abaixo de 10%/mês
- Tempo médio de setup: menos de 10 minutos

---

## 🎯 Público-Alvo Detalhado

### Persona 1: **Barbeiro Autônomo**
- **Idade:** 25-40 anos
- **Dor:** Clientes marcam e não aparecem (perde R$ 200-500/mês)
- **Comportamento:** Usa WhatsApp para tudo, não gosta de sistemas complicados
- **Onde encontrar:** Instagram, grupos de Facebook, indicação

### Persona 2: **Manicure Home-Care**
- **Idade:** 28-45 anos
- **Dor:** Desorganização da agenda, esquecem horários, perdem tempo no telefone
- **Comportamento:** Atende em domicílio, precisa de mobilidade
- **Onde encontrar:** Instagram, WhatsApp Status, boca a boca

### Persona 3: **Personal Trainer**
- **Idade:** 25-38 anos
- **Dor:** Alunos cancelam em cima da hora, dificulta reposição
- **Comportamento:** Tech-savvy, gosta de otimizar tempo
- **Onde encontrar:** Instagram fitness, grupos de crossfit/academias

---

## 🔧 Código Base - Estrutura de
