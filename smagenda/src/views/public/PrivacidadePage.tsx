import { Link } from 'react-router-dom'

const PRIVACY_VERSION = '2026-01-11'

export function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">Política de Privacidade — SMagenda</div>
            <div className="text-sm text-slate-600">Versão {PRIVACY_VERSION}</div>
          </div>

          <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">1. Visão geral</div>
              <div>
                Esta Política explica como o SMagenda trata dados pessoais ao oferecer a Plataforma. Em muitos casos, o seu negócio é o
                “Controlador” dos dados dos seus clientes, e o SMagenda atua como “Operador”, tratando dados conforme suas instruções.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">2. Quais dados tratamos</div>
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-slate-900">Dados de conta:</span> nome, e-mail, telefone, nome do negócio, slug,
                  configurações.
                </div>
                <div>
                  <span className="font-medium text-slate-900">Dados de agendamentos:</span> informações inseridas por você, como nome e
                  telefone do cliente, datas/horários, serviço, observações e campos extras (ex.: endereço).
                </div>
                <div>
                  <span className="font-medium text-slate-900">Dados técnicos:</span> registros de autenticação e segurança, e quando
                  disponível, IP e user-agent no registro de aceite.
                </div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">3. Finalidades e bases legais</div>
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-slate-900">Prestação do serviço:</span> operar a agenda, criar e listar agendamentos,
                  autenticação e suporte.
                </div>
                <div>
                  <span className="font-medium text-slate-900">Cumprimento legal e segurança:</span> prevenção a fraudes, auditoria e
                  manutenção de logs.
                </div>
                <div>
                  <span className="font-medium text-slate-900">Comunicações:</span> envio de confirmações e lembretes conforme sua
                  configuração e instruções.
                </div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">4. Compartilhamento</div>
              <div>
                Podemos compartilhar dados com provedores necessários para operar o serviço (por exemplo: infraestrutura, envio de
                e-mails e integrações de mensagens), sempre com finalidade compatível e medidas de segurança. Não vendemos dados pessoais.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">5. Armazenamento, retenção e segurança</div>
              <div>
                Aplicamos medidas técnicas e organizacionais para proteger dados. Mantemos dados enquanto sua conta estiver ativa e pelo
                tempo necessário para cumprir obrigações legais, resolver disputas e fazer cumprir acordos.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">6. Direitos do titular (LGPD)</div>
              <div>
                Titulares podem ter direitos como confirmação, acesso, correção e eliminação. Quando o dado pertence aos seus clientes,
                normalmente o pedido deve ser direcionado ao seu negócio (Controlador). Podemos auxiliar tecnicamente mediante sua
                solicitação.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">7. Cookies e tecnologias similares</div>
              <div>
                Podemos usar armazenamento local e recursos essenciais para autenticação e experiência do usuário. Caso usemos cookies
                adicionais, poderemos apresentar aviso/gestão conforme aplicável.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">8. Transferência internacional</div>
              <div>
                Alguns provedores podem processar dados fora do Brasil. Adotamos salvaguardas contratuais e medidas de segurança quando
                aplicável.
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">9. Alterações desta Política</div>
              <div>
                Podemos atualizar esta Política e, quando necessário, solicitar novo aceite.
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
            <Link to="/termos" className="font-medium text-slate-900 hover:underline">
              Ler Termos de Uso
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

