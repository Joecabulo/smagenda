import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

const defaultConfirmacao = `Olá {nome}!\n\nSeu agendamento foi confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n💰 {preco}\n\nLocal: {endereco}\n\nNos vemos em breve!\n{nome_negocio}`
const defaultLembrete = `Oi {nome}!\n\nLembrete: você tem agendamento amanhã às {hora}.\n\nSe não puder comparecer, me avise!\n{telefone_profissional}`

export function MensagensSettingsPage() {
  const { principal } = useAuth()
  const usuarioId =
    principal?.kind === 'usuario' ? principal.profile.id : principal?.kind === 'funcionario' ? principal.profile.usuario_master_id : null
  const canEdit = useMemo(() => principal?.kind === 'usuario' && Boolean(usuarioId), [principal?.kind, usuarioId])

  const [mensagemConfirmacao, setMensagemConfirmacao] = useState(defaultConfirmacao)
  const [mensagemLembrete, setMensagemLembrete] = useState(defaultLembrete)
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(true)
  const [enviarLembrete, setEnviarLembrete] = useState(false)
  const [lembreteHorasAntes, setLembreteHorasAntes] = useState(24)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [schemaIncompleto, setSchemaIncompleto] = useState(false)

  const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setSchemaIncompleto(false)

      const { data: baseData, error: baseErr } = await supabase
        .from('usuarios')
        .select('mensagem_confirmacao,mensagem_lembrete')
        .eq('id', usuarioId)
        .maybeSingle()

      if (baseErr) {
        setError(baseErr.message)
        setLoading(false)
        return
      }

      const baseRow = (baseData ?? null) as unknown as { mensagem_confirmacao?: string | null; mensagem_lembrete?: string | null } | null
      setMensagemConfirmacao(baseRow?.mensagem_confirmacao ?? defaultConfirmacao)
      setMensagemLembrete(baseRow?.mensagem_lembrete ?? defaultLembrete)

      const { data: extraData, error: extraErr } = await supabase
        .from('usuarios')
        .select('enviar_confirmacao,enviar_lembrete,lembrete_horas_antes')
        .eq('id', usuarioId)
        .maybeSingle()

      if (extraErr) {
        if (isMissingColumnError(extraErr.message)) {
          setSchemaIncompleto(true)
          setEnviarConfirmacao(true)
          setEnviarLembrete(false)
          setLembreteHorasAntes(24)
          setLoading(false)
          return
        }
        setError(extraErr.message)
        setLoading(false)
        return
      }
      const row =
        (extraData ?? null) as unknown as {
          enviar_confirmacao?: boolean | null
          enviar_lembrete?: boolean | null
          lembrete_horas_antes?: number | null
        } | null
      setEnviarConfirmacao(row?.enviar_confirmacao ?? true)
      setEnviarLembrete(row?.enviar_lembrete ?? false)
      setLembreteHorasAntes(typeof row?.lembrete_horas_antes === 'number' ? row?.lembrete_horas_antes : 24)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar mensagens')
      setLoading(false)
    })
  }, [usuarioId])

  const save = async () => {
    if (!usuarioId) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const { error: baseErr } = await supabase
      .from('usuarios')
      .update({ mensagem_confirmacao: mensagemConfirmacao, mensagem_lembrete: mensagemLembrete })
      .eq('id', usuarioId)

    if (baseErr) {
      setError(baseErr.message)
      setSaving(false)
      return
    }

    const { error: extraErr } = await supabase
      .from('usuarios')
      .update({ enviar_confirmacao: enviarConfirmacao, enviar_lembrete: enviarLembrete, lembrete_horas_antes: lembreteHorasAntes })
      .eq('id', usuarioId)

    if (extraErr) {
      if (isMissingColumnError(extraErr.message)) {
        setSchemaIncompleto(true)
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        return
      }
      setError(extraErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-semibold text-slate-500">Configurações</div>
          <div className="text-xl font-semibold text-slate-900">Mensagens automáticas</div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {schemaIncompleto ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Seu Supabase ainda não tem as colunas de automação do WhatsApp. Execute o SQL do WhatsApp (automação) no painel de Admin.
          </div>
        ) : null}
        {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Preferências de envio</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={enviarConfirmacao} onChange={(e) => setEnviarConfirmacao(e.target.checked)} disabled={!canEdit || saving} />
                  Enviar confirmação ao confirmar agendamento
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={enviarLembrete} onChange={(e) => setEnviarLembrete(e.target.checked)} disabled={!canEdit || saving} />
                  Enviar lembrete automático
                </label>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">Enviar lembrete X horas antes</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={4}
                      max={72}
                      step={1}
                      value={lembreteHorasAntes}
                      onChange={(e) => setLembreteHorasAntes(Number(e.target.value))}
                      disabled={!canEdit || saving || !enviarLembrete}
                      className="w-full"
                    />
                    <div className="text-sm font-semibold text-slate-900 w-12 text-right">{lembreteHorasAntes}h</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Mensagem de confirmação</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : (
              <textarea
                className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                value={mensagemConfirmacao}
                onChange={(e) => setMensagemConfirmacao(e.target.value)}
                disabled={!canEdit || saving}
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Mensagem de lembrete</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : (
              <textarea
                className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                value={mensagemLembrete}
                onChange={(e) => setMensagemLembrete(e.target.value)}
                disabled={!canEdit || saving}
              />
            )}
          </div>
        </Card>

        {canEdit ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || loading}>
              Salvar
            </Button>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Edição disponível apenas para a conta master.</div>
        )}
      </div>
    </AppShell>
  )
}
