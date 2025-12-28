import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './state/auth/RequireAuth'
import { PublicBookingPage } from './views/public/PublicBookingPage'
import { LoginPage } from './views/auth/LoginPage'
import { CadastroPage } from './views/auth/CadastroPage'
import { OnboardingPage } from './views/auth/OnboardingPage'
import { ForgotPasswordPage } from './views/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './views/auth/ResetPasswordPage'
import { DashboardPage } from './views/app/DashboardPage'
import { ServicosPage } from './views/app/ServicosPage'
import { FuncionariosPage } from './views/app/FuncionariosPage'
import { ClientesPage } from './views/app/ClientesPage'
import { ClienteDetalhesPage } from './views/app/ClienteDetalhesPage'
import { RelatoriosPage } from './views/app/RelatoriosPage'
import { WhatsappSettingsPage } from './views/app/WhatsappSettingsPage'
import { MensagensSettingsPage } from './views/app/MensagensSettingsPage'
import { PaginaPublicaSettingsPage } from './views/app/PaginaPublicaSettingsPage'
import { FuncionarioAgendaPage } from './views/app/FuncionarioAgendaPage'
import { AdminLoginPage } from './views/admin/AdminLoginPage'
import { AdminBootstrapPage } from './views/admin/AdminBootstrapPage'
import { AdminDashboardPage } from './views/admin/AdminDashboardPage'
import { AdminClientesPage } from './views/admin/AdminClientesPage'
import { AdminClienteDetalhesPage } from './views/admin/AdminClienteDetalhesPage'
import { AdminLogsPage } from './views/admin/AdminLogsPage'
import { AdminConfiguracoesPage } from './views/admin/AdminConfiguracoesPage'
import { AdminWhatsappAvisosPage } from './views/admin/AdminWhatsappAvisosPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/agendar/:slug" element={<PublicBookingPage />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/resetar-senha" element={<ResetPasswordPage />} />
      <Route path="/cadastro" element={<CadastroPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth requiredKind="usuario">
            <OnboardingPage />
          </RequireAuth>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RequireAuth requiredKind="usuario">
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/servicos"
        element={
          <RequireAuth requiredKind="usuario">
            <ServicosPage />
          </RequireAuth>
        }
      />
      <Route
        path="/clientes"
        element={
          <RequireAuth requiredKind="usuario">
            <ClientesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/clientes/:telefone"
        element={
          <RequireAuth requiredKind="usuario">
            <ClienteDetalhesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/relatorios"
        element={
          <RequireAuth requiredKind="usuario">
            <RelatoriosPage />
          </RequireAuth>
        }
      />
      <Route
        path="/funcionarios"
        element={
          <RequireAuth requiredKind="usuario">
            <FuncionariosPage />
          </RequireAuth>
        }
      />
      <Route
        path="/configuracoes/whatsapp"
        element={
          <RequireAuth requiredKind="usuario">
            <WhatsappSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/configuracoes/mensagens"
        element={
          <RequireAuth>
            <MensagensSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/configuracoes/pagina-publica"
        element={
          <RequireAuth requiredKind="usuario">
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

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
