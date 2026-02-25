import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../state/auth/useAuth'
import { getOptionalEnv } from '../../lib/env'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { principal, appPrincipal, impersonation, stopImpersonation, signOut, masterUsuario } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isFuncionario = appPrincipal?.kind === 'funcionario'
  const isFuncionarioAdmin = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : isFuncionarioAdmin ? masterUsuario : null
  const temaProspector = usuario?.tema_prospector_habilitado === true
  const isAgendaPage = location.pathname === '/dashboard' || location.pathname === '/funcionario/agenda'
  const [temaTick, setTemaTick] = useState(0)
  const temaDark = useMemo(() => {
    void temaTick
    if (!usuario?.id) return false
    const fromProfile = usuario.tema_dark_habilitado === true
    let fromStorage = false
    try {
      const v = window.localStorage.getItem(`smagenda:theme:dark:${usuario.id}`)
      fromStorage = Boolean(v && (v === '1' || v.toLowerCase() === 'true'))
    } catch {
      fromStorage = false
    }
    return fromProfile || fromStorage
  }, [usuario?.id, usuario?.tema_dark_habilitado, temaTick])

  const plano = String(usuario?.plano ?? '').trim().toLowerCase()
  const isProPlus = plano === 'pro' || plano === 'team' || plano === 'enterprise'

  const supportNumber = getOptionalEnv('VITE_SUPPORT_WHATSAPP_NUMBER')
  const canUseWhatsappSupport = Boolean(supportNumber && usuario && isProPlus)

  const [notifMessage, setNotifMessage] = useState<string | null>(null)
  const [notifCount, setNotifCount] = useState(0)
  const notifiedIdsRef = useRef<Set<string>>(new Set())

  const browserNotifsKey = useMemo(() => {
    if (!appPrincipal) return 'smagenda:notifs:usuario'
    const kind = appPrincipal.kind
    if (kind === 'usuario') {
      const id = appPrincipal.profile.id
      return id ? `smagenda:notifs:usuario:${id}` : 'smagenda:notifs:usuario'
    }
    if (kind === 'funcionario') {
      const id = appPrincipal.profile.id
      return id ? `smagenda:notifs:funcionario:${id}` : 'smagenda:notifs:funcionario'
    }
    return 'smagenda:notifs:usuario'
  }, [appPrincipal])

  const [browserNotifsPermission, setBrowserNotifsPermission] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window === 'undefined') return 'default'
    if (!('Notification' in window)) return 'denied'
    return Notification.permission
  })
  const [browserNotifsEnabled, setBrowserNotifsEnabled] = useState(false)

  useEffect(() => {
    try {
      setBrowserNotifsEnabled(window.localStorage.getItem(browserNotifsKey) === '1')
    } catch {
      setBrowserNotifsEnabled(false)
    }
  }, [browserNotifsKey])

  const enableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotifsPermission('denied')
      return
    }
    try {
      const perm = await Notification.requestPermission()
      setBrowserNotifsPermission(perm)
      if (perm === 'granted') {
        try {
          window.localStorage.setItem(browserNotifsKey, '1')
        } catch {
          return
        }
        setBrowserNotifsEnabled(true)
      }
    } catch {
      setBrowserNotifsPermission('denied')
    }
  }

  useEffect(() => {
    if (!appPrincipal) return
    if (isAgendaPage) return

    const kind = appPrincipal.kind
    const isFuncionarioLocal = kind === 'funcionario'
    const isFuncionarioAdminLocal = isFuncionarioLocal && appPrincipal.profile.permissao === 'admin'
    const usuarioId =
      kind === 'usuario'
        ? appPrincipal.profile.id
        : isFuncionarioAdminLocal
          ? masterUsuario?.id ?? ''
          : isFuncionarioLocal
            ? appPrincipal.profile.usuario_master_id
            : ''
    const funcionarioId = isFuncionarioLocal && !isFuncionarioAdminLocal ? appPrincipal.profile.id : null
    if (!usuarioId) return

    const channel = supabase.channel(`agendamentos-appshell:${usuarioId}:${funcionarioId ?? 'all'}`)
    const handleIncoming = async (idRaw: unknown) => {
      const id = typeof idRaw === 'string' ? idRaw.trim() : ''
      if (!id) return
      if (notifiedIdsRef.current.has(id)) return
      notifiedIdsRef.current.add(id)

      const { data: agRow, error: agErr } = await supabase
        .from('agendamentos')
        .select('id,cliente_nome,data,hora_inicio,status,funcionario_id')
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .maybeSingle()

      if (agErr || !agRow) return
      const r = agRow as unknown as Record<string, unknown>
      if (String(r.status ?? '').trim().toLowerCase() === 'cancelado') return
      if (funcionarioId && String(r.funcionario_id ?? '') !== funcionarioId) return

      const data = String(r.data ?? '')
      const hora = String(r.hora_inicio ?? '').trim().slice(0, 5)
      const nome = String(r.cliente_nome ?? '').trim()
      const dateLabel = (() => {
        const parts = data.split('-')
        if (parts.length !== 3) return data
        return `${parts[2]}/${parts[1]}/${parts[0]}`
      })()

      const msg = `Novo agendamento: ${dateLabel} ${hora}${nome ? ` • ${nome}` : ''}`
      setNotifMessage(msg)
      setNotifCount((prev) => prev + 1)

      if (
        browserNotifsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          new Notification('Novo agendamento', { body: `${dateLabel} ${hora}${nome ? ` • ${nome}` : ''}` })
        } catch {
          return
        }
      }
    }

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agendamentos',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          void handleIncoming((payload as { new?: { id?: unknown } }).new?.id)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agendamentos',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          void handleIncoming((payload as { new?: { id?: unknown } }).new?.id)
        }
      )

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [appPrincipal, browserNotifsEnabled, isAgendaPage, masterUsuario?.id])

  useEffect(() => {
    if (!isAgendaPage) return
    if (!notifCount && !notifMessage) return
    setNotifCount(0)
    setNotifMessage(null)
  }, [isAgendaPage, notifCount, notifMessage])

  const nav = isFuncionario && !isFuncionarioAdmin
    ? [
        { to: '/funcionario/agenda', label: 'Minha Agenda' },
        { to: '/ajuda', label: 'Ajuda' },
      ]
    : isFuncionarioAdmin
      ? [
          ...(funcionario?.pode_ver_agenda ? [{ to: '/dashboard', label: 'Agenda' }] : []),
          ...(funcionario?.pode_ver_agenda ? [{ to: '/funcionario/agenda', label: 'Minha Agenda' }] : []),
          ...(funcionario?.pode_gerenciar_servicos ? [{ to: '/servicos', label: 'Meus Serviços' }] : []),
          ...(funcionario?.pode_ver_clientes_de_outros ? [{ to: '/clientes', label: 'Clientes' }] : []),
          ...(isProPlus && funcionario?.pode_ver_financeiro ? [{ to: '/relatorios', label: 'Relatórios' }] : []),
          { to: '/ajuda', label: 'Ajuda' },
        ]
      : [
          { to: '/dashboard', label: 'Agenda' },
          { to: '/servicos', label: 'Meus Serviços' },
          { to: '/clientes', label: 'Clientes' },
          ...(isProPlus ? [{ to: '/relatorios', label: 'Relatórios' }] : []),
          { to: '/pagamento', label: 'Pagamento' },
          { to: '/funcionarios', label: 'Funcionários' },
          { to: '/configuracoes/whatsapp', label: 'WhatsApp' },
          { to: '/configuracoes/mensagens', label: 'Mensagens Automáticas' },
          { to: '/configuracoes/pagina-publica', label: 'Página Pública' },
          { to: '/ajuda', label: 'Ajuda' },
        ]

  return (
    <div className={['min-h-screen bg-slate-50', temaProspector ? 'theme-prospector' : temaDark ? 'theme-dark' : ''].filter(Boolean).join(' ')}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-lg font-semibold text-slate-900">
              {appPrincipal?.kind === 'usuario'
                ? appPrincipal.profile.nome_negocio
                : appPrincipal?.kind === 'funcionario'
                  ? `Olá, ${appPrincipal.profile.nome_completo}`
                  : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canUseWhatsappSupport ? (
              <a
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-emerald-600 text-white hover:bg-emerald-500"
                href={`https://wa.me/${encodeURIComponent(String(supportNumber))}?text=${encodeURIComponent('Olá! Preciso de suporte no SMagenda.')}`}
                target="_blank"
                rel="noreferrer"
              >
                Suporte WhatsApp
              </a>
            ) : null}
            {principal?.kind === 'super_admin' && impersonation ? (
              <Button
                variant="secondary"
                onClick={() => {
                  stopImpersonation()
                  navigate('/admin/clientes')
                }}
              >
                Voltar ao admin
              </Button>
            ) : null}
            {usuario ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  const next = !temaDark
                  setTemaTick((v) => v + 1)
                  try {
                    window.localStorage.setItem(`smagenda:theme:dark:${usuario.id}`, next ? '1' : '0')
                  } catch {
                    void 0
                  }
                  await supabase.from('usuarios').update({ tema_dark_habilitado: next }).eq('id', usuario.id)
                }}
              >
                {temaDark ? 'Claro' : 'Dark'}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => signOut()}>
              Sair
            </Button>
          </div>
        </div>

        {browserNotifsPermission !== 'granted' ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3">
            <div>Ative as notificações do navegador para receber alertas de novos agendamentos.</div>
            <Button variant="secondary" onClick={enableBrowserNotifications}>
              Ativar notificações
            </Button>
          </div>
        ) : null}

        {notifMessage ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center justify-between gap-3">
            <div className="font-medium">{notifMessage}</div>
            <div className="flex items-center gap-2">
              {notifCount > 1 ? <div className="text-xs text-emerald-800">+{notifCount - 1} novos</div> : null}
              <Button
                variant="secondary"
                onClick={() => {
                  setNotifCount(0)
                  setNotifMessage(null)
                  navigate(isFuncionario && !isFuncionarioAdmin ? '/funcionario/agenda' : '/dashboard')
                }}
              >
                Ver agenda
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setNotifCount(0)
                  setNotifMessage(null)
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          <nav className="md:sticky md:top-6 md:h-fit">
            <div className="rounded-xl border border-slate-200 bg-white p-2">
              {nav.map((item) => {
                const active = location.pathname === item.to
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={[
                      'block rounded-lg px-3 py-2 text-sm font-medium',
                      active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </nav>

          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
