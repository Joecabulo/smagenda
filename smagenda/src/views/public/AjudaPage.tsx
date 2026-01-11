import { Link } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { getOptionalEnv } from '../../lib/env'
import { useAuth } from '../../state/auth/useAuth'

function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D+/g, '')
  if (!digits) return null
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function AjudaPage() {
  const { appPrincipal } = useAuth()

  const inApp = appPrincipal?.kind === 'usuario' || appPrincipal?.kind === 'funcionario'
  const backTo = inApp ? (appPrincipal?.kind === 'funcionario' ? '/funcionario/agenda' : '/dashboard') : '/login'

  const supportEmail = (getOptionalEnv('VITE_SUPORTE_EMAIL') ?? getOptionalEnv('VITE_SUPPORT_EMAIL') ?? 'suporte@smagenda.com').trim()
  const supportWhatsAppRaw = (
    getOptionalEnv('VITE_SUPORTE_WHATSAPP') ??
    getOptionalEnv('VITE_SUPPORT_WHATSAPP_NUMBER') ??
    getOptionalEnv('VITE_SUPPORT_WHATSAPP') ??
    '(31) 9 7518-4428'
  ).trim()
  const supportWhatsAppDigits = supportWhatsAppRaw ? normalizeWhatsApp(supportWhatsAppRaw) : null

  const waLink = supportWhatsAppDigits
    ? `https://wa.me/${supportWhatsAppDigits}?text=${encodeURIComponent('Olá! Preciso de ajuda com o SMagenda.')}`
    : null

  const content = (
    <div className={inApp ? '' : 'min-h-screen bg-slate-50 px-4 py-10'}>
      <div className={inApp ? 'mx-auto w-full max-w-3xl space-y-6' : 'mx-auto w-full max-w-3xl space-y-6'}>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">Ajuda e Suporte</div>
            <div className="text-sm text-slate-600">Contato, termos e dúvidas frequentes.</div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Fale com a gente</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {waLink ? (
                  <a className="inline-flex items-center gap-2 font-medium text-slate-900 hover:underline" href={waLink} target="_blank" rel="noreferrer">
                    <span>WhatsApp:</span>
                    <span className="font-semibold text-slate-900">{supportWhatsAppRaw}</span>
                  </a>
                ) : (
                  <div className="text-slate-600">WhatsApp do suporte não configurado.</div>
                )}

                <a className="block font-medium text-slate-900 hover:underline" href={`mailto:${supportEmail}`}>
                  Email: {supportEmail}
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Documentos</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link to="/termos" className="font-medium text-slate-900 hover:underline">
                  Termos de Uso
                </Link>
                <Link to="/privacidade" className="font-medium text-slate-900 hover:underline">
                  Política de Privacidade
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Perguntas frequentes</div>
              <div className="mt-3 space-y-3">
                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">Como o cliente agenda pelo link público?</summary>
                  <div className="mt-2 text-sm text-slate-700">
                    Você configura os serviços e horários; depois compartilha o link /agendar/SEU-SLUG. O cliente escolhe serviço, dia e horário e confirma.
                  </div>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">Não estou recebendo email de confirmação do Supabase</summary>
                  <div className="mt-2 text-sm text-slate-700">
                    Verifique spam e configure SMTP em Authentication → SMTP Settings. No painel admin do SMagenda existe uma área de validação do Resend.
                  </div>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">Como funcionam serviços de dia inteiro?</summary>
                  <div className="mt-2 text-sm text-slate-700">
                    Marque o serviço como “dia inteiro” e defina a capacidade diária (1 ou 2). No link público, o cliente escolhe a data em um calendário com dias disponíveis.
                  </div>
                </details>

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">Onde vejo e altero os horários de trabalho?</summary>
                  <div className="mt-2 text-sm text-slate-700">
                    No painel do usuário você configura horários base. Para funcionários, cada profissional pode ajustar seus horários na própria agenda.
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-slate-600">
          <Link to={backTo} className="hover:underline">
            Voltar
          </Link>
        </div>
      </div>
    </div>
  )

  return inApp ? <AppShell>{content}</AppShell> : content
}
