import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { slugify } from '../../lib/slug'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'
import type { UsuarioProfile } from '../../state/auth/types'

type Step = 1 | 2 | 3 | 4

const weekdayOptions = [
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
]

const tipoNegocioOptions = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'salao', label: 'Salão' },
  { value: 'estetica', label: 'Estética' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'advocacia', label: 'Advocacia' },
  { value: 'manicure', label: 'Manicure' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'academia', label: 'Academia' },
  { value: 'lava_jatos', label: 'Lava-jato' },
  { value: 'faxina', label: 'Faxina / Diarista' },
]

export function OnboardingPage() {
  const { loading, appPrincipal, masterUsuario, masterUsuarioLoading, refresh } = useAuth()
  const isGerente = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'

  if (loading || (isGerente && masterUsuarioLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando…</div>
      </div>
    )
  }

  if (!appPrincipal) {
    return <div className="text-slate-700">Conta inválida para onboarding.</div>
  }

  const usuario = appPrincipal.kind === 'usuario' ? appPrincipal.profile : isGerente ? masterUsuario : null

  if (!usuario) {
    return <div className="text-slate-700">Conta inválida para onboarding.</div>
  }

  return <OnboardingInner key={usuario.id} usuario={usuario} refresh={refresh} />
}

function OnboardingInner({ usuario, refresh }: { usuario: UsuarioProfile; refresh: () => Promise<unknown> }) {
  const usuarioId = usuario.id
  const slug = usuario.slug

  const [step, setStep] = useState<Step>(1)
  const [tipoNegocio, setTipoNegocio] = useState(() => String(usuario.tipo_negocio ?? ''))
  const [unidadeNome, setUnidadeNome] = useState(() => String(usuario.nome_negocio ?? ''))
  const [enderecoEstabelecimento, setEnderecoEstabelecimento] = useState(() => String(usuario.endereco ?? ''))
  const [horarioInicio, setHorarioInicio] = useState(() => String(usuario.horario_inicio ?? '08:00'))
  const [horarioFim, setHorarioFim] = useState(() => String(usuario.horario_fim ?? '18:00'))
  const [dias, setDias] = useState<number[]>(() => (Array.isArray(usuario.dias_trabalho) && usuario.dias_trabalho.length ? usuario.dias_trabalho : [1, 2, 3, 4, 5, 6]))
  const [intervaloInicio, setIntervaloInicio] = useState(() => String(usuario.intervalo_inicio ?? ''))
  const [intervaloFim, setIntervaloFim] = useState(() => String(usuario.intervalo_fim ?? ''))
  const [logoUrl, setLogoUrl] = useState(() => String(usuario.logo_url ?? ''))
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)

  const [servicoNome, setServicoNome] = useState('')
  const [servicoDuracao, setServicoDuracao] = useState('45')
  const [servicoPreco, setServicoPreco] = useState('')
  const [servicoCor, setServicoCor] = useState('#0f172a')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linkPublico = useMemo(() => (slug ? `${window.location.origin}/agendar/${slug}` : ''), [slug])

  const logoObjectUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile])

  useEffect(() => {
    if (!logoObjectUrl) return
    return () => {
      URL.revokeObjectURL(logoObjectUrl)
    }
  }, [logoObjectUrl])

  const toggleDia = (day: number) => {
    setDias((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const uploadLogo = async (file: File) => {
    const safeName = file.name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 80)

    const key = `${usuarioId}/logo-${Date.now()}-${safeName || 'logo'}`

    const { error: uploadErr } = await supabase.storage.from('logos').upload(key, file, {
      upsert: true,
      contentType: file.type || undefined,
    })
    if (uploadErr) throw uploadErr

    const { data } = supabase.storage.from('logos').getPublicUrl(key)
    const publicUrl = data?.publicUrl
    if (!publicUrl) throw new Error('Não foi possível obter a URL pública do logo')
    return publicUrl
  }

  const saveStep1 = async () => {
    setSubmitting(true)
    setError(null)

    const cleanTipo = tipoNegocio.trim()
    if (!cleanTipo) {
      setError('Selecione o tipo de negócio.')
      setSubmitting(false)
      return
    }

    const cleanUnidadeNome = unidadeNome.trim()
    if (!cleanUnidadeNome) {
      setError('Informe o nome da unidade.')
      setSubmitting(false)
      return
    }

    const cleanEndereco = enderecoEstabelecimento.trim()
    if (!cleanEndereco) {
      setError('Informe o endereço do estabelecimento.')
      setSubmitting(false)
      return
    }

    if (!dias.length) {
      setError('Selecione ao menos um dia de funcionamento.')
      setSubmitting(false)
      return
    }

    let nextLogoUrl: string | null = logoUrl.trim() ? logoUrl.trim() : null
    if (logoFile) {
      try {
        const publicUrl = await uploadLogo(logoFile)
        nextLogoUrl = publicUrl
        setLogoUrl(publicUrl)
        setLogoFile(null)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha ao enviar logo'
        const lower = msg.toLowerCase()
        const missingBucket = lower.includes('bucket') || lower.includes('not found')
        const rls = lower.includes('row-level security') || lower.includes('row level security')
        setError(
          missingBucket
            ? 'Configuração do Supabase incompleta: crie o bucket "logos" no Storage e habilite leitura pública + upload do próprio usuário.'
            : rls
              ? 'Sem permissão para enviar ao Storage. Execute o SQL do Storage (logos) em /admin/configuracoes.'
            : msg
        )
        setSubmitting(false)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        tipo_negocio: cleanTipo,
        endereco: cleanEndereco,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        dias_trabalho: dias,
        intervalo_inicio: intervaloInicio || null,
        intervalo_fim: intervaloFim || null,
        logo_url: nextLogoUrl,
      })
      .eq('id', usuarioId)
    if (updateError) {
      const msg = updateError.message
      const lower = msg.toLowerCase()
      const rls = lower.includes('row-level security') || lower.includes('row level security')
      setError(rls ? 'Sem permissão para atualizar seu perfil (RLS). Execute o SQL de políticas (Usuário / Funcionário) em /admin/configuracoes.' : msg)
      setSubmitting(false)
      return
    }
    await supabase.auth.updateUser({ data: { unidade_nome: cleanUnidadeNome } })

    const unidadeSlug = slugify(cleanUnidadeNome).slice(0, 60)
    if (unidadeSlug) {
      const { data: existing, error: unitErr } = await supabase.from('unidades').select('id,endereco').eq('usuario_id', usuarioId).limit(1)
      if (!unitErr && (!existing || existing.length === 0)) {
        await supabase.from('unidades').insert({ usuario_id: usuarioId, nome: cleanUnidadeNome, slug: unidadeSlug, endereco: cleanEndereco })
      } else if (!unitErr && existing && existing.length > 0) {
        const first = (existing[0] ?? null) as unknown as { id?: string; endereco?: string | null } | null
        const id = typeof first?.id === 'string' ? first.id : null
        const currEndereco = typeof first?.endereco === 'string' ? first.endereco.trim() : ''
        if (id && !currEndereco) {
          await supabase.from('unidades').update({ endereco: cleanEndereco }).eq('id', id).eq('usuario_id', usuarioId)
        }
      }
    }

    await refresh()
    setSubmitting(false)
    setStep(2)
  }

  const saveStep2 = async () => {
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('servicos').insert({
      usuario_id: usuarioId,
      nome: servicoNome,
      duracao_minutos: Number(servicoDuracao),
      preco: servicoPreco ? Number(servicoPreco) : 0,
      cor: servicoCor,
      ativo: true,
      ordem: 0,
    })
    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setStep(3)
  }

  const saveStep3 = async () => {
    setSubmitting(true)
    setError(null)
    setSubmitting(false)
    setStep(4)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(linkPublico)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold text-slate-500">Onboarding</div>
        <div className="text-xl font-semibold text-slate-900">Configurar sua conta</div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      {step === 1 ? (
        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Etapa 1: Configuração inicial</div>
            <label className="block">
              <div className="text-sm font-medium text-slate-700 mb-1">Tipo de negócio</div>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                value={tipoNegocio}
                onChange={(e) => setTipoNegocio(e.target.value)}
              >
                <option value="">Selecione…</option>
                {tipoNegocioOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <Input label="Nome da unidade" value={unidadeNome} onChange={(e) => setUnidadeNome(e.target.value)} />
            <Input label="Endereço do estabelecimento" value={enderecoEstabelecimento} onChange={(e) => setEnderecoEstabelecimento(e.target.value)} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Início" type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)} />
              <Input label="Fim" type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)} />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Dias de trabalho</div>
              <div className="flex flex-wrap gap-2">
                {weekdayOptions.map((d) => (
                  <button
                    type="button"
                    key={d.value}
                    onClick={() => toggleDia(d.value)}
                    className={[
                      'h-9 w-9 rounded-lg border text-sm font-semibold',
                      dias.includes(d.value) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200',
                    ].join(' ')}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Intervalo (opcional) início" type="time" value={intervaloInicio} onChange={(e) => setIntervaloInicio(e.target.value)} />
              <Input label="Intervalo (opcional) fim" type="time" value={intervaloFim} onChange={(e) => setIntervaloFim(e.target.value)} />
            </div>

            {(logoObjectUrl || logoUrl.trim()) && !logoFailed ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <img
                    src={logoObjectUrl ?? logoUrl.trim()}
                    alt="Logo"
                    className="h-12 w-12 rounded-xl object-cover border border-slate-200"
                    onError={() => setLogoFailed(true)}
                  />
                  <div className="text-sm text-slate-700">Logo atual</div>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setLogoFile(null)
                    setLogoUrl('')
                    setLogoFailed(false)
                  }}
                >
                  Remover
                </Button>
              </div>
            ) : null}

            <Input
              label="Logo (imagem opcional)"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (!file) {
                  setLogoFile(null)
                  setLogoFailed(false)
                  return
                }
                if (!file.type.startsWith('image/')) {
                  setError('Selecione um arquivo de imagem (PNG/JPG/WebP).')
                  setLogoFile(null)
                  return
                }
                const maxBytes = 2 * 1024 * 1024
                if (file.size > maxBytes) {
                  setError('Imagem muito grande (máx 2MB).')
                  setLogoFile(null)
                  return
                }
                setError(null)
                setLogoFailed(false)
                setLogoFile(file)
              }}
            />
            <div className="flex justify-end">
              <Button onClick={saveStep1} disabled={submitting}>
                Continuar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Etapa 2: Primeiro serviço</div>
            <Input label="Nome do serviço" value={servicoNome} onChange={(e) => setServicoNome(e.target.value)} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Duração (min)" type="number" value={servicoDuracao} onChange={(e) => setServicoDuracao(e.target.value)} />
              <Input label="Preço" type="number" value={servicoPreco} onChange={(e) => setServicoPreco(e.target.value)} />
            </div>
            <Input label="Cor" type="color" value={servicoCor} onChange={(e) => setServicoCor(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={saveStep2} disabled={submitting || !servicoNome.trim()}>
                Continuar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Etapa 3: WhatsApp</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              A configuração do WhatsApp só é habilitada após adquirir um plano, ou contate o suporte para mais informações.
            </div>

            <div className="flex justify-end">
              <Button onClick={saveStep3} disabled={submitting}>
                Continuar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Etapa 4: Pronto</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 break-all">{linkPublico}</div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={copyLink}>
                Copiar link
              </Button>
              <a
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
                href={`https://wa.me/?text=${encodeURIComponent(linkPublico)}`}
                target="_blank"
              >
                Compartilhar no WhatsApp
              </a>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => (window.location.href = '/dashboard')}>Ir para minha agenda</Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
