import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './state/auth/AuthProvider'
import { supabaseEnv } from './lib/supabase'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseEnv.ok ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-2xl font-semibold text-slate-900">Configuração necessária</div>
          </div>

          <div className="text-sm text-slate-700">Defina as variáveis de ambiente do Supabase para usar dados reais.</div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-sm font-semibold text-rose-800">Faltando</div>
            <div className="mt-2 space-y-1">
              {supabaseEnv.missing.map((k) => (
                <div key={k} className="font-mono text-xs text-rose-800">
                  {k}
                </div>
              ))}
            </div>
          </div>

          <div className="text-sm text-slate-700">
            Crie um arquivo <span className="font-mono text-xs">.env</span> ou <span className="font-mono text-xs">.env.local</span> em{' '}
            <span className="font-mono text-xs">smagenda/</span> e reinicie o dev server.
          </div>
        </div>
      </div>
    )}
  </StrictMode>,
)
