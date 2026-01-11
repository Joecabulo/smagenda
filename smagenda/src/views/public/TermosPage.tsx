import { Link } from 'react-router-dom'

const TERMS_VERSION = '2026-01-11'

export function TermosPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">Termos de Uso — SMagenda</div>
            <div className="text-sm text-slate-600">Versão {TERMS_VERSION}</div>
          </div>

          <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">1. Aceite</div>
              <div>
                Ao criar uma conta, acessar ou usar o SMagenda (“Plataforma”), você declara que leu e concorda com estes Termos de
                Uso e com a Política de Privacidade. Se você não concordar, não utilize a Plataforma.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">2. Quem pode usar</div>
              <div>
                Você deve ter capacidade legal para contratar e fornecer informações verdadeiras. Se você cria a conta em nome de uma
                empresa, você declara ter poderes para representá-la.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">3. O que a Plataforma faz</div>
              <div>
                O SMagenda é um sistema de gestão de agenda, serviços e clientes, incluindo uma página pública para agendamentos
                (“Link Público”). A Plataforma não presta os serviços finais ao cliente do seu negócio — você é o responsável pelo
                atendimento, execução do serviço, preços e políticas do seu estabelecimento.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">4. Conta, acesso e segurança</div>
              <div>
                Você é responsável por manter a confidencialidade das credenciais de acesso e por toda atividade ocorrida na sua conta.
                Em caso de suspeita de uso indevido, altere sua senha e entre em contato com o suporte.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">5. Conteúdo e dados inseridos</div>
              <div>
                Você mantém a titularidade dos dados inseridos (por exemplo: cadastros, serviços e agendamentos). Você garante que tem
                base legal para tratar os dados dos seus clientes e profissionais e que cumprirá a legislação aplicável, inclusive a
                LGPD.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">6. Mensagens e comunicações</div>
              <div>
                A Plataforma pode integrar-se a canais como WhatsApp e e-mail para lembretes e confirmações. Você é o responsável pelo
                conteúdo das mensagens e por obter consentimentos quando necessário. A disponibilidade de provedores terceiros pode
                variar.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">7. Planos, pagamento e limitações</div>
              <div>
                Recursos podem variar por plano e podem existir limites de uso (por exemplo: número de funcionários). Condições de
                cobrança, reajustes e períodos de teste, quando aplicáveis, podem ser informados no momento da contratação.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">8. Proibições</div>
              <div>
                É proibido: usar a Plataforma para fins ilícitos; tentar explorar vulnerabilidades; interferir no funcionamento do
                serviço; automatizar acessos sem autorização; ou violar direitos de terceiros.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">9. Disponibilidade e suporte</div>
              <div>
                Buscamos alta disponibilidade, mas podem ocorrer indisponibilidades por manutenção, atualizações, falhas de rede ou
                serviços de terceiros. Poderemos realizar melhorias e mudanças na Plataforma.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">10. Propriedade intelectual</div>
              <div>
                A Plataforma, marcas e softwares associados pertencem ao Single Motion e/ou seus licenciadores. Você não recebe qualquer
                direito de propriedade sobre a Plataforma.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">11. Rescisão e encerramento</div>
              <div>
                Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar o acesso em caso de violação destes
                Termos, exigências legais, segurança ou uso abusivo. Podemos manter registros quando exigidos por lei.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">12. Limitação de responsabilidade</div>
              <div>
                Na máxima extensão permitida pela lei, não nos responsabilizamos por perdas indiretas, lucros cessantes ou danos
                decorrentes do uso do serviço, incluindo falhas de terceiros (por exemplo: internet, provedores de mensagens, e-mail).
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">13. Alterações</div>
              <div>
                Podemos atualizar estes Termos. Quando houver alteração relevante, poderemos solicitar novo aceite. A versão vigente
                estará sempre disponível nesta página.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">14. Contato</div>
              <div>
                Para dúvidas, solicite suporte pelos canais informados no painel da Plataforma.
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
            <Link to="/privacidade" className="font-medium text-slate-900 hover:underline">
              Ler Política de Privacidade
            </Link>
            <Link to="/cadastro" className="text-slate-600 hover:underline">
              Voltar ao cadastro
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

