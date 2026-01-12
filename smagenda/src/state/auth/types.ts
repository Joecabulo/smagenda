export type UsuarioProfile = {
  id: string
  nome_completo: string
  nome_negocio: string
  slug: string
  tipo_negocio: string | null
  logo_url: string | null
  telefone: string | null
  email: string
  endereco: string | null
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  whatsapp_api_url: string | null
  stripe_customer_id: string | null
  plano: 'free' | 'basic' | 'pro' | 'team' | 'enterprise'
  tipo_conta: 'master' | 'individual'
  limite_funcionarios: number | null
  status_pagamento: 'ativo' | 'inadimplente' | 'cancelado' | 'trial' | 'suspenso'
  data_vencimento: string | null
  free_trial_consumido: boolean
  ativo: boolean
}

export type FuncionarioProfile = {
  id: string
  usuario_master_id: string
  nome_completo: string
  email: string
  telefone: string | null
  permissao: 'admin' | 'funcionario' | 'atendente'
  pode_ver_agenda: boolean
  pode_criar_agendamentos: boolean
  pode_cancelar_agendamentos: boolean
  pode_bloquear_horarios: boolean
  pode_ver_financeiro: boolean
  pode_gerenciar_servicos: boolean
  pode_ver_clientes_de_outros: boolean
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  capacidade_dia_inteiro: number
  ativo: boolean
}

export type SuperAdminProfile = {
  id: string
  nome: string
  email: string
  nivel: 'super_admin' | 'suporte' | number
}

export type Principal =
  | { kind: 'usuario'; profile: UsuarioProfile }
  | { kind: 'funcionario'; profile: FuncionarioProfile }
  | { kind: 'super_admin'; profile: SuperAdminProfile }
