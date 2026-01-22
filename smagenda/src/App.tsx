import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './state/auth/RequireAuth'

const PublicBookingPage = lazy(() => import('./views/public/PublicBookingPage').then((m) => ({ default: m.PublicBookingPage })))
const LandingPage = lazy(() => import('./views/public/LandingPage').then((m) => ({ default: m.LandingPage })))
const TermosPage = lazy(() => import('./views/public/TermosPage').then((m) => ({ default: m.TermosPage })))
const PrivacidadePage = lazy(() => import('./views/public/PrivacidadePage').then((m) => ({ default: m.PrivacidadePage })))
const AjudaPage = lazy(() => import('./views/public/AjudaPage').then((m) => ({ default: m.AjudaPage })))

const LoginPage = lazy(() => import('./views/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const CadastroPage = lazy(() => import('./views/auth/CadastroPage').then((m) => ({ default: m.CadastroPage })))
const OnboardingPage = lazy(() => import('./views/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const ForgotPasswordPage = lazy(() => import('./views/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./views/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))

const DashboardPage = lazy(() => import('./views/app/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ServicosPage = lazy(() => import('./views/app/ServicosPage').then((m) => ({ default: m.ServicosPage })))
const FuncionariosPage = lazy(() => import('./views/app/FuncionariosPage').then((m) => ({ default: m.FuncionariosPage })))
const ClientesPage = lazy(() => import('./views/app/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const ClienteDetalhesPage = lazy(() => import('./views/app/ClienteDetalhesPage').then((m) => ({ default: m.ClienteDetalhesPage })))
const RelatoriosPage = lazy(() => import('./views/app/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })))
const WhatsappSettingsPage = lazy(() => import('./views/app/WhatsappSettingsPage').then((m) => ({ default: m.WhatsappSettingsPage })))
const MensagensSettingsPage = lazy(() => import('./views/app/MensagensSettingsPage').then((m) => ({ default: m.MensagensSettingsPage })))
const PaginaPublicaSettingsPage = lazy(() =>
  import('./views/app/PaginaPublicaSettingsPage').then((m) => ({ default: m.PaginaPublicaSettingsPage }))
)
const FuncionarioAgendaPage = lazy(() => import('./views/app/FuncionarioAgendaPage').then((m) => ({ default: m.FuncionarioAgendaPage })))
const PagamentoPage = lazy(() => import('./views/app/PagamentoPage').then((m) => ({ default: m.PagamentoPage })))

const AdminLoginPage = lazy(() => import('./views/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })))
const AdminBootstrapPage = lazy(() => import('./views/admin/AdminBootstrapPage').then((m) => ({ default: m.AdminBootstrapPage })))
const AdminDashboardPage = lazy(() => import('./views/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminClientesPage = lazy(() => import('./views/admin/AdminClientesPage').then((m) => ({ default: m.AdminClientesPage })))
const AdminClienteDetalhesPage = lazy(() =>
  import('./views/admin/AdminClienteDetalhesPage').then((m) => ({ default: m.AdminClienteDetalhesPage }))
)
const AdminLogsPage = lazy(() => import('./views/admin/AdminLogsPage').then((m) => ({ default: m.AdminLogsPage })))
const AdminPagamentosPage = lazy(() => import('./views/admin/AdminPagamentosPage').then((m) => ({ default: m.AdminPagamentosPage })))
const AdminConfiguracoesPage = lazy(() => import('./views/admin/AdminConfiguracoesPage').then((m) => ({ default: m.AdminConfiguracoesPage })))
const AdminWhatsappAvisosPage = lazy(() => import('./views/admin/AdminWhatsappAvisosPage').then((m) => ({ default: m.AdminWhatsappAvisosPage })))

function AppFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-sm text-slate-600">Carregando…</div>
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<AppFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/agendar/:slug/:unidadeSlug" element={<PublicBookingPage />} />
        <Route path="/agendar/:slug" element={<PublicBookingPage />} />

        <Route path="/termos" element={<TermosPage />} />
        <Route path="/privacidade" element={<PrivacidadePage />} />
        <Route path="/ajuda" element={<AjudaPage />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/resetar-senha" element={<ResetPasswordPage />} />
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <OnboardingPage />
            </RequireAuth>
          }
        />

        <Route
          path="/dashboard"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/servicos"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <ServicosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/clientes"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <ClientesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/clientes/:telefone"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <ClienteDetalhesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/relatorios"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <RelatoriosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/pagamento"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <PagamentoPage />
            </RequireAuth>
          }
        />
        <Route
          path="/funcionarios"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <FuncionariosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/configuracoes/whatsapp"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <WhatsappSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/configuracoes/mensagens"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <MensagensSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/configuracoes/pagina-publica"
          element={
            <RequireAuth requiredKind="usuario" allowFuncionarioAdmin={true}>
              <PaginaPublicaSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/funcionario/agenda"
          element={
            <RequireAuth requiredKind="funcionario">
              <FuncionarioAgendaPage />
            </RequireAuth>
          }
        />

        {import.meta.env.DEV ? <Route path="/admin/bootstrap" element={<AdminBootstrapPage />} /> : null}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin/dashboard"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clientes"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminClientesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clientes/:id"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminClienteDetalhesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminLogsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/pagamentos"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminPagamentosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/whatsapp"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminWhatsappAvisosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/configuracoes"
          element={
            <RequireAuth requiredKind="super_admin">
              <AdminConfiguracoesPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
