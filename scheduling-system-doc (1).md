- Botão "Compartilhar no WhatsApp"
- Botão "Ir para minha agenda"

---

## 🔧 Funcionalidades Avançadas Detalhadas

### 1️⃣ **Lógica de Validação de Limites por Plano**

#### Como Funciona

Cada vez que uma ação é realizada, o sistema verifica se o usuário tem permissão baseado no plano dele:

```javascript
// services/planLimitsService.js

// Definição dos limites por plano
const PLAN_LIMITS = {
  free: {
    agendamentos_mes: 30,
    funcionarios: 0,
    servicos: 3,
    mensagens_auto: false,
    relatorios_avancados: false,
    personalizacao_pagina: false
  },
  basic: {
    agendamentos_mes: -1, // -1 = ilimitado
    funcionarios: 0,
    servicos: -1,
    mensagens_auto: true,
    relatorios_avancados: false,
    personalizacao_pagina: false
  },
  pro: {
    agendamentos_mes: -1,
    funcionarios: 2,
    servicos: -1,
    mensagens_auto: true,
    relatorios_avancados: true,
    personalizacao_pagina: true
  },
  team: {
    agendamentos_mes: -1,
    funcionarios: 5,
    servicos: -1,
    mensagens_auto: true,
    relatorios_avancados: true,
    personalizacao_pagina: true
  },
  enterprise: {
    agendamentos_mes: -1,
    funcionarios: -1, // ilimitado
    servicos: -1,
    mensagens_auto: true,
    relatorios_avancados: true,
    personalizacao_pagina: true
  }
};

// Função para verificar limite de agendamentos
async function checkAgendamentoLimit(usuarioId) {
  // Busca o usuário e seu plano
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('plano, status_pagamento')
    .eq('id', usuarioId)
    .single();
  
  // Verifica status do pagamento
  if (usuario.status_pagamento !== 'ativo') {
    throw new Error('Assinatura inativa. Regularize seu pagamento.');
  }
  
  const limite = PLAN_LIMITS[usuario.plano].agendamentos_mes;
  
  // Se ilimitado, libera
  if (limite === -1) return true;
  
  // Conta agendamentos do mês atual
  const iniciodoMes = new Date();
  iniciodoMes.setDate(1);
  iniciodoMes.setHours(0, 0, 0, 0);
  
  const { count } = await supabase
    .from('agendamentos')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .gte('criado_em', iniciodoMes.toISOString());
  
  if (count >= limite) {
    throw new Error(`Limite de ${limite} agendamentos/mês atingido. Faça upgrade do seu plano.`);
  }
  
  return true;
}

// Função para verificar limite de funcionários
async function checkFuncionarioLimit(usuarioId) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('plano, status_pagamento')
    .eq('id', usuarioId)
    .single();
  
  if (usuario.status_pagamento !== 'ativo') {
    throw new Error('Assinatura inativa.');
  }
  
  const limite = PLAN_LIMITS[usuario.plano].funcionarios;
  
  // Se ilimitado, libera
  if (limite === -1) return true;
  
  // Se não permite funcionários (FREE, BASIC)
  if (limite === 0) {
    throw new Error('Seu plano não permite funcionários. Faça upgrade para PRO.');
  }
  
  // Conta funcionários ativos
  const { count } = await supabase
    .from('funcionarios')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_master_id', usuarioId)
    .eq('ativo', true);
  
  if (count >= limite) {
    throw new Error(`Limite de ${limite} funcionários atingido. Faça upgrade para TEAM ou ENTERPRISE.`);
  }
  
  return true;
}

// Função para verificar funcionalidade
function checkFeatureAccess(plano, feature) {
  const hasAccess = PLAN_LIMITS[plano][feature];
  
  if (!hasAccess) {
    const upgradeTo = getMinimumPlanForFeature(feature);
    throw new Error(`Funcionalidade disponível apenas no plano ${upgradeTo.toUpperCase()}. Faça upgrade.`);
  }
  
  return true;
}

// Função auxiliar para descobrir plano mínimo necessário
function getMinimumPlanForFeature(feature) {
  const plans = ['free', 'basic', 'pro', 'team', 'enterprise'];
  
  for (const plan of plans) {
    if (PLAN_LIMITS[plan][feature]) {
      return plan;
    }
  }
  
  return 'enterprise';
}

// Exportar funções
export {
  checkAgendamentoLimit,
  checkFuncionarioLimit,
  checkFeatureAccess,
  PLAN_LIMITS
};
```

#### Uso nas Rotas da API

```javascript
// routes/agendamentos.js
import { checkAgendamentoLimit } from '../services/planLimitsService.js';

app.post('/api/agendamentos', async (req, res) => {
  try {
    const { usuario_id, servico_id, cliente_nome, data, hora } = req.body;
    
    // 🔒 VALIDAÇÃO DO LIMITE
    await checkAgendamentoLimit(usuario_id);
    
    // Se passou, cria o agendamento
    const { data: agendamento } = await supabase
      .from('agendamentos')
      .insert({
        usuario_id,
        servico_id,
        cliente_nome,
        data,
        hora_inicio: hora,
        status: 'confirmado'
      })
      .select()
      .single();
    
    res.json({ success: true, agendamento });
    
  } catch (error) {
    // Retorna erro amigável
    res.status(403).json({ 
      error: error.message,
      needsUpgrade: true,
      currentPlan: 'free',
      suggestedPlan: 'basic'
    });
  }
});
```

```javascript
// routes/funcionarios.js
import { checkFuncionarioLimit } from '../services/planLimitsService.js';

app.post('/api/funcionarios', async (req, res) => {
  try {
    const { usuario_master_id, nome, email } = req.body;
    
    // 🔒 VALIDAÇÃO DO LIMITE
    await checkFuncionarioLimit(usuario_master_id);
    
    // Cria funcionário...
    const { data: funcionario } = await supabase
      .from('funcionarios')
      .insert({ usuario_master_id, nome, email, ativo: true })
      .select()
      .single();
    
    res.json({ success: true, funcionario });
    
  } catch (error) {
    res.status(403).json({ 
      error: error.message,
      needsUpgrade: true,
      suggestedPlan: 'pro'
    });
  }
});
```

#### Modal de Bloqueio no Frontend

```jsx
// components/UpgradeModal.jsx
import React from 'react';

export default function UpgradeModal({ error, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Limite Atingido</h2>
          <p className="text-gray-600 mb-6">{error.message}</p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">
              Seu plano atual: <strong>{error.currentPlan.toUpperCase()}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Upgrade sugerido: <strong>{error.suggestedPlan.toUpperCase()}</strong>
            </p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Voltar
            </button>
            <a 
              href="/configuracoes/plano"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Fazer Upgrade
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### 2️⃣ **Sistema de Notificações para Inadimplentes**

#### Fluxo Automático de Cobrança

```javascript
// services/paymentNotificationService.js

// Cron job que roda TODO DIA às 9h da manhã
import cron from 'node-cron';

// Etapas de cobrança
const NOTIFICATION_STAGES = {
  vencimento: 0,        // No dia do vencimento
  atraso_3: 3,          // 3 dias de atraso
  atraso_7: 7,          // 7 dias de atraso
  suspensao_14: 14,     // 14 dias - suspende conta
  cancelamento_30: 30   // 30 dias - cancela conta
};

// Função principal executada diariamente
async function checkPendingPayments() {
  console.log('🔍 Verificando pagamentos pendentes...');
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  // Busca todas as assinaturas ativas ou inadimplentes
  const { data: assinaturas } = await supabase
    .from('assinaturas')
    .select(`
      *,
      usuarios:usuario_id (
        nome_completo,
        email,
        telefone,
        nome_negocio
      )
    `)
    .in('status', ['ativa', 'inadimplente']);
  
  for (const assinatura of assinaturas) {
    const vencimento = new Date(assinatura.data_vencimento);
    vencimento.setHours(0, 0, 0, 0);
    
    const diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
    
    // Vencimento hoje
    if (diasAtraso === NOTIFICATION_STAGES.vencimento) {
      await sendPaymentReminder(assinatura, 'vencimento');
    }
    
    // 3 dias de atraso
    if (diasAtraso === NOTIFICATION_STAGES.atraso_3) {
      await sendPaymentReminder(assinatura, 'atraso_3');
      await updateAssinaturaStatus(assinatura.id, 'inadimplente');
    }
    
    // 7 dias de atraso
    if (diasAtraso === NOTIFICATION_STAGES.atraso_7) {
      await sendPaymentReminder(assinatura, 'atraso_7');
    }
    
    // 14 dias - SUSPENDE CONTA
    if (diasAtraso === NOTIFICATION_STAGES.suspensao_14) {
      await suspendAccount(assinatura);
      await sendPaymentReminder(assinatura, 'suspensao');
    }
    
    // 30 dias - CANCELA CONTA
    if (diasAtraso === NOTIFICATION_STAGES.cancelamento_30) {
      await cancelAccount(assinatura);
      await sendPaymentReminder(assinatura, 'cancelamento');
    }
  }
  
  console.log('✅ Verificação de pagamentos concluída.');
}

// Função para enviar notificação por email
async function sendPaymentReminder(assinatura, tipo) {
  const usuario = assinatura.usuarios;
  
  const templates = {
    vencimento: {
      assunto: '💳 Seu pagamento vence hoje - SMagenda',
      mensagem: `
        Olá ${usuario.nome_completo},
        
        Seu pagamento do plano ${assinatura.plano.toUpperCase()} vence hoje!
        
        Valor: R$ ${assinatura.valor.toFixed(2)}
        Vencimento: ${formatDate(assinatura.data_vencimento)}
        
        Para evitar a suspensão do serviço, regularize seu pagamento:
        ${process.env.APP_URL}/pagamento/${assinatura.id}
        
        Atenciosamente,
        Equipe SMagenda
      `
    },
    
    atraso_3: {
      assunto: '⚠️ Pagamento em atraso - SMagenda',
      mensagem: `
        Olá ${usuario.nome_completo},
        
        Seu pagamento está com 3 dias de atraso.
        
        Valor: R$ ${assinatura.valor.toFixed(2)}
        Vencimento: ${formatDate(assinatura.data_vencimento)}
        
        ⚠️ ATENÇÃO: Se não regularizar em 11 dias, sua conta será suspensa.
        
        Regularize agora:
        ${process.env.APP_URL}/pagamento/${assinatura.id}
        
        Dúvidas? Responda este email.
        
        Equipe SMagenda
      `
    },
    
    atraso_7: {
      assunto: '🚨 URGENTE: Pagamento em atraso - SMagenda',
      mensagem: `
        Olá ${usuario.nome_completo},
        
        Seu pagamento está com 7 dias de atraso.
        
        ⚠️ Sua conta será SUSPENSA em 7 dias se não regularizar.
        
        Isso significa que você e seus funcionários não poderão:
        • Acessar o sistema
        • Receber novos agendamentos
        • Enviar lembretes automáticos
        
        Valor: R$ ${assinatura.valor.toFixed(2)}
        
        Regularize AGORA:
        ${process.env.APP_URL}/pagamento/${assinatura.id}
        
        Precisa de ajuda? Entre em contato: suporte@smagenda.com
        
        Equipe SMagenda
      `
    },
    
    suspensao: {
      assunto: '🔒 Conta Suspensa - SMagenda',
      mensagem: `
        Olá ${usuario.nome_completo},
        
        Sua conta foi SUSPENSA por falta de pagamento.
        
        Você não consegue mais:
        ❌ Acessar o sistema
        ❌ Receber agendamentos
        ❌ Seus funcionários estão bloqueados
        
        ⚠️ Em 16 dias seus dados serão EXCLUÍDOS permanentemente.
        
        Regularize URGENTE:
        ${process.env.APP_URL}/pagamento/${assinatura.id}
        
        Valor: R$ ${assinatura.valor.toFixed(2)} + multa de 2%
        
        Atenciosamente,
        Equipe SMagenda
      `
    },
    
    cancelamento: {
      assunto: '❌ Conta Cancelada - SMagenda',
      mensagem: `
        Olá ${usuario.nome_completo},
        
        Sua conta foi CANCELADA após 30 dias de inadimplência.
        
        Seus dados serão excluídos em 24 horas.
        
        Se deseja reativar, entre em contato:
        suporte@smagenda.com
        
        Será necessário pagar o valor em atraso.
        
        Lamentamos o ocorrido.
        
        Equipe SMagenda
      `
    }
  };
  
  const { assunto, mensagem } = templates[tipo];
  
  // Envia email (usando serviço como SendGrid, Resend, etc)
  await sendEmail({
    to: usuario.email,
    subject: assunto,
    text: mensagem
  });
  
  // Envia WhatsApp (opcional)
  if (tipo === 'suspensao' || tipo === 'atraso_7') {
    await sendWhatsAppNotification(usuario.telefone, mensagem);
  }
  
  // Registra no banco
  await supabase.from('notificacoes_enviadas').insert({
    usuario_id: usuario.id,
    tipo: 'cobranca',
    subtipo: tipo,
    enviado_em: new Date().toISOString()
  });
  
  console.log(`📧 Notificação "${tipo}" enviada para ${usuario.email}`);
}

// Função para suspender conta
async function suspendAccount(assinatura) {
  // Atualiza status do usuário
  await supabase
    .from('usuarios')
    .update({ 
      ativo: false,
      status_pagamento: 'suspenso'
    })
    .eq('id', assinatura.usuario_id);
  
  // Desativa todos os funcionários
  await supabase
    .from('funcionarios')
    .update({ ativo: false })
    .eq('usuario_master_id', assinatura.usuario_id);
  
  // Atualiza status da assinatura
  await supabase
    .from('assinaturas')
    .update({ status: 'suspensa' })
    .eq('id', assinatura.id);
  
  console.log(`🔒 Conta suspensa: ${assinatura.usuario_id}`);
}

// Função para cancelar conta
async function cancelAccount(assinatura) {
  // Marca para exclusão
  await supabase
    .from('usuarios')
    .update({ 
      ativo: false,
      status_pagamento: 'cancelado',
      data_exclusao_agendada: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    })
    .eq('id', assinatura.usuario_id);
  
  await supabase
    .from('assinaturas')
    .update({ 
      status: 'cancelada',
      data_cancelamento: new Date().toISOString()
    })
    .eq('id', assinatura.id);
  
  console.log(`❌ Conta cancelada: ${assinatura.usuario_id}`);
}

// Atualiza status da assinatura
async function updateAssinaturaStatus(assinaturaId, status) {
  await supabase
    .from('assinaturas')
    .update({ status })
    .eq('id', assinaturaId);
}

// Formata data
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('pt-BR');
}

// Agenda o cron job para rodar todo dia às 9h
cron.schedule('0 9 * * *', () => {
  checkPendingPayments();
});

export { checkPendingPayments };
```

#### Dashboard de Notificações (Super Admin)

```jsx
// Adicionar na Tela SA-2 do Super Admin

<div className="mt-6">
  <h3 className="font-bold mb-3">⚠️ Ações Necessárias</h3>
  
  <div className="space-y-2">
    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold">5 clientes em trial acabando</p>
          <p className="text-sm text-gray-600">Trial termina em menos de 3 dias</p>
        </div>
        <button className="text-blue-600 hover:underline">
          Ver lista
        </button>
      </div>
    </div>
    
    <div className="bg-red-50 border border-red-200 rounded p-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold">4 clientes inadimplentes</p>
          <p className="text-sm text-gray-600">Atraso de 3-14 dias</p>
        </div>
        <button className="text-blue-600 hover:underline">
          Enviar cobrança
        </button>
      </div>
    </div>
    
    <div className="bg-gray-50 border border-gray-200 rounded p-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold">2 contas suspensas</p>
          <p className="text-sm text-gray-600">Há mais de 14 dias</p>
        </div>
        <button className="text-blue-600 hover:underline">
          Verificar
        </button>
      </div>
    </div>
  </div>
</div>
```

---

### 3️⃣ **Exportação de Relatórios Financeiros**

#### Tipos de Relatórios

```javascript
// services/reportService.js

// 1. Relatório de MRR (Monthly Recurring Revenue)
async function generateMRRReport(mes, ano) {
  const { data: assinaturas } = await supabase
    .from('assinaturas')
    .select(`
      id,
      valor,
      plano,
      status,
      data_inicio,
      usuarios:usuario_id (nome_negocio, email)
    `)
    .eq('status', 'ativa')
    .gte('data_inicio', `${ano}-${mes}-01`)
    .lt('data_inicio', `${ano}-${mes + 1}-01`);
  
  const mrrTotal = assinaturas.reduce((sum, sub) => sum + parseFloat(sub.valor), 0);
  
  const porPlano = {
    free: 0,
    basic: 0,
    pro: 0,
    team: 0,
    enterprise: 0
  };
  
  assinaturas.forEach(sub => {
    porPlano[sub.plano] += parseFloat(sub.valor);
  });
  
  return {
    mes,
    ano,
    mrr_total: mrrTotal,
    total_assinaturas: assinaturas.length,
    por_plano: porPlano,
    assinaturas: assinaturas.map(sub => ({
      cliente: sub.usuarios.nome_negocio,
      email: sub.usuarios.email,
      plano: sub.plano,
      valor: sub.valor
    }))
  };
}

// 2. Relatório de Churn (cancelamentos)
async function generateChurnReport(mes, ano) {
  // Assinaturas ativas no início do mês
  const { count: ativasInicio } = await supabase
    .from('assinaturas')
    .select('*', { count: 'exact', head: true })
    .lt('data_inicio', `${ano}-${mes}-01`)
    .in('status', ['ativa', 'inadimplente']);
  
  // Assinaturas canceladas no mês
  const { data: canceladas, count: totalCanceladas } = await supabase
    .from('assinaturas')
    .select(`
      *,
      usuarios:usuario_id (nome_negocio, email, data_cadastro)
    `)
    .eq('status', 'cancelada')
    .gte('data_cancelamento', `${ano}-${mes}-01`)
    .lt('data_cancelamento', `${ano}-${mes + 1}-01`);
  
  const taxaChurn = ((totalCanceladas / ativasInicio) * 100).toFixed(2);
  
  // Motivos de cancelamento
  const motivos = canceladas.reduce((acc, sub) => {
    const dias = Math.floor(
      (new Date(sub.data_cancelamento) - new Date(sub.usuarios.data_cadastro)) / 
      (1000 * 60 * 60 * 24)
    );
    
    let motivo = 'Outro';
    if (dias < 7) motivo = 'Cancelou durante trial';
    else if (dias < 30) motivo = 'Cancelou no primeiro mês';
    else motivo = 'Inadimplência';
    
    acc[motivo] = (acc[motivo] || 0) + 1;
    return acc;
  }, {});
  
  return {
    mes,
    ano,
    assinaturas_ativas_inicio: ativasInicio,
    total_canceladas: totalCanceladas,
    taxa_churn: `${taxaChurn}%`,
    motivos_cancelamento: motivos,
    detalhes: canceladas.map(sub => ({
      cliente: sub.usuarios.nome_negocio,
      email: sub.usuarios.email,
      plano: sub.plano,
      valor_perdido: sub.valor,
      data_cadastro: sub.usuarios.data_cadastro,
      data_cancelamento: sub.data_cancelamento,
      tempo_como_cliente: Math.floor(
        (new Date(sub.data_cancelamento) - new Date(sub.usuarios.data_cadastro)) / 
        (1000 * 60 * 60 * 24)
      ) + ' dias'
    }))
  };
}

// 3. Relatório de Inadimplência
async function generateInadimplenciaReport() {
  const { data: inadimplentes } = await supabase
    .from('assinaturas')
    .select(`
      *,
      usuarios:usuario_id (nome_negocio, email, telefone)
    `)
    .eq('status', 'inadimplente');
  
  const hoje = new Date();
  
  const detalhado = inadimplentes.map(sub => {
    const vencimento = new Date(sub.data_vencimento);
    const diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
    
    let gravidade = '';
    if (diasAtraso <= 7) gravidade = '🟡 Leve';
    else if (diasAtraso <= 14) gravidade = '🟠 Moderada';
    else gravidade = '🔴 Grave';
    
    return {
      cliente: sub.usuarios.nome_negocio,
      email: sub.usuarios.email,
      telefone: sub.usuarios.telefone,
      plano: sub.plano,
      valor: sub.valor,
      vencimento: sub.data_vencimento,
      dias_atraso: diasAtraso,
      gravidade,
      valor_total_devido: (parseFloat(sub.valor) * 1.02).toFixed(2) // +2% multa
    };
  });
  
  const totalDevido = detalhado.reduce((sum, item) => 
    sum + parseFloat(item.valor_total_devido), 0
  );
  
  return {
    total_inadimplentes: inadimplentes.length,
    valor_total_devido: totalDevido.toFixed(2),
    por_gravidade: {
      leve: detalhado.filter(d => d.gravidade.includes('Leve')).length,
      moderada: detalhado.filter(d => d.gravidade.includes('Moderada')).length,
      grave: detalhado.filter(d => d.gravidade.includes('Grave')).length
    },
    detalhes: detalhado
  };
}

// 4. Exportar para CSV
function exportToCSV(data, filename) {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => 
    Object.values(row).map(val => `"${val}"`).join(',')
  );
  
  const csv = [headers, ...rows].join('\n');
  
  return {
    content: csv,
    filename: `${filename}_${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv'
  };
}

// 5. Exportar para Excel (usando xlsx)
import XLSX from 'xlsx';

function exportToExcel(reports, filename) {
  const workbook = XLSX.utils.book_new();
  
  // Aba 1: MRR
  const mrrSheet = XLSX.utils.json_to_sheet(reports.mrr.assinaturas);
  XLSX.utils.book_append_sheet(workbook, mrrSheet, 'MRR');
  
  // Aba 2: Churn
  const churnSheet = XLSX.utils.json_to_sheet(reports.churn.detalhes);
  XLSX.utils.book_append_sheet(workbook, churnSheet, 'Churn');
  
  // Aba 3: Inadimplência
  const inadimSheet = XLSX.utils.json_to_sheet(reports.inadimplencia.detalhes);
  XLSX.utils.book_append_sheet(workbook, inadimSheet, 'Inadimplência');
  
  // Aba 4: Resumo
  const resumo = [
    { Métrica: 'MRR Total', Valor: `R$ ${reports.mrr.mrr_total}` },
    { Métrica: 'Total Assinaturas', Valor: reports.mrr.total_assinaturas },
    { Métrica: 'Taxa de Churn', Valor: reports.churn.taxa_churn },
    { Métrica: 'Inadimplentes', Valor: reports.inadimplencia.total_inadimplentes },
    { Métrica: 'Valor Devido', Valor: `R$ ${reports.inadimplencia.valor_total_devido}` }
  ];
  const resumoSheet = XLSX.utils.json_to_sheet(resumo);
  XLSX.utils.book_append_sheet(workbook, resumoSheet, 'Resumo');# 📱 SMagenda - Sistema de Agendamento Inteligente - Documentação Completa

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

### FASE 1 - MVP 
**Objetivo:** Sistema funcional para validar com primeiros clientes

- [x] Setup do projeto (React + Vite + Supabase)
- [x] Sistema de autenticação (login/cadastro)
- [x] CRUD de serviços
- [x] Lógica de cálculo de horários disponíveis
- [x] Página pública de agendamento
- [x] Dashboard com visualização de agenda (dia)
- [x] Sistema de bloqueios simples
- [x] Geração de link de WhatsApp manual (sem Evolution API)
- [x] Deploy na Vercel

**Entrega:** Sistema usável onde profissional pode receber agendamentos e enviar confirmações manualmente via WhatsApp.

---

### FASE 2 - Automação 
**Objetivo:** Reduzir trabalho manual do profissional

- [x] Integração com Evolution API
- [x] QR Code para conectar WhatsApp
- [x] Envio automático de confirmação
- [x] Cron job para lembretes automáticos
- [x] Configuração de mensagens personalizadas
- [x] Teste de envio de mensagens

**Entrega:** Sistema 100% automatizado para mensagens.

--- 

### FASE 3 - Experiência do Usuário 
**Objetivo:** Melhorar usabilidade e conversão

- [x] Onboarding completo pós-cadastro
- [x] Tutorial interativo no dashboard
- [x] Visualização semanal da agenda
- [x] Filtros e busca na agenda
- [x] Status visual de agendamentos (cores)
- [x] Página de agendamento com foto/logo
- [x] Responsividade total (mobile-first)

**Entrega:** Sistema polido e fácil de usar.

---

### FASE 4 - Gestão Avançada 
**Objetivo:** Dar mais controle ao profissional

- [x] Gestão de clientes recorrentes
- [x] Histórico de agendamentos por cliente
- [x] Sistema de no-shows
- [x] Relatórios básicos (dashboard de métricas)
- [x] Bloqueios recorrentes
- [x] Exportação de agenda (CSV)

**Entrega:** Sistema completo de gestão.

---

### FASE 5 - Painel Super Admin (CRÍTICO) ⭐⭐
**Objetivo:** Você conseguir gerenciar TODOS os clientes

- [x] Sistema de autenticação super admin (OBS: depende da tabela `public.super_admin` + RLS do bloco em `/admin/configuracoes`)
- [x] Dashboard com visão geral (MRR, clientes ativos, etc) (OBS: hoje mostra total/ativos/inadimplentes; não calcula MRR)
- [x] Lista de todos os clientes (com filtros) (OBS: busca + filtros por `plano`, `status_pagamento`, `ativo`; lista até 500)
- [x] Detalhes completos de cada cliente
- [x] **"Logar como cliente" (impersonation)** (OBS: troca o `appPrincipal` no front; não troca o JWT/sessão do Supabase)
- [x] Gerenciar funcionários dos clientes (OBS: cria via Edge Function `admin-create-funcionario`; precisa deploy + `SERVICE_ROLE_KEY`)
- [x] Alterar planos manualmente (OBS: altera `usuarios.plano`, `usuarios.status_pagamento` e `usuarios.limite_funcionarios`)
- [x] Suspender/reativar contas (OBS: seta `usuarios.ativo`; bloqueia login/acesso via `RequireAuth`)
- [x] Logs de auditoria (tudo que você faz é registrado) (OBS: tela `/admin/logs` + SQL de triggers em `/admin/configuracoes`; precisa executar no Supabase)
- [ ] Configurações de planos e preços (OBS: planos/preços ainda ficam hardcoded + env vars do Stripe; sem tela/tabela de configuração)
- [x] Integração com gateway de pagamento (OBS: Stripe Checkout via Edge Function `payments` + webhook na própria função; requer configurar `STRIPE_WEBHOOK_SECRET` e endpoint de webhook no Stripe)

**Entrega:** Você com controle total do sistema.

---

### FASE 6 - Sistema Multi-usuário (ALTA PRIORIDADE)
**Objetivo:** Permitir que donos de negócio gerenciem funcionários

- [x] Sistema de permissões (Owner/Admin/Funcionário)
- [x] CRUD de funcionários
- [x] Dashboard do funcionário (visão limitada)
- [x] Agendamentos por funcionário
- [x] Relatórios segmentados por funcionário
- [x] Controle de acesso granular
- [x] **Validação de limites por plano**

**Entrega:** Sistema completo para salões/barbearias com equipe.

---

### FASE 7 - Monetização 
**Objetivo:** Implementar planos pagos

- [x] Integração com gateway de pagamento (Stripe)
- [x] Sistema de planos (Free, Basic, Pro, Team, Enterprise)
- [x] Limites por plano (ex: free = 30 agendamentos/mês)
- [x] Página de upgrade
- [x] Painel administrativo (para você gerenciar clientes)

**Entrega:** Sistema pronto para gerar receita recorrente.

---

### BACKLOG
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
**R$ 49,90/mês**
- Agendamentos 60 por mês
- 1 profissional
- **Lembretes automáticos via WhatsApp**
- Até 3 serviços
- Personalização básica da página
- Suporte prioritário

#### 🚀 Plano PRO
**R$ 79,90/mês**
- Tudo do Basic +
- Agendamentos 180 por mês
- Serviços ilimitados
- Gestão de clientes (histórico completo)
- Relatórios avançados
- Bloqueios recorrentes
- **Até 3 funcionários** ⭐
- Logo e galeria de fotos
- Suporte via WhatsApp

#### 💼 Plano TEAM ⭐ NOVO
**R$ 119,90/mês**
- Tudo do Pro +
- **Até 5 funcionários**
- Agendamentos 300 por mês
- Agenda unificada (filtro por profissional)
- Relatórios por funcionário
- Controle de permissões detalhado
- Cliente escolhe o profissional
- Suporte prioritário

#### 🏢 Plano ENTERPRISE ⭐ NOVO
**R$ 199,90/mês**
- Tudo do Team +
- Agendamentos ilimitados
- **Funcionários ilimitados**
- Multi-unidades (filiais)
- API de integração
- Suporte dedicado via WhatsApp
- Treinamento da equipe incluso

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

## 🔧 Código Base - Estrutura de <invoke name="artifacts">
<parameter name="command">update</parameter>
<parameter name="id">scheduling-system-doc</parameter>
<parameter name="old_str">- Botão "Compartilhar no WhatsApp"
- Botão "Ir para minha agenda"

---</parameter>
<parameter name="new_str">  
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  return {
    content: buffer,
    filename: `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}

export {
  generateMRRReport,
  generateChurnReport,
  generateInadimplenciaReport,
  exportToCSV,
  exportToExcel
};
```

#### Rota da API para Gerar Relatórios

```javascript
// routes/admin/reports.js

import express from 'express';
import { 
  generateMRRReport, 
  generateChurnReport, 
  generateInadimplenciaReport,
  exportToCSV,
  exportToExcel
} from '../services/reportService.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';

const router = express.Router();

// Endpoint para gerar relatório completo
router.get('/relatorios/completo', requireSuperAdmin, async (req, res) => {
  try {
    const { mes, ano, formato } = req.query;
    
    // Gera os 3 relatórios
    const [mrr, churn, inadimplencia] = await Promise.all([
      generateMRRReport(parseInt(mes), parseInt(ano)),
      generateChurnReport(parseInt(mes), parseInt(ano)),
      generateInadimplenciaReport()
    ]);
    
    const reports = { mrr, churn, inadimplencia };
    
    // Retorna JSON ou exporta arquivo
    if (formato === 'json') {
      return res.json(reports);
    }
    
    if (formato === 'csv') {
      // Gera CSV separado para cada relatório
      const mrrCSV = exportToCSV(mrr.assinaturas, 'mrr');
      res.setHeader('Content-Type', mrrCSV.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${mrrCSV.filename}"`);
      return res.send(mrrCSV.content);
    }
    
    if (formato === 'excel') {
      const excel = exportToExcel(reports, 'relatorio_financeiro');
      res.setHeader('Content-Type', excel.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${excel.filename}"`);
      return res.send(excel.content);
    }
    
    res.status(400).json({ error: 'Formato inválido. Use: json, csv ou excel' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// Endpoint para relatório específico de MRR
router.get('/relatorios/mrr', requireSuperAdmin, async (req, res) => {
  const { mes, ano } = req.query;
  const report = await generateMRRReport(parseInt(mes), parseInt(ano));
  res.json(report);
});

// Endpoint para relatório de inadimplência
router.get('/relatorios/inadimplencia', requireSuperAdmin, async (req, res) => {
  const report = await generateInadimplenciaReport();
  res.json(report);
});

export default router;
```

#### Tela de Relatórios (Super Admin)

**Nova Tela SA-10:**
```
┌─────────────────────────────────────┐
│ [☰] Relatórios Financeiros         │
├─────────────────────────────────────┤
│                                     │
│ 📊 Gerar Relatório                 │
│                                     │
│ Período:                           │
│ Mês: [Dezembro ▼] Ano: [2025 ▼]   │
│                                     │
│ Formato de Exportação:             │
│ (•) Excel (.xlsx)                  │
│ ( ) CSV                            │
│ ( ) JSON                           │
│                                     │
│ Incluir:                           │
│ [✓] MRR (Receita Recorrente)       │
│ [✓] Churn (Cancelamentos)          │
│ [✓] Inadimplência                  │
│                                     │
│ [Gerar e Baixar Relatório]        │
│                                     │
│ ─────────────────────────────────  │
│                                     │
│ 📈 Relatórios Rápidos              │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ MRR Atual                       ││
│ │ R$ 7.320,00                     ││
│ │ +12% vs mês anterior            ││
│ │ [Ver Detalhes]                  ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Taxa de Churn                   ││
│ │ 8% (4 cancelamentos)            ││
│ │ ✅ Abaixo da meta (10%)         ││
│ │ [Ver Detalhes]                  ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Inadimplência                   ││
│ │ R$ 718,00 (4 clientes)          ││
│ │ ⚠️ Requer atenção               ││
│ │ [Ver Lista]                     ││
│ └─────────────────────────────────┘│
│                                     │
│ ─────────────────────────────────  │
│                                     │
│ 📂 Relatórios Anteriores           │
│                                     │
│ • relatorio_financeiro_2025-11.xlsx│
│   [Baixar] - 2.3 MB - 01/12/2025  │
│                                     │
│ • relatorio_financeiro_2025-10.xlsx│
│   [Baixar] - 2.1 MB - 01/11/2025  │
│                                     │
│ [Ver Todos]                        │
└─────────────────────────────────────┘
```

---

## 📧 Exemplo de Email de Cobrança

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; background: #f9fafb; }
    .alert { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Pagamento em Atraso</h1>
    </div>
    
    <div class="content">
      <p>Olá <strong>João Silva</strong>,</p>
      
      <p>Identificamos que seu pagamento do <strong>SMagenda</strong> está com <strong>7 dias de atraso</strong>.</p>
      
      <div class="alert">
        <strong>⚠️ ATENÇÃO:</strong> Sua conta será <strong>SUSPENSA em 7 dias</strong> se não regularizar o pagamento.
      </div>
      
      <p><strong>Detalhes da Cobrança:</strong></p>
      <ul>
        <li>Plano: <strong>PRO</strong></li>
        <li>Valor: <strong>R$ 99,90</strong></li>
        <li>Vencimento: <strong>13/12/2025</strong></li>
        <li>Dias de atraso: <strong>7 dias</strong></li>
      </ul>
      
      <p><strong>O que acontece se minha conta for suspensa?</strong></p>
      <ul>
        <li>❌ Você não consegue acessar o sistema</li>
        <li>❌ Seus clientes não conseguem agendar</li>
        <li>❌ Lembretes automáticos param de funcionar</li>
        <li>❌ Seus funcionários ficam bloqueados</li>
      </ul>
      
      <center>
        <a href="https://smagenda.com/pagamento/abc123" class="button">
          💳 Regularizar Pagamento Agora
        </a>
      </center>
      
      <p>Caso já tenha realizado o pagamento, desconsidere este email.</p>
      
      <p>Precisa de ajuda? Responda este email ou entre em contato:</p>
      <p>📧 suporte@smagenda.com<br>
         📱 WhatsApp: (11) 9xxxx-xxxx</p>
      
      <p>Atenciosamente,<br>
      <strong>Equipe SMagenda</strong></p>
    </div>
    
    <div class="footer">
      <p>SMagenda - Sistema de Agendamento Inteligente</p>
      <p>© 2025 Todos os direitos reservados</p>
    </div>
  </div>
</body>
</html>
```

---

- Botão "Compartilhar no WhatsApp"
- Botão "Ir para minha agenda"

---</parameter>
