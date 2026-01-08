# Documentação Multi-Modal (SMagenda)

Este documento define o que o SMagenda precisa cobrir para ser um sistema de agendamento realmente “multi-modal” (multi-setor), atendendo desde profissionais autônomos (ex.: faxineira) até negócios com equipe e estrutura (ex.: estúdio de pilates, salão, barbearia, estética, manicure, etc.).

O objetivo é servir como “fonte da verdade” do produto: quais funcionalidades devem existir, como elas se conectam, e quais critérios validam a proposta de valor em produção (dados reais).

## 1) Princípios do produto

1. **Núcleo único + variações configuráveis**
   - Evitar “um sistema diferente para cada nicho”.
   - Preferir configurações por tipo de negócio (`tipo_negocio`), campos dinâmicos e regras por serviço/profissional.

2. **Experiência do cliente final (página pública) é prioridade**
   - A página pública é a principal alavanca de conversão.
   - Fluxo curto, rápido, com confirmações e no-show controlável.

3. **Operação do dono/secretaria é prioridade**
   - Ajuste de agenda, bloqueios, remarcação e comunicação não podem ser trabalhosos.

4. **Tudo validado com uso real**
   - Integrações reais (WhatsApp, pagamentos), métricas e logs.
   - Sem simulação como “feature final”; sandbox serve só para desenvolvimento.

## 2) Públicos-alvo (personas) e cenários

### 2.1) Autônomo (solo)
- Ex.: faxineira, manicure que atende em casa, barbeiro solo.
- Necessidades:
  - Agenda simples e rápida.
  - Página pública com link/WhatsApp.
  - Lembretes e confirmação.
  - Regras de disponibilidade e deslocamento (quando atendimento é externo).

### 2.2) Pequena equipe (2 a 6 profissionais)
- Ex.: barbearia, salão, estética.
- Necessidades:
  - Múltiplos profissionais.
  - Distribuição e/ou escolha do profissional.
  - Serviços com durações e preços diferentes.
  - Políticas de cancelamento/no-show.

### 2.3) Estúdio com recursos/capacidade (agenda “com restrições”)
- Ex.: pilates, funcional, estúdio com salas/equipamentos.
- Necessidades:
  - Agendamento por **turma/aula** ou por **capacidade**.
  - Recursos compartilhados: sala/equipamento com limite por horário.
  - Pacotes/mensalidades e controle de créditos/aulas.

## 3) Matriz de requisitos por setor (o que muda)

### 3.1) Itens comuns (todos os setores)
- Cliente consegue agendar sozinho por link público.
- Profissional/dono consegue criar/editar/cancelar e bloquear horários.
- Comunicação automática (mensagens de confirmação/lembrete) com opt-in.
- Relatórios mínimos (agenda, no-show, receita por período).

### 3.2) Itens que variam por setor (via configurações)
- **Campos do agendamento** (ex.: endereço, observações, placa, alergias, convênio, nível do aluno).
- **Regras de disponibilidade** (tempo de deslocamento, buffers, antecedência mínima).
- **Tipo de serviço** (individual, grupo, recorrente, pacote).
- **Capacidade/recurso** (sala/equipamento/vagas).

## 4) Funcionalidades “core” (MVP multi-modal)

### 4.1) Cadastros
1. **Serviços**
   - Nome, descrição, duração, preço, cor, ativo.
   - Regras por serviço:
     - Buffer antes/depois.
     - Antecedência mínima/máxima.
     - Permite escolher profissional ou auto-alocação.
     - Permite atendimento externo (quando aplicável).

2. **Profissionais (e permissões)**
   - Perfil do profissional, horário de trabalho, intervalos e dias.
   - Permissões: ver agenda, criar agendamentos, cancelar, ver financeiro, etc.

3. **Unidades/locais (quando houver)**
   - Multi-unidades para negócios maiores (e link público por unidade).

### 4.2) Agenda e operação
1. **Agenda do dono (dashboard)**
   - Visualização por dia/semana.
   - Criar/editar/cancelar agendamento.
   - Bloqueios recorrentes.

2. **Agenda do funcionário**
   - Visualização filtrada pelo próprio profissional.
   - Ações conforme permissões.

3. **Gestão de clientes**
   - Histórico por telefone.
   - Observações.

### 4.3) Página pública (conversão)
1. **Fluxo de agendamento**
   - Escolha de serviço → (profissional/unidade) → horário → dados do cliente → confirmação.
   - Labels por `tipo_negocio`.

2. **Regras de UX**
   - Mostrar só horários realmente disponíveis.
   - Carregamento rápido.
   - Confirmação clara e simples.

### 4.4) Mensageria (redução de no-show)
1. **Confirmação automática**
   - Mensagem de confirmação pós-agendamento.
   - Opção de enviar/ não enviar por configuração.

2. **Lembrete automático**
   - Configurar “horas antes”.
   - Templates por negócio.

3. **Canal mínimo recomendado**
   - WhatsApp (produção) como canal principal.
   - E-mail como fallback quando WhatsApp não estiver configurado.

### 4.5) Cobrança do plano (SaaS)
1. **Checkout**
   - PIX (30 dias) e cartão (assinatura).
   - Plano define limites (profissionais, agendamentos/mês etc.).

2. **Bloqueio por inadimplência**
   - Restringir acesso após vencimento/trial.

## 5) Funcionalidades “diferenciadoras” (para validar multi-modal de verdade)

### 5.1) Agendamento com pagamento/deposito (anti no-show)
- Opções por serviço:
  - Sem pagamento.
  - Depósito/sinal.
  - Pagamento integral.
- Política de cancelamento e reembolso.
- Registro do status do pagamento no agendamento.

### 5.2) No-show protection (cartão em arquivo / cobrança por falta)
- Reduz muito no-show em estética e serviços de maior ticket.
- Exige UX e comunicação claros.

### 5.3) Pacotes/mensalidades/créditos (essencial para pilates)
- Exemplos:
  - “8 aulas/mês” (expira no mês).
  - “10 sessões” (expira em 90 dias).
  - Mensalidade recorrente.
- Regras:
  - Consumo automático ao confirmar presença.
  - Reposição/estorno conforme política.

### 5.4) Aulas em grupo (capacidade)
- Criar “turmas” com:
  - Capacidade por horário.
  - Lista de alunos.
  - Lista de espera.
  - Check-in/presença.

### 5.5) Recursos (salas/equipamentos)
- Reservar recurso junto com o agendamento.
- Evitar overbooking de sala/equipamento.

### 5.6) Atendimento externo (faxina e domiciliar)
- Campos obrigatórios: endereço, referência.
- Regras:
  - Tempo mínimo entre atendimentos.
  - Zona de atendimento (quando aplicável).
  - Taxa de deslocamento opcional.

### 5.7) Personalização por segmento
- Templates de mensagens por setor.
- Campos do formulário público por setor.
- Labels no público por setor.

## 6) “Completo” para o público: o que costuma ser decisivo

### 6.1) Para barbearia/salão/manicure/estética
- Escolha do profissional e serviços com variações.
- Fotos/portfólio.
- Depósito/anti no-show.
- Confirmação/lembrete no WhatsApp.
- Remarcação simples.

### 6.2) Para faxina e serviços domiciliares
- Endereço + duração variável.
- Regras de deslocamento/buffer.
- Pagamento (sinal ou pós-serviço) e comunicação clara.

### 6.3) Para pilates/estúdio
- Turmas e capacidade.
- Mensalidades e créditos.
- Controle de presença.
- Recursos (salas/equipamentos).

## 7) Métricas de validação (para provar que multi-modal funciona)

### 7.1) Métricas do funil (página pública)
- Visitas no link público → seleção de serviço → seleção de horário → agendamento criado.
- Taxa de conversão por setor.
- Tempo médio para concluir agendamento.

### 7.2) Métricas de operação
- No-show rate.
- Remarcações e cancelamentos.
- Tempo de agenda ociosa.

### 7.3) Métricas financeiras
- Receita por período (quando houver pagamento integrado).
- Ticket médio por serviço.
- Receita recorrente (planos e mensalidades).

## 8) Roadmap recomendado (para validar rápido sem inflar complexidade)

### Fase 1 — Multi-modal mínimo (conversão + agenda + WhatsApp)
- Campos dinâmicos no agendamento por `tipo_negocio`.
- Templates de WhatsApp por setor.
- Regras de disponibilidade por serviço (buffers, antecedência).
- Relatórios mínimos.

### Fase 2 — No-show e monetização de fluxo
- Depósito/sinal por serviço.
- Políticas de cancelamento.
- Pagamento online opcional.

### Fase 3 — Estúdio (pilates) completo
- Turmas/capacidade + lista de espera.
- Pacotes/mensalidades/créditos.
- Recursos (salas/equipamentos).

## 9) Critérios de “pronto para produção” (dados reais)

1. WhatsApp funcionando com infraestrutura real (Evolution API) e logs.
2. Pagamentos funcionando em modo Live quando ativados.
3. Auditoria e métricas mínimas coletadas.
4. Fluxos críticos testados: agendar, cancelar, remarcar, lembrete, confirmação.

