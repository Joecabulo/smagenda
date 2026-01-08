import {createHotContext as __vite__createHotContext} from "/@vite/client";
import.meta.hot = __vite__createHotContext("/src/views/app/PagamentoPage.tsx");
import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=9875b0cf";
const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
var _s = $RefreshSig$();
import __vite__cjsImport1_react from "/node_modules/.vite/deps/react.js?v=9875b0cf";
const useEffect = __vite__cjsImport1_react["useEffect"];
const useMemo = __vite__cjsImport1_react["useMemo"];
const useState = __vite__cjsImport1_react["useState"];
import {useLocation, useNavigate} from "/node_modules/.vite/deps/react-router-dom.js?v=9875b0cf";
import {AppShell} from "/src/components/layout/AppShell.tsx?t=1767394914655";
import {Badge} from "/src/components/ui/Badge.tsx";
import {Button} from "/src/components/ui/Button.tsx";
import {Card} from "/src/components/ui/Card.tsx";
import {Input} from "/src/components/ui/Input.tsx";
import {checkJwtProject, supabase, supabaseEnv} from "/src/lib/supabase.ts?t=1767388062616";
import {useAuth} from "/src/state/auth/useAuth.ts";
function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}
async function callPaymentsFn(body) {
    if (!supabaseEnv.ok) {
        return {
            ok: false,
            status: 0,
            body: {
                error: "missing_supabase_env"
            }
        };
    }
    const supabaseUrl = String(supabaseEnv.values.VITE_SUPABASE_URL ?? "").trim().replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/\/+$/g, "");
    const supabaseAnonKey = String(supabaseEnv.values.VITE_SUPABASE_ANON_KEY ?? "").trim().replace(/^['"`\s]+|['"`\s]+$/g, "");
    const fnUrl = `${supabaseUrl}/functions/v1/payments`;
    const tryRefresh = async () => {
        const {data: refreshed, error: refreshErr} = await supabase.auth.refreshSession();
        if (refreshErr)
            return null;
        return refreshed.session ?? null;
    }
    ;
    const {data: sessionData} = await supabase.auth.getSession();
    let session = sessionData.session;
    const now = Math.floor(Date.now() / 1e3);
    const expiresAt = session?.expires_at ?? null;
    if (session && (!expiresAt || expiresAt <= now + 60)) {
        const refreshed = await tryRefresh();
        if (refreshed)
            session = refreshed;
    }
    if (session) {
        const {error: userErr} = await supabase.auth.getUser();
        const userErrMsg = typeof userErr?.message === "string" ? userErr.message : "";
        if (userErr && /invalid\s+jwt/i.test(userErrMsg)) {
            const refreshed = await tryRefresh();
            if (refreshed)
                session = refreshed;
        }
    }
    const token = session?.access_token ?? null;
    if (!token) {
        return {
            ok: false,
            status: 401,
            body: {
                error: "session_expired"
            }
        };
    }
    const tokenProject = checkJwtProject(token, supabaseUrl);
    if (!tokenProject.ok) {
        await supabase.auth.signOut().catch( () => void 0);
        return {
            ok: false,
            status: 401,
            body: {
                error: "jwt_project_mismatch",
                iss: tokenProject.iss,
                expected: tokenProject.expectedPrefix
            }
        };
    }
    const callFetch = async (jwt) => {
        let res;
        try {
            res = await fetch(fnUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${jwt}`
                },
                body: JSON.stringify(body)
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Falha de rede";
            return {
                ok: false,
                status: 0,
                body: {
                    error: "network_error",
                    message: msg
                }
            };
        }
        const text = await res.text();
        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }
        if (!res.ok && res.status === 404) {
            const raw = typeof parsed === "string" ? parsed : text;
            if (typeof raw === "string" && raw.includes("Requested function was not found")) {
                return {
                    ok: false,
                    status: 404,
                    body: {
                        error: "function_not_deployed",
                        message: "A função payments não está publicada no Supabase. Faça deploy da Edge Function `payments` no seu projeto."
                    }
                };
            }
        }
        if (!res.ok && res.status === 401 && parsed && typeof parsed === "object" && parsed.message === "Invalid JWT" && parsed.code === 401) {
            return {
                ok: false,
                status: 401,
                body: {
                    error: "supabase_gateway_invalid_jwt"
                }
            };
        }
        if (!res.ok)
            console.error("payments error", {
                status: res.status,
                body: parsed,
                body_json: safeJson(parsed)
            });
        if (!res.ok)
            return {
                ok: false,
                status: res.status,
                body: parsed
            };
        return {
            ok: true,
            status: res.status,
            body: parsed
        };
    }
    ;
    const first = await callFetch(token);
    if (!first.ok && first.status === 401) {
        const refreshed = await tryRefresh();
        const nextToken = refreshed?.access_token ?? null;
        if (!nextToken) {
            await supabase.auth.signOut().catch( () => void 0);
            return {
                ok: false,
                status: 401,
                body: {
                    error: "invalid_jwt"
                }
            };
        }
        const nextProject = checkJwtProject(nextToken, supabaseUrl);
        if (!nextProject.ok) {
            await supabase.auth.signOut().catch( () => void 0);
            return {
                ok: false,
                status: 401,
                body: {
                    error: "jwt_project_mismatch",
                    iss: nextProject.iss,
                    expected: nextProject.expectedPrefix
                }
            };
        }
        return callFetch(nextToken);
    }
    return first;
}
async function createCheckoutPagamento(usuarioId, item, metodo, funcionariosTotal) {
    const payload = {
        action: "create_checkout",
        usuario_id: usuarioId,
        plano: item,
        metodo
    };
    if (typeof funcionariosTotal === "number" && Number.isFinite(funcionariosTotal))
        payload.funcionarios_total = funcionariosTotal;
    return callPaymentsFn(payload);
}
async function syncCheckoutSessionPagamento(sessionId, usuarioId) {
    const payload = {
        action: "sync_checkout_session",
        session_id: sessionId
    };
    if (usuarioId)
        payload.usuario_id = usuarioId;
    return callPaymentsFn(payload);
}
export function PagamentoPage() {
    _s();
    const {appPrincipal, refresh} = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const usuario = appPrincipal?.kind === "usuario" ? appPrincipal.profile : null;
    const usuarioId = usuario?.id ?? null;
    const [checkoutNotice,setCheckoutNotice] = useState(null);
    const [userSelectedPlan,setUserSelectedPlan] = useState(null);
    const [selectedService,setSelectedService] = useState(null);
    const [creatingCheckout,setCreatingCheckout] = useState(false);
    const [error,setError] = useState(null);
    const [funcionariosTotal,setFuncionariosTotal] = useState(null);
    const formatCheckoutError = (status, body) => {
        if (typeof body === "string" && body.trim())
            return body;
        if (body && typeof body === "object") {
            const obj = body;
            const err = typeof obj.error === "string" ? obj.error : null;
            const message = typeof obj.message === "string" && obj.message.trim() ? obj.message.trim() : null;
            if (message) {
                const stripeStatus = typeof obj.stripe_status === "number" && Number.isFinite(obj.stripe_status) ? obj.stripe_status : null;
                if (err === "stripe_error" && stripeStatus)
                    return `Stripe (HTTP ${stripeStatus}): ${message}`;
                return message;
            }
            if (err === "missing_supabase_env")
                return "Configuração do Supabase ausente no ambiente.";
            if (err === "network_error")
                return typeof obj.message === "string" && obj.message.trim() ? obj.message : "Falha de rede ao iniciar pagamento.";
            if (err === "session_expired" || err === "invalid_jwt")
                return "Sessão expirada no Supabase. Saia e entre novamente.";
            if (err === "jwt_project_mismatch")
                return "Sessão do Supabase pertence a outro projeto. Saia e entre novamente.";
            if (err === "supabase_gateway_invalid_jwt")
                return "A Edge Function está exigindo JWT no gateway. Faça deploy com verify_jwt=false.";
            if (err === "function_not_deployed")
                return "A função payments não está publicada no Supabase.";
            const asJson = safeJson(body);
            if (err && asJson)
                return `Erro ao iniciar pagamento: ${err} (HTTP ${status}): ${asJson}`;
            if (err)
                return `Erro ao iniciar pagamento: ${err} (HTTP ${status}).`;
            if (asJson)
                return `Erro ao iniciar pagamento (HTTP ${status}): ${asJson}`;
        }
        return `Erro ao iniciar pagamento (HTTP ${status}).`;
    }
    ;
    const canShowFree = Boolean(usuario && usuario.plano === "free" && usuario.status_pagamento === "trial" && usuario.free_trial_consumido !== true);
    const plans = useMemo( () => [...canShowFree ? [{
        key: "free",
        title: "FREE",
        priceLabel: "R$ 0/mês",
        subtitle: "Para testar",
        bullets: ["Até 30 agendamentos por mês", "1 profissional", "Lembretes manuais (link do WhatsApp)", "Suporte por email"]
    }] : [], {
        key: "basic",
        title: "BASIC",
        priceLabel: "R$ 34,99/mês",
        subtitle: "",
        bullets: ["Agendamentos 60 por mês", "1 profissional incluído", "Lembretes automáticos via WhatsApp", "Até 3 serviços", "Página pública personalizável", "Suporte por email"]
    }, {
        key: "pro",
        title: "PRO",
        priceLabel: "R$ 59,99/mês",
        subtitle: "Até 12 profissionais (8 inclusos + até 4 adicionais de R$ 7)",
        bullets: ["Até 8 profissionais incluídos", "Serviços ilimitados", "Logo e fotos de serviços", "Relatórios", "Bloqueios recorrentes", "Suporte via WhatsApp"]
    }, {
        key: "enterprise",
        title: "EMPRESA",
        priceLabel: "R$ 98,99/mês",
        subtitle: "Ilimitado",
        bullets: ["Profissionais ilimitados", "Multi-unidades", "Agendamentos ilimitados", "Serviços ilimitados", "Logo e fotos de serviços", "Suporte via WhatsApp"]
    }], [canShowFree]);
    const services = useMemo( () => [{
        key: "setup_completo",
        title: "Setup Completo",
        priceLabel: "R$ 150 (uma vez)",
        bullets: ["Você configura tudo para o cliente", "Cadastra serviços, fotos, horários", "Conecta WhatsApp", "Testa envios", "Treina o cliente em 15 minutos"]
    }, {
        key: "consultoria_hora",
        title: "Consultoria por Hora",
        priceLabel: "R$ 80/hora",
        bullets: ["Ajuda com configurações avançadas", "Sugestões de otimização", "Dúvidas gerais"]
    }], []);
    const currentPlan = useMemo( () => {
        const current = (usuario?.plano ?? "").trim().toLowerCase();
        if (current === "free")
            return canShowFree ? "free" : "basic";
        if (current === "enterprise")
            return "enterprise";
        if (current === "team")
            return "pro";
        if (current === "basic" || current === "pro")
            return current;
        return "basic";
    }
    , [canShowFree, usuario?.plano]);
    const selectedPlan = userSelectedPlan ?? currentPlan;
    const defaultFuncionariosTotal = useMemo( () => {
        const raw = usuario?.limite_funcionarios;
        const n = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
        return Math.max(1, Math.min(200, n));
    }
    , [usuario?.limite_funcionarios]);
    const includedPro = 8;
    const maxPro = 12;
    const defaultProFuncionariosTotal = useMemo( () => {
        return Math.min(maxPro, Math.max(includedPro, defaultFuncionariosTotal));
    }
    , [defaultFuncionariosTotal, includedPro, maxPro]);
    const effectiveFuncionariosTotal = funcionariosTotal ?? (selectedPlan === "pro" ? defaultProFuncionariosTotal : defaultFuncionariosTotal);
    useEffect( () => {
        const run = async () => {
            const search = location.search ?? "";
            if (!search)
                return;
            const params = new URLSearchParams(search);
            const checkout = (params.get("checkout") ?? "").trim().toLowerCase();
            if (checkout !== "success" && checkout !== "cancel")
                return;
            const item = (params.get("item") ?? params.get("plano") ?? "").trim().toLowerCase() || null;
            setCheckoutNotice({
                kind: checkout,
                item
            });
            const sessionId = (params.get("session_id") ?? "").trim();
            const usuarioIdFromParams = (params.get("usuario_id") ?? "").trim() || null;
            const first = await refresh();
            const refreshedUsuarioId = first?.kind === "usuario" ? first.profile.id : null;
            const effectiveUsuarioId = refreshedUsuarioId ?? usuarioIdFromParams;
            if (checkout === "success") {
                if (sessionId) {
                    const sync = await syncCheckoutSessionPagamento(sessionId, effectiveUsuarioId);
                    if (!sync.ok) {
                        setError(formatCheckoutError(sync.status, sync.body));
                    } else {
                        await refresh();
                    }
                }
                let tries = 0;
                while (tries < 10) {
                    await new Promise( (r) => setTimeout(r, 2e3));
                    const next = await refresh();
                    if (next?.kind === "usuario" && next.profile.status_pagamento === "ativo")
                        break;
                    tries += 1;
                }
            }
            navigate("/pagamento", {
                replace: true
            });
        }
        ;
        run().catch( () => void 0);
    }
    , [location.search, navigate, refresh]);
    const startPlanCheckout = async (metodo) => {
        if (!usuarioId)
            return;
        const plan = selectedPlan;
        if (!plan || plan === "free") {
            setError("Selecione um plano válido.");
            return;
        }
        const requested = plan === "pro" ? Math.floor(effectiveFuncionariosTotal || includedPro) : 1;
        if (plan === "pro" && requested > maxPro) {
            setUserSelectedPlan("enterprise");
            setFuncionariosTotal(null);
            setError("Para mais de 12 profissionais, selecione o plano EMPRESA.");
            return;
        }
        const total = plan === "pro" ? Math.max(includedPro, Math.min(maxPro, requested)) : 1;
        setCreatingCheckout(true);
        setError(null);
        const res = await createCheckoutPagamento(usuarioId, plan, metodo, total);
        if (!res.ok) {
            setError(formatCheckoutError(res.status, res.body));
            setCreatingCheckout(false);
            return;
        }
        const body = res.body;
        const url = typeof body.url === "string" ? body.url : null;
        if (!url) {
            setError("A função não retornou o link de checkout.");
            setCreatingCheckout(false);
            return;
        }
        window.location.href = url;
    }
    ;
    const startServiceCheckout = async (metodo) => {
        if (!usuarioId || !selectedService)
            return;
        setCreatingCheckout(true);
        setError(null);
        const res = await createCheckoutPagamento(usuarioId, selectedService, metodo);
        if (!res.ok) {
            setError(formatCheckoutError(res.status, res.body));
            setCreatingCheckout(false);
            return;
        }
        const body = res.body;
        const url = typeof body.url === "string" ? body.url : null;
        if (!url) {
            setError("A função não retornou o link de checkout.");
            setCreatingCheckout(false);
            return;
        }
        window.location.href = url;
    }
    ;
    if (!usuario) {
        return /* @__PURE__ */
        jsxDEV(AppShell, {
            children: /* @__PURE__ */
            jsxDEV("div", {
                className: "text-slate-700",
                children: "Acesso restrito."
            }, void 0, false, {
                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                lineNumber: 395,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
            lineNumber: 394,
            columnNumber: 7
        }, this);
    }
    const formatStatusPagamento = (value) => {
        const v = String(value ?? "").trim().toLowerCase();
        if (!v)
            return "—";
        if (v === "ativo")
            return "Ativo";
        if (v === "trial")
            return "Trial";
        if (v === "inadimplente")
            return "Inadimplente";
        if (v === "suspenso")
            return "Suspenso";
        if (v === "cancelado")
            return "Cancelado";
        return value;
    }
    ;
    const statusTone = usuario.status_pagamento === "inadimplente" ? "red" : usuario.status_pagamento === "ativo" ? "green" : "slate";
    const planoLabel = (planoRaw) => {
        const p = String(planoRaw ?? "").trim().toLowerCase();
        if (p === "enterprise")
            return "EMPRESA";
        if (p === "team")
            return "PRO";
        if (p === "pro")
            return "PRO";
        if (p === "basic")
            return "BASIC";
        if (p === "free")
            return "FREE";
        return planoRaw;
    }
    ;
    return /* @__PURE__ */
    jsxDEV(AppShell, {
        children: /* @__PURE__ */
        jsxDEV("div", {
            className: "space-y-6",
            children: [checkoutNotice ? /* @__PURE__ */
            jsxDEV("div", {
                className: ["rounded-xl border p-4 text-sm", checkoutNotice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"].join(" "),
                children: /* @__PURE__ */
                jsxDEV("div", {
                    className: "flex flex-wrap items-center justify-between gap-3",
                    children: [/* @__PURE__ */
                    jsxDEV("div", {
                        className: "space-y-1",
                        children: [/* @__PURE__ */
                        jsxDEV("div", {
                            className: "font-semibold",
                            children: checkoutNotice.kind === "success" ? "Pagamento concluído" : "Pagamento cancelado"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 435,
                            columnNumber: 17
                        }, this), /* @__PURE__ */
                        jsxDEV("div", {
                            children: [checkoutNotice.item ? `Item: ${checkoutNotice.item.toUpperCase()}. ` : "", "Status: ", formatStatusPagamento(usuario.status_pagamento), "."]
                        }, void 0, true, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 436,
                            columnNumber: 17
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 434,
                        columnNumber: 15
                    }, this), /* @__PURE__ */
                    jsxDEV("div", {
                        className: "flex items-center gap-2",
                        children: [/* @__PURE__ */
                        jsxDEV(Button, {
                            variant: "secondary",
                            onClick: () => void refresh(),
                            children: "Atualizar"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 441,
                            columnNumber: 17
                        }, this), /* @__PURE__ */
                        jsxDEV(Button, {
                            variant: "secondary",
                            onClick: () => setCheckoutNotice(null),
                            children: "Fechar"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 444,
                            columnNumber: 17
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 440,
                        columnNumber: 15
                    }, this)]
                }, void 0, true, {
                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                    lineNumber: 433,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                lineNumber: 427,
                columnNumber: 9
            }, this) : null, error ? /* @__PURE__ */
            jsxDEV("div", {
                className: "rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700",
                children: error
            }, void 0, false, {
                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                lineNumber: 452,
                columnNumber: 18
            }, this) : null, /* @__PURE__ */
            jsxDEV(Card, {
                children: /* @__PURE__ */
                jsxDEV("div", {
                    className: "p-6 space-y-4",
                    children: [/* @__PURE__ */
                    jsxDEV("div", {
                        className: "flex flex-wrap items-start justify-between gap-3",
                        children: [/* @__PURE__ */
                        jsxDEV("div", {
                            children: [/* @__PURE__ */
                            jsxDEV("div", {
                                className: "text-sm font-semibold text-slate-900",
                                children: "Pagamento"
                            }, void 0, false, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 458,
                                columnNumber: 17
                            }, this), /* @__PURE__ */
                            jsxDEV("div", {
                                className: "text-sm text-slate-600",
                                children: ["Plano atual: ", planoLabel(usuario.plano)]
                            }, void 0, true, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 459,
                                columnNumber: 17
                            }, this)]
                        }, void 0, true, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 457,
                            columnNumber: 15
                        }, this), /* @__PURE__ */
                        jsxDEV("div", {
                            className: "flex items-center gap-2",
                            children: [/* @__PURE__ */
                            jsxDEV(Badge, {
                                tone: usuario.ativo ? "green" : "red",
                                children: usuario.ativo ? "Conta: Ativa" : "Conta: Inativa"
                            }, void 0, false, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 464,
                                columnNumber: 17
                            }, this), /* @__PURE__ */
                            jsxDEV(Badge, {
                                tone: statusTone,
                                children: ["Pagamento: ", formatStatusPagamento(usuario.status_pagamento)]
                            }, void 0, true, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 465,
                                columnNumber: 17
                            }, this), /* @__PURE__ */
                            jsxDEV(Button, {
                                variant: "secondary",
                                onClick: () => void refresh(),
                                children: "Atualizar status"
                            }, void 0, false, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 466,
                                columnNumber: 17
                            }, this)]
                        }, void 0, true, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 463,
                            columnNumber: 15
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 456,
                        columnNumber: 13
                    }, this), /* @__PURE__ */
                    jsxDEV("div", {
                        className: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
                        children: plans.map( (p) => {
                            const selected = selectedPlan === p.key;
                            const clickable = p.key !== "free";
                            const best = p.key === "pro";
                            return /* @__PURE__ */
                            jsxDEV("button", {
                                type: "button",
                                onClick: () => {
                                    if (!clickable)
                                        return;
                                    setUserSelectedPlan(p.key);
                                    setFuncionariosTotal(null);
                                }
                                ,
                                className: ["text-left rounded-xl border bg-white p-4 transition", best ? selected ? "border-slate-900 ring-2 ring-slate-900/10 bg-amber-50" : "border-amber-300 hover:bg-amber-50" : selected ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:bg-slate-50", clickable ? "" : "cursor-default"].join(" "),
                                children: [/* @__PURE__ */
                                jsxDEV("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [/* @__PURE__ */
                                    jsxDEV("div", {
                                        children: [/* @__PURE__ */
                                        jsxDEV("div", {
                                            className: "text-sm font-semibold text-slate-900",
                                            children: p.title
                                        }, void 0, false, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 500,
                                            columnNumber: 25
                                        }, this), /* @__PURE__ */
                                        jsxDEV("div", {
                                            className: "text-xs text-slate-600",
                                            children: [p.priceLabel, p.subtitle ? ` • ${p.subtitle}` : ""]
                                        }, void 0, true, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 501,
                                            columnNumber: 25
                                        }, this)]
                                    }, void 0, true, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 499,
                                        columnNumber: 23
                                    }, this), /* @__PURE__ */
                                    jsxDEV("div", {
                                        className: "flex items-center gap-2",
                                        children: [best ? /* @__PURE__ */
                                        jsxDEV(Badge, {
                                            tone: "yellow",
                                            children: "Melhor opção"
                                        }, void 0, false, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 504,
                                            columnNumber: 33
                                        }, this) : null, selected ? /* @__PURE__ */
                                        jsxDEV(Badge, {
                                            tone: "slate",
                                            children: "Selecionado"
                                        }, void 0, false, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 505,
                                            columnNumber: 37
                                        }, this) : null]
                                    }, void 0, true, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 503,
                                        columnNumber: 23
                                    }, this)]
                                }, void 0, true, {
                                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                    lineNumber: 498,
                                    columnNumber: 21
                                }, this), /* @__PURE__ */
                                jsxDEV("div", {
                                    className: "mt-3 space-y-1",
                                    children: p.bullets.map( (b) => /* @__PURE__ */
                                    jsxDEV("div", {
                                        className: "text-xs text-slate-700",
                                        children: ["- ", b]
                                    }, b, true, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 510,
                                        columnNumber: 23
                                    }, this))
                                }, void 0, false, {
                                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                    lineNumber: 508,
                                    columnNumber: 21
                                }, this)]
                            }, p.key, true, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 478,
                                columnNumber: 19
                            }, this);
                        }
                        )
                    }, void 0, false, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 472,
                        columnNumber: 13
                    }, this), selectedPlan === "pro" ? /* @__PURE__ */
                    jsxDEV("div", {
                        className: "grid grid-cols-1 gap-3 sm:grid-cols-2",
                        children: [/* @__PURE__ */
                        jsxDEV(Input, {
                            label: "Profissionais",
                            type: "number",
                            min: includedPro,
                            max: maxPro,
                            value: String(effectiveFuncionariosTotal),
                            onChange: (e) => {
                                const raw = e.target.value;
                                const n = raw.trim() === "" ? includedPro : Number(raw);
                                if (!Number.isFinite(n))
                                    return;
                                const i = Math.floor(n);
                                if (i > maxPro) {
                                    setUserSelectedPlan("enterprise");
                                    setFuncionariosTotal(null);
                                    setError("Para mais de 12 profissionais, selecione o plano EMPRESA.");
                                    return;
                                }
                                const clamped = Math.max(includedPro, Math.min(maxPro, i));
                                setFuncionariosTotal(clamped);
                            }
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 522,
                            columnNumber: 17
                        }, this), /* @__PURE__ */
                        jsxDEV("div", {
                            className: "rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 flex items-center",
                            children: "O checkout calcula 8 profissionais inclusos + adicional por profissional acima de 8 (máximo 12 no PRO)."
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 543,
                            columnNumber: 17
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 521,
                        columnNumber: 13
                    }, this) : null, /* @__PURE__ */
                    jsxDEV("div", {
                        className: "flex flex-wrap justify-end gap-2",
                        children: [/* @__PURE__ */
                        jsxDEV(Button, {
                            variant: "secondary",
                            onClick: () => void startPlanCheckout("pix"),
                            disabled: creatingCheckout || selectedPlan === "free",
                            children: creatingCheckout ? "Abrindo…" : "PIX (30 dias)"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 550,
                            columnNumber: 15
                        }, this), /* @__PURE__ */
                        jsxDEV(Button, {
                            onClick: () => void startPlanCheckout("card"),
                            disabled: creatingCheckout || selectedPlan === "free",
                            children: creatingCheckout ? "Abrindo…" : "Cartão (assinatura)"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 553,
                            columnNumber: 15
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 549,
                        columnNumber: 13
                    }, this)]
                }, void 0, true, {
                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                    lineNumber: 455,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                lineNumber: 454,
                columnNumber: 9
            }, this), /* @__PURE__ */
            jsxDEV(Card, {
                children: /* @__PURE__ */
                jsxDEV("div", {
                    className: "p-6 space-y-4",
                    children: [/* @__PURE__ */
                    jsxDEV("div", {
                        children: [/* @__PURE__ */
                        jsxDEV("div", {
                            className: "text-sm font-semibold text-slate-900",
                            children: "Serviços"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 563,
                            columnNumber: 15
                        }, this), /* @__PURE__ */
                        jsxDEV("div", {
                            className: "text-sm text-slate-600",
                            children: "Contrate serviços avulsos para configuração e suporte."
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 564,
                            columnNumber: 15
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 562,
                        columnNumber: 13
                    }, this), /* @__PURE__ */
                    jsxDEV("div", {
                        className: "grid grid-cols-1 gap-3 sm:grid-cols-2",
                        children: services.map( (s) => {
                            const selected = selectedService === s.key;
                            return /* @__PURE__ */
                            jsxDEV("button", {
                                type: "button",
                                onClick: () => setSelectedService(s.key),
                                className: ["text-left rounded-xl border bg-white p-4 transition", selected ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:bg-slate-50"].join(" "),
                                children: [/* @__PURE__ */
                                jsxDEV("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [/* @__PURE__ */
                                    jsxDEV("div", {
                                        children: [/* @__PURE__ */
                                        jsxDEV("div", {
                                            className: "text-sm font-semibold text-slate-900",
                                            children: s.title
                                        }, void 0, false, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 582,
                                            columnNumber: 25
                                        }, this), /* @__PURE__ */
                                        jsxDEV("div", {
                                            className: "text-xs text-slate-600",
                                            children: s.priceLabel
                                        }, void 0, false, {
                                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                            lineNumber: 583,
                                            columnNumber: 25
                                        }, this)]
                                    }, void 0, true, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 581,
                                        columnNumber: 23
                                    }, this), selected ? /* @__PURE__ */
                                    jsxDEV(Badge, {
                                        tone: "slate",
                                        children: "Selecionado"
                                    }, void 0, false, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 585,
                                        columnNumber: 35
                                    }, this) : null]
                                }, void 0, true, {
                                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                    lineNumber: 580,
                                    columnNumber: 21
                                }, this), /* @__PURE__ */
                                jsxDEV("div", {
                                    className: "mt-3 space-y-1",
                                    children: s.bullets.map( (b) => /* @__PURE__ */
                                    jsxDEV("div", {
                                        className: "text-xs text-slate-700",
                                        children: ["- ", b]
                                    }, b, true, {
                                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                        lineNumber: 589,
                                        columnNumber: 23
                                    }, this))
                                }, void 0, false, {
                                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                    lineNumber: 587,
                                    columnNumber: 21
                                }, this)]
                            }, s.key, true, {
                                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                                lineNumber: 571,
                                columnNumber: 19
                            }, this);
                        }
                        )
                    }, void 0, false, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 567,
                        columnNumber: 13
                    }, this), /* @__PURE__ */
                    jsxDEV("div", {
                        className: "flex flex-wrap justify-end gap-2",
                        children: [/* @__PURE__ */
                        jsxDEV(Button, {
                            variant: "secondary",
                            onClick: () => void startServiceCheckout("pix"),
                            disabled: creatingCheckout || !selectedService,
                            children: creatingCheckout ? "Abrindo…" : "Pagar com PIX"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 600,
                            columnNumber: 15
                        }, this), /* @__PURE__ */
                        jsxDEV(Button, {
                            onClick: () => void startServiceCheckout("card"),
                            disabled: creatingCheckout || !selectedService,
                            children: creatingCheckout ? "Abrindo…" : "Pagar com cartão"
                        }, void 0, false, {
                            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                            lineNumber: 603,
                            columnNumber: 15
                        }, this)]
                    }, void 0, true, {
                        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                        lineNumber: 599,
                        columnNumber: 13
                    }, this)]
                }, void 0, true, {
                    fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                    lineNumber: 561,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
                lineNumber: 560,
                columnNumber: 9
            }, this)]
        }, void 0, true, {
            fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
            lineNumber: 425,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx",
        lineNumber: 424,
        columnNumber: 5
    }, this);
}
_s(PagamentoPage, "CSY4+SwL8YVqV+gk+qleO6U6S34=", false, function() {
    return [useAuth, useLocation, useNavigate];
});
_c = PagamentoPage;
var _c;
$RefreshReg$(_c, "PagamentoPage");
import*as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
if (import.meta.hot && !inWebWorker) {
    if (!window.$RefreshReg$) {
        throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.");
    }
    RefreshRuntime.__hmr_import(import.meta.url).then( (currentExports) => {
        RefreshRuntime.registerExportsForReactRefresh("C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx", currentExports);
        import.meta.hot.accept( (nextExports) => {
            if (!nextExports)
                return;
            const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx", currentExports, nextExports);
            if (invalidateMessage)
                import.meta.hot.invalidate(invalidateMessage);
        }
        );
    }
    );
}
function $RefreshReg$(type, id) {
    return RefreshRuntime.register(type, "C:/Users/Admin/Desktop/SMagenda/smagenda/src/views/app/PagamentoPage.tsx " + id);
}
function $RefreshSig$() {
    return RefreshRuntime.createSignatureFunctionForTransform();
}

//# sourceMappingURL=data:application/json;base64,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Im5hbWVzIjpbInVzZUVmZmVjdCIsInVzZU1lbW8iLCJ1c2VTdGF0ZSIsInVzZUxvY2F0aW9uIiwidXNlTmF2aWdhdGUiLCJBcHBTaGVsbCIsIkJhZGdlIiwiQnV0dG9uIiwiQ2FyZCIsIklucHV0IiwiY2hlY2tKd3RQcm9qZWN0Iiwic3VwYWJhc2UiLCJzdXBhYmFzZUVudiIsInVzZUF1dGgiLCJzYWZlSnNvbiIsInZhbHVlIiwiSlNPTiIsInN0cmluZ2lmeSIsImNhbGxQYXltZW50c0ZuIiwiYm9keSIsIm9rIiwic3RhdHVzIiwiZXJyb3IiLCJzdXBhYmFzZVVybCIsIlN0cmluZyIsInZhbHVlcyIsIlZJVEVfU1VQQUJBU0VfVVJMIiwidHJpbSIsInJlcGxhY2UiLCJzdXBhYmFzZUFub25LZXkiLCJWSVRFX1NVUEFCQVNFX0FOT05fS0VZIiwiZm5VcmwiLCJ0cnlSZWZyZXNoIiwiZGF0YSIsInJlZnJlc2hlZCIsInJlZnJlc2hFcnIiLCJhdXRoIiwicmVmcmVzaFNlc3Npb24iLCJzZXNzaW9uIiwic2Vzc2lvbkRhdGEiLCJnZXRTZXNzaW9uIiwibm93IiwiTWF0aCIsImZsb29yIiwiRGF0ZSIsImV4cGlyZXNBdCIsImV4cGlyZXNfYXQiLCJ1c2VyRXJyIiwiZ2V0VXNlciIsInVzZXJFcnJNc2ciLCJtZXNzYWdlIiwidGVzdCIsInRva2VuIiwiYWNjZXNzX3Rva2VuIiwidG9rZW5Qcm9qZWN0Iiwic2lnbk91dCIsImNhdGNoIiwidW5kZWZpbmVkIiwiaXNzIiwiZXhwZWN0ZWQiLCJleHBlY3RlZFByZWZpeCIsImNhbGxGZXRjaCIsImp3dCIsInJlcyIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsImFwaWtleSIsIkF1dGhvcml6YXRpb24iLCJlIiwibXNnIiwiRXJyb3IiLCJ0ZXh0IiwicGFyc2VkIiwicGFyc2UiLCJyYXciLCJpbmNsdWRlcyIsImNvZGUiLCJjb25zb2xlIiwiYm9keV9qc29uIiwiZmlyc3QiLCJuZXh0VG9rZW4iLCJuZXh0UHJvamVjdCIsImNyZWF0ZUNoZWNrb3V0UGFnYW1lbnRvIiwidXN1YXJpb0lkIiwiaXRlbSIsIm1ldG9kbyIsImZ1bmNpb25hcmlvc1RvdGFsIiwicGF5bG9hZCIsImFjdGlvbiIsInVzdWFyaW9faWQiLCJwbGFubyIsIk51bWJlciIsImlzRmluaXRlIiwiZnVuY2lvbmFyaW9zX3RvdGFsIiwic3luY0NoZWNrb3V0U2Vzc2lvblBhZ2FtZW50byIsInNlc3Npb25JZCIsInNlc3Npb25faWQiLCJQYWdhbWVudG9QYWdlIiwiX3MiLCJhcHBQcmluY2lwYWwiLCJyZWZyZXNoIiwibG9jYXRpb24iLCJuYXZpZ2F0ZSIsInVzdWFyaW8iLCJraW5kIiwicHJvZmlsZSIsImlkIiwiY2hlY2tvdXROb3RpY2UiLCJzZXRDaGVja291dE5vdGljZSIsInVzZXJTZWxlY3RlZFBsYW4iLCJzZXRVc2VyU2VsZWN0ZWRQbGFuIiwic2VsZWN0ZWRTZXJ2aWNlIiwic2V0U2VsZWN0ZWRTZXJ2aWNlIiwiY3JlYXRpbmdDaGVja291dCIsInNldENyZWF0aW5nQ2hlY2tvdXQiLCJzZXRFcnJvciIsInNldEZ1bmNpb25hcmlvc1RvdGFsIiwiZm9ybWF0Q2hlY2tvdXRFcnJvciIsIm9iaiIsImVyciIsInN0cmlwZVN0YXR1cyIsInN0cmlwZV9zdGF0dXMiLCJhc0pzb24iLCJjYW5TaG93RnJlZSIsIkJvb2xlYW4iLCJzdGF0dXNfcGFnYW1lbnRvIiwiZnJlZV90cmlhbF9jb25zdW1pZG8iLCJwbGFucyIsImtleSIsInRpdGxlIiwicHJpY2VMYWJlbCIsInN1YnRpdGxlIiwiYnVsbGV0cyIsInNlcnZpY2VzIiwiY3VycmVudFBsYW4iLCJjdXJyZW50IiwidG9Mb3dlckNhc2UiLCJzZWxlY3RlZFBsYW4iLCJkZWZhdWx0RnVuY2lvbmFyaW9zVG90YWwiLCJsaW1pdGVfZnVuY2lvbmFyaW9zIiwibiIsIm1heCIsIm1pbiIsImluY2x1ZGVkUHJvIiwibWF4UHJvIiwiZGVmYXVsdFByb0Z1bmNpb25hcmlvc1RvdGFsIiwiZWZmZWN0aXZlRnVuY2lvbmFyaW9zVG90YWwiLCJydW4iLCJzZWFyY2giLCJwYXJhbXMiLCJVUkxTZWFyY2hQYXJhbXMiLCJjaGVja291dCIsImdldCIsInVzdWFyaW9JZEZyb21QYXJhbXMiLCJyZWZyZXNoZWRVc3VhcmlvSWQiLCJlZmZlY3RpdmVVc3VhcmlvSWQiLCJzeW5jIiwidHJpZXMiLCJQcm9taXNlIiwiciIsInNldFRpbWVvdXQiLCJuZXh0Iiwic3RhcnRQbGFuQ2hlY2tvdXQiLCJwbGFuIiwicmVxdWVzdGVkIiwidG90YWwiLCJ1cmwiLCJ3aW5kb3ciLCJocmVmIiwic3RhcnRTZXJ2aWNlQ2hlY2tvdXQiLCJmb3JtYXRTdGF0dXNQYWdhbWVudG8iLCJ2Iiwic3RhdHVzVG9uZSIsInBsYW5vTGFiZWwiLCJwbGFub1JhdyIsInAiLCJqb2luIiwidG9VcHBlckNhc2UiLCJhdGl2byIsIm1hcCIsInNlbGVjdGVkIiwiY2xpY2thYmxlIiwiYmVzdCIsImIiLCJ0YXJnZXQiLCJpIiwiY2xhbXBlZCIsInMiLCJfYyIsIiRSZWZyZXNoUmVnJCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlcyI6WyJQYWdhbWVudG9QYWdlLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB1c2VFZmZlY3QsIHVzZU1lbW8sIHVzZVN0YXRlIH0gZnJvbSAncmVhY3QnXG5pbXBvcnQgeyB1c2VMb2NhdGlvbiwgdXNlTmF2aWdhdGUgfSBmcm9tICdyZWFjdC1yb3V0ZXItZG9tJ1xuaW1wb3J0IHsgQXBwU2hlbGwgfSBmcm9tICcuLi8uLi9jb21wb25lbnRzL2xheW91dC9BcHBTaGVsbCdcbmltcG9ydCB7IEJhZGdlIH0gZnJvbSAnLi4vLi4vY29tcG9uZW50cy91aS9CYWRnZSdcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uL2NvbXBvbmVudHMvdWkvQnV0dG9uJ1xuaW1wb3J0IHsgQ2FyZCB9IGZyb20gJy4uLy4uL2NvbXBvbmVudHMvdWkvQ2FyZCdcbmltcG9ydCB7IElucHV0IH0gZnJvbSAnLi4vLi4vY29tcG9uZW50cy91aS9JbnB1dCdcbmltcG9ydCB7IGNoZWNrSnd0UHJvamVjdCwgc3VwYWJhc2UsIHN1cGFiYXNlRW52IH0gZnJvbSAnLi4vLi4vbGliL3N1cGFiYXNlJ1xuaW1wb3J0IHsgdXNlQXV0aCB9IGZyb20gJy4uLy4uL3N0YXRlL2F1dGgvdXNlQXV0aCdcblxudHlwZSBGblJlc3VsdCA9IHsgb2s6IHRydWU7IHN0YXR1czogbnVtYmVyOyBib2R5OiB1bmtub3duIH0gfCB7IG9rOiBmYWxzZTsgc3RhdHVzOiBudW1iZXI7IGJvZHk6IHVua25vd24gfVxuXG5mdW5jdGlvbiBzYWZlSnNvbih2YWx1ZTogdW5rbm93bikge1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSlcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjYWxsUGF5bWVudHNGbihib2R5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8Rm5SZXN1bHQ+IHtcbiAgaWYgKCFzdXBhYmFzZUVudi5vaykge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSBhcyBjb25zdCwgc3RhdHVzOiAwLCBib2R5OiB7IGVycm9yOiAnbWlzc2luZ19zdXBhYmFzZV9lbnYnIH0gfVxuICB9XG5cbiAgY29uc3Qgc3VwYWJhc2VVcmwgPSBTdHJpbmcoc3VwYWJhc2VFbnYudmFsdWVzLlZJVEVfU1VQQUJBU0VfVVJMID8/ICcnKVxuICAgIC50cmltKClcbiAgICAucmVwbGFjZSgvXlsnXCJgXFxzXSt8WydcImBcXHNdKyQvZywgJycpXG4gICAgLnJlcGxhY2UoL1xcLyskL2csICcnKVxuICBjb25zdCBzdXBhYmFzZUFub25LZXkgPSBTdHJpbmcoc3VwYWJhc2VFbnYudmFsdWVzLlZJVEVfU1VQQUJBU0VfQU5PTl9LRVkgPz8gJycpXG4gICAgLnRyaW0oKVxuICAgIC5yZXBsYWNlKC9eWydcImBcXHNdK3xbJ1wiYFxcc10rJC9nLCAnJylcbiAgY29uc3QgZm5VcmwgPSBgJHtzdXBhYmFzZVVybH0vZnVuY3Rpb25zL3YxL3BheW1lbnRzYFxuXG4gIGNvbnN0IHRyeVJlZnJlc2ggPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgeyBkYXRhOiByZWZyZXNoZWQsIGVycm9yOiByZWZyZXNoRXJyIH0gPSBhd2FpdCBzdXBhYmFzZS5hdXRoLnJlZnJlc2hTZXNzaW9uKClcbiAgICBpZiAocmVmcmVzaEVycikgcmV0dXJuIG51bGxcbiAgICByZXR1cm4gcmVmcmVzaGVkLnNlc3Npb24gPz8gbnVsbFxuICB9XG5cbiAgY29uc3QgeyBkYXRhOiBzZXNzaW9uRGF0YSB9ID0gYXdhaXQgc3VwYWJhc2UuYXV0aC5nZXRTZXNzaW9uKClcbiAgbGV0IHNlc3Npb24gPSBzZXNzaW9uRGF0YS5zZXNzaW9uXG4gIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApXG4gIGNvbnN0IGV4cGlyZXNBdCA9IHNlc3Npb24/LmV4cGlyZXNfYXQgPz8gbnVsbFxuXG4gIGlmIChzZXNzaW9uICYmICghZXhwaXJlc0F0IHx8IGV4cGlyZXNBdCA8PSBub3cgKyA2MCkpIHtcbiAgICBjb25zdCByZWZyZXNoZWQgPSBhd2FpdCB0cnlSZWZyZXNoKClcbiAgICBpZiAocmVmcmVzaGVkKSBzZXNzaW9uID0gcmVmcmVzaGVkXG4gIH1cblxuICBpZiAoc2Vzc2lvbikge1xuICAgIGNvbnN0IHsgZXJyb3I6IHVzZXJFcnIgfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpXG4gICAgY29uc3QgdXNlckVyck1zZyA9IHR5cGVvZiB1c2VyRXJyPy5tZXNzYWdlID09PSAnc3RyaW5nJyA/IHVzZXJFcnIubWVzc2FnZSA6ICcnXG4gICAgaWYgKHVzZXJFcnIgJiYgL2ludmFsaWRcXHMrand0L2kudGVzdCh1c2VyRXJyTXNnKSkge1xuICAgICAgY29uc3QgcmVmcmVzaGVkID0gYXdhaXQgdHJ5UmVmcmVzaCgpXG4gICAgICBpZiAocmVmcmVzaGVkKSBzZXNzaW9uID0gcmVmcmVzaGVkXG4gICAgfVxuICB9XG5cbiAgY29uc3QgdG9rZW4gPSBzZXNzaW9uPy5hY2Nlc3NfdG9rZW4gPz8gbnVsbFxuICBpZiAoIXRva2VuKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlIGFzIGNvbnN0LCBzdGF0dXM6IDQwMSwgYm9keTogeyBlcnJvcjogJ3Nlc3Npb25fZXhwaXJlZCcgfSB9XG4gIH1cblxuICBjb25zdCB0b2tlblByb2plY3QgPSBjaGVja0p3dFByb2plY3QodG9rZW4sIHN1cGFiYXNlVXJsKVxuICBpZiAoIXRva2VuUHJvamVjdC5vaykge1xuICAgIGF3YWl0IHN1cGFiYXNlLmF1dGguc2lnbk91dCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICByZXR1cm4geyBvazogZmFsc2UgYXMgY29uc3QsIHN0YXR1czogNDAxLCBib2R5OiB7IGVycm9yOiAnand0X3Byb2plY3RfbWlzbWF0Y2gnLCBpc3M6IHRva2VuUHJvamVjdC5pc3MsIGV4cGVjdGVkOiB0b2tlblByb2plY3QuZXhwZWN0ZWRQcmVmaXggfSB9XG4gIH1cblxuICBjb25zdCBjYWxsRmV0Y2ggPSBhc3luYyAoand0OiBzdHJpbmcpID0+IHtcbiAgICBsZXQgcmVzOiBSZXNwb25zZVxuICAgIHRyeSB7XG4gICAgICByZXMgPSBhd2FpdCBmZXRjaChmblVybCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgYXBpa2V5OiBzdXBhYmFzZUFub25LZXksXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke2p3dH1gLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShib2R5KSxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZTogdW5rbm93bikge1xuICAgICAgY29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogJ0ZhbGhhIGRlIHJlZGUnXG4gICAgICByZXR1cm4geyBvazogZmFsc2UgYXMgY29uc3QsIHN0YXR1czogMCwgYm9keTogeyBlcnJvcjogJ25ldHdvcmtfZXJyb3InLCBtZXNzYWdlOiBtc2cgfSB9XG4gICAgfVxuXG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHJlcy50ZXh0KClcbiAgICBsZXQgcGFyc2VkOiB1bmtub3duID0gbnVsbFxuICAgIHRyeSB7XG4gICAgICBwYXJzZWQgPSB0ZXh0ID8gSlNPTi5wYXJzZSh0ZXh0KSA6IG51bGxcbiAgICB9IGNhdGNoIHtcbiAgICAgIHBhcnNlZCA9IHRleHRcbiAgICB9XG5cbiAgICBpZiAoIXJlcy5vayAmJiByZXMuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIGNvbnN0IHJhdyA9IHR5cGVvZiBwYXJzZWQgPT09ICdzdHJpbmcnID8gcGFyc2VkIDogdGV4dFxuICAgICAgaWYgKHR5cGVvZiByYXcgPT09ICdzdHJpbmcnICYmIHJhdy5pbmNsdWRlcygnUmVxdWVzdGVkIGZ1bmN0aW9uIHdhcyBub3QgZm91bmQnKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIG9rOiBmYWxzZSBhcyBjb25zdCxcbiAgICAgICAgICBzdGF0dXM6IDQwNCxcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlcnJvcjogJ2Z1bmN0aW9uX25vdF9kZXBsb3llZCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnQSBmdW7Dp8OjbyBwYXltZW50cyBuw6NvIGVzdMOhIHB1YmxpY2FkYSBubyBTdXBhYmFzZS4gRmHDp2EgZGVwbG95IGRhIEVkZ2UgRnVuY3Rpb24gYHBheW1lbnRzYCBubyBzZXUgcHJvamV0by4nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAhcmVzLm9rICYmXG4gICAgICByZXMuc3RhdHVzID09PSA0MDEgJiZcbiAgICAgIHBhcnNlZCAmJlxuICAgICAgdHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIChwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLm1lc3NhZ2UgPT09ICdJbnZhbGlkIEpXVCcgJiZcbiAgICAgIChwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmNvZGUgPT09IDQwMVxuICAgICkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlIGFzIGNvbnN0LCBzdGF0dXM6IDQwMSwgYm9keTogeyBlcnJvcjogJ3N1cGFiYXNlX2dhdGV3YXlfaW52YWxpZF9qd3QnIH0gfVxuICAgIH1cblxuICAgIGlmICghcmVzLm9rKSBjb25zb2xlLmVycm9yKCdwYXltZW50cyBlcnJvcicsIHsgc3RhdHVzOiByZXMuc3RhdHVzLCBib2R5OiBwYXJzZWQsIGJvZHlfanNvbjogc2FmZUpzb24ocGFyc2VkKSB9KVxuXG4gICAgaWYgKCFyZXMub2spIHJldHVybiB7IG9rOiBmYWxzZSBhcyBjb25zdCwgc3RhdHVzOiByZXMuc3RhdHVzLCBib2R5OiBwYXJzZWQgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlIGFzIGNvbnN0LCBzdGF0dXM6IHJlcy5zdGF0dXMsIGJvZHk6IHBhcnNlZCB9XG4gIH1cblxuICBjb25zdCBmaXJzdCA9IGF3YWl0IGNhbGxGZXRjaCh0b2tlbilcbiAgaWYgKCFmaXJzdC5vayAmJiBmaXJzdC5zdGF0dXMgPT09IDQwMSkge1xuICAgIGNvbnN0IHJlZnJlc2hlZCA9IGF3YWl0IHRyeVJlZnJlc2goKVxuICAgIGNvbnN0IG5leHRUb2tlbiA9IHJlZnJlc2hlZD8uYWNjZXNzX3Rva2VuID8/IG51bGxcbiAgICBpZiAoIW5leHRUb2tlbikge1xuICAgICAgYXdhaXQgc3VwYWJhc2UuYXV0aC5zaWduT3V0KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlIGFzIGNvbnN0LCBzdGF0dXM6IDQwMSwgYm9keTogeyBlcnJvcjogJ2ludmFsaWRfand0JyB9IH1cbiAgICB9XG4gICAgY29uc3QgbmV4dFByb2plY3QgPSBjaGVja0p3dFByb2plY3QobmV4dFRva2VuLCBzdXBhYmFzZVVybClcbiAgICBpZiAoIW5leHRQcm9qZWN0Lm9rKSB7XG4gICAgICBhd2FpdCBzdXBhYmFzZS5hdXRoLnNpZ25PdXQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgICByZXR1cm4geyBvazogZmFsc2UgYXMgY29uc3QsIHN0YXR1czogNDAxLCBib2R5OiB7IGVycm9yOiAnand0X3Byb2plY3RfbWlzbWF0Y2gnLCBpc3M6IG5leHRQcm9qZWN0LmlzcywgZXhwZWN0ZWQ6IG5leHRQcm9qZWN0LmV4cGVjdGVkUHJlZml4IH0gfVxuICAgIH1cbiAgICByZXR1cm4gY2FsbEZldGNoKG5leHRUb2tlbilcbiAgfVxuXG4gIHJldHVybiBmaXJzdFxufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVDaGVja291dFBhZ2FtZW50byhcbiAgdXN1YXJpb0lkOiBzdHJpbmcsXG4gIGl0ZW06IHN0cmluZyxcbiAgbWV0b2RvOiAnY2FyZCcgfCAncGl4JyxcbiAgZnVuY2lvbmFyaW9zVG90YWw/OiBudW1iZXIgfCBudWxsXG4pOiBQcm9taXNlPEZuUmVzdWx0PiB7XG4gIGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyBhY3Rpb246ICdjcmVhdGVfY2hlY2tvdXQnLCB1c3VhcmlvX2lkOiB1c3VhcmlvSWQsIHBsYW5vOiBpdGVtLCBtZXRvZG8gfVxuICBpZiAodHlwZW9mIGZ1bmNpb25hcmlvc1RvdGFsID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZnVuY2lvbmFyaW9zVG90YWwpKSBwYXlsb2FkLmZ1bmNpb25hcmlvc190b3RhbCA9IGZ1bmNpb25hcmlvc1RvdGFsXG4gIHJldHVybiBjYWxsUGF5bWVudHNGbihwYXlsb2FkKVxufVxuXG5hc3luYyBmdW5jdGlvbiBzeW5jQ2hlY2tvdXRTZXNzaW9uUGFnYW1lbnRvKHNlc3Npb25JZDogc3RyaW5nLCB1c3VhcmlvSWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPEZuUmVzdWx0PiB7XG4gIGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyBhY3Rpb246ICdzeW5jX2NoZWNrb3V0X3Nlc3Npb24nLCBzZXNzaW9uX2lkOiBzZXNzaW9uSWQgfVxuICBpZiAodXN1YXJpb0lkKSBwYXlsb2FkLnVzdWFyaW9faWQgPSB1c3VhcmlvSWRcbiAgcmV0dXJuIGNhbGxQYXltZW50c0ZuKHBheWxvYWQpXG59XG5cbnR5cGUgUGxhbktleSA9ICdmcmVlJyB8ICdiYXNpYycgfCAncHJvJyB8ICd0ZWFtJyB8ICdlbnRlcnByaXNlJ1xuXG50eXBlIFBsYW5DYXJkID0ge1xuICBrZXk6IFBsYW5LZXlcbiAgdGl0bGU6IHN0cmluZ1xuICBwcmljZUxhYmVsOiBzdHJpbmdcbiAgc3VidGl0bGU6IHN0cmluZ1xuICBidWxsZXRzOiBzdHJpbmdbXVxufVxuXG50eXBlIFNlcnZpY2VDYXJkID0ge1xuICBrZXk6ICdzZXR1cF9jb21wbGV0bycgfCAnY29uc3VsdG9yaWFfaG9yYSdcbiAgdGl0bGU6IHN0cmluZ1xuICBwcmljZUxhYmVsOiBzdHJpbmdcbiAgYnVsbGV0czogc3RyaW5nW11cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFBhZ2FtZW50b1BhZ2UoKSB7XG4gIGNvbnN0IHsgYXBwUHJpbmNpcGFsLCByZWZyZXNoIH0gPSB1c2VBdXRoKClcbiAgY29uc3QgbG9jYXRpb24gPSB1c2VMb2NhdGlvbigpXG4gIGNvbnN0IG5hdmlnYXRlID0gdXNlTmF2aWdhdGUoKVxuICBjb25zdCB1c3VhcmlvID0gYXBwUHJpbmNpcGFsPy5raW5kID09PSAndXN1YXJpbycgPyBhcHBQcmluY2lwYWwucHJvZmlsZSA6IG51bGxcbiAgY29uc3QgdXN1YXJpb0lkID0gdXN1YXJpbz8uaWQgPz8gbnVsbFxuXG4gIGNvbnN0IFtjaGVja291dE5vdGljZSwgc2V0Q2hlY2tvdXROb3RpY2VdID0gdXNlU3RhdGU8bnVsbCB8IHsga2luZDogJ3N1Y2Nlc3MnIHwgJ2NhbmNlbCc7IGl0ZW06IHN0cmluZyB8IG51bGwgfT4obnVsbClcbiAgY29uc3QgW3VzZXJTZWxlY3RlZFBsYW4sIHNldFVzZXJTZWxlY3RlZFBsYW5dID0gdXNlU3RhdGU8UGxhbktleSB8IG51bGw+KG51bGwpXG4gIGNvbnN0IFtzZWxlY3RlZFNlcnZpY2UsIHNldFNlbGVjdGVkU2VydmljZV0gPSB1c2VTdGF0ZTxTZXJ2aWNlQ2FyZFsna2V5J10gfCBudWxsPihudWxsKVxuICBjb25zdCBbY3JlYXRpbmdDaGVja291dCwgc2V0Q3JlYXRpbmdDaGVja291dF0gPSB1c2VTdGF0ZShmYWxzZSlcbiAgY29uc3QgW2Vycm9yLCBzZXRFcnJvcl0gPSB1c2VTdGF0ZTxzdHJpbmcgfCBudWxsPihudWxsKVxuICBjb25zdCBbZnVuY2lvbmFyaW9zVG90YWwsIHNldEZ1bmNpb25hcmlvc1RvdGFsXSA9IHVzZVN0YXRlPG51bWJlciB8IG51bGw+KG51bGwpXG5cbiAgY29uc3QgZm9ybWF0Q2hlY2tvdXRFcnJvciA9IChzdGF0dXM6IG51bWJlciwgYm9keTogdW5rbm93bikgPT4ge1xuICAgIGlmICh0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycgJiYgYm9keS50cmltKCkpIHJldHVybiBib2R5XG4gICAgaWYgKGJvZHkgJiYgdHlwZW9mIGJvZHkgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCBvYmogPSBib2R5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICAgICBjb25zdCBlcnIgPSB0eXBlb2Ygb2JqLmVycm9yID09PSAnc3RyaW5nJyA/IG9iai5lcnJvciA6IG51bGxcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0eXBlb2Ygb2JqLm1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIG9iai5tZXNzYWdlLnRyaW0oKSA/IG9iai5tZXNzYWdlLnRyaW0oKSA6IG51bGxcbiAgICAgIGlmIChtZXNzYWdlKSB7XG4gICAgICAgIGNvbnN0IHN0cmlwZVN0YXR1cyA9IHR5cGVvZiBvYmouc3RyaXBlX3N0YXR1cyA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKG9iai5zdHJpcGVfc3RhdHVzKSA/IG9iai5zdHJpcGVfc3RhdHVzIDogbnVsbFxuICAgICAgICBpZiAoZXJyID09PSAnc3RyaXBlX2Vycm9yJyAmJiBzdHJpcGVTdGF0dXMpIHJldHVybiBgU3RyaXBlIChIVFRQICR7c3RyaXBlU3RhdHVzfSk6ICR7bWVzc2FnZX1gXG4gICAgICAgIHJldHVybiBtZXNzYWdlXG4gICAgICB9XG4gICAgICBpZiAoZXJyID09PSAnbWlzc2luZ19zdXBhYmFzZV9lbnYnKSByZXR1cm4gJ0NvbmZpZ3VyYcOnw6NvIGRvIFN1cGFiYXNlIGF1c2VudGUgbm8gYW1iaWVudGUuJ1xuICAgICAgaWYgKGVyciA9PT0gJ25ldHdvcmtfZXJyb3InKSByZXR1cm4gdHlwZW9mIG9iai5tZXNzYWdlID09PSAnc3RyaW5nJyAmJiBvYmoubWVzc2FnZS50cmltKCkgPyBvYmoubWVzc2FnZSA6ICdGYWxoYSBkZSByZWRlIGFvIGluaWNpYXIgcGFnYW1lbnRvLidcbiAgICAgIGlmIChlcnIgPT09ICdzZXNzaW9uX2V4cGlyZWQnIHx8IGVyciA9PT0gJ2ludmFsaWRfand0JykgcmV0dXJuICdTZXNzw6NvIGV4cGlyYWRhIG5vIFN1cGFiYXNlLiBTYWlhIGUgZW50cmUgbm92YW1lbnRlLidcbiAgICAgIGlmIChlcnIgPT09ICdqd3RfcHJvamVjdF9taXNtYXRjaCcpIHJldHVybiAnU2Vzc8OjbyBkbyBTdXBhYmFzZSBwZXJ0ZW5jZSBhIG91dHJvIHByb2pldG8uIFNhaWEgZSBlbnRyZSBub3ZhbWVudGUuJ1xuICAgICAgaWYgKGVyciA9PT0gJ3N1cGFiYXNlX2dhdGV3YXlfaW52YWxpZF9qd3QnKSByZXR1cm4gJ0EgRWRnZSBGdW5jdGlvbiBlc3TDoSBleGlnaW5kbyBKV1Qgbm8gZ2F0ZXdheS4gRmHDp2EgZGVwbG95IGNvbSB2ZXJpZnlfand0PWZhbHNlLidcbiAgICAgIGlmIChlcnIgPT09ICdmdW5jdGlvbl9ub3RfZGVwbG95ZWQnKSByZXR1cm4gJ0EgZnVuw6fDo28gcGF5bWVudHMgbsOjbyBlc3TDoSBwdWJsaWNhZGEgbm8gU3VwYWJhc2UuJ1xuICAgICAgY29uc3QgYXNKc29uID0gc2FmZUpzb24oYm9keSlcbiAgICAgIGlmIChlcnIgJiYgYXNKc29uKSByZXR1cm4gYEVycm8gYW8gaW5pY2lhciBwYWdhbWVudG86ICR7ZXJyfSAoSFRUUCAke3N0YXR1c30pOiAke2FzSnNvbn1gXG4gICAgICBpZiAoZXJyKSByZXR1cm4gYEVycm8gYW8gaW5pY2lhciBwYWdhbWVudG86ICR7ZXJyfSAoSFRUUCAke3N0YXR1c30pLmBcbiAgICAgIGlmIChhc0pzb24pIHJldHVybiBgRXJybyBhbyBpbmljaWFyIHBhZ2FtZW50byAoSFRUUCAke3N0YXR1c30pOiAke2FzSnNvbn1gXG4gICAgfVxuICAgIHJldHVybiBgRXJybyBhbyBpbmljaWFyIHBhZ2FtZW50byAoSFRUUCAke3N0YXR1c30pLmBcbiAgfVxuXG4gIGNvbnN0IGNhblNob3dGcmVlID0gQm9vbGVhbih1c3VhcmlvICYmIHVzdWFyaW8ucGxhbm8gPT09ICdmcmVlJyAmJiB1c3VhcmlvLnN0YXR1c19wYWdhbWVudG8gPT09ICd0cmlhbCcgJiYgdXN1YXJpby5mcmVlX3RyaWFsX2NvbnN1bWlkbyAhPT0gdHJ1ZSlcblxuICBjb25zdCBwbGFucyA9IHVzZU1lbW88UGxhbkNhcmRbXT4oXG4gICAgKCkgPT5cbiAgICAgIFtcbiAgICAgICAgLi4uKGNhblNob3dGcmVlXG4gICAgICAgICAgPyBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBrZXk6ICdmcmVlJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0ZSRUUnLFxuICAgICAgICAgICAgICAgIHByaWNlTGFiZWw6ICdSJCAwL23DqnMnLFxuICAgICAgICAgICAgICAgIHN1YnRpdGxlOiAnUGFyYSB0ZXN0YXInLFxuICAgICAgICAgICAgICAgIGJ1bGxldHM6IFsnQXTDqSAzMCBhZ2VuZGFtZW50b3MgcG9yIG3DqnMnLCAnMSBwcm9maXNzaW9uYWwnLCAnTGVtYnJldGVzIG1hbnVhaXMgKGxpbmsgZG8gV2hhdHNBcHApJywgJ1N1cG9ydGUgcG9yIGVtYWlsJ10sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdXG4gICAgICAgICAgOiBbXSksXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdiYXNpYycsXG4gICAgICAgICAgdGl0bGU6ICdCQVNJQycsXG4gICAgICAgICAgcHJpY2VMYWJlbDogJ1IkIDM0LDk5L23DqnMnLFxuICAgICAgICAgIHN1YnRpdGxlOiAnJyxcbiAgICAgICAgICBidWxsZXRzOiBbJ0FnZW5kYW1lbnRvcyA2MCBwb3IgbcOqcycsICcxIHByb2Zpc3Npb25hbCBpbmNsdcOtZG8nLCAnTGVtYnJldGVzIGF1dG9tw6F0aWNvcyB2aWEgV2hhdHNBcHAnLCAnQXTDqSAzIHNlcnZpw6dvcycsICdQw6FnaW5hIHDDumJsaWNhIHBlcnNvbmFsaXrDoXZlbCcsICdTdXBvcnRlIHBvciBlbWFpbCddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAncHJvJyxcbiAgICAgICAgICB0aXRsZTogJ1BSTycsXG4gICAgICAgICAgcHJpY2VMYWJlbDogJ1IkIDU5LDk5L23DqnMnLFxuICAgICAgICAgIHN1YnRpdGxlOiAnQXTDqSAxMiBwcm9maXNzaW9uYWlzICg4IGluY2x1c29zICsgYXTDqSA0IGFkaWNpb25haXMgZGUgUiQgNyknLFxuICAgICAgICAgIGJ1bGxldHM6IFsnQXTDqSA4IHByb2Zpc3Npb25haXMgaW5jbHXDrWRvcycsICdTZXJ2acOnb3MgaWxpbWl0YWRvcycsICdMb2dvIGUgZm90b3MgZGUgc2VydmnDp29zJywgJ1JlbGF0w7NyaW9zJywgJ0Jsb3F1ZWlvcyByZWNvcnJlbnRlcycsICdTdXBvcnRlIHZpYSBXaGF0c0FwcCddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnZW50ZXJwcmlzZScsXG4gICAgICAgICAgdGl0bGU6ICdFTVBSRVNBJyxcbiAgICAgICAgICBwcmljZUxhYmVsOiAnUiQgOTgsOTkvbcOqcycsXG4gICAgICAgICAgc3VidGl0bGU6ICdJbGltaXRhZG8nLFxuICAgICAgICAgIGJ1bGxldHM6IFsnUHJvZmlzc2lvbmFpcyBpbGltaXRhZG9zJywgJ011bHRpLXVuaWRhZGVzJywgJ0FnZW5kYW1lbnRvcyBpbGltaXRhZG9zJywgJ1NlcnZpw6dvcyBpbGltaXRhZG9zJywgJ0xvZ28gZSBmb3RvcyBkZSBzZXJ2acOnb3MnLCAnU3Vwb3J0ZSB2aWEgV2hhdHNBcHAnXSxcbiAgICAgICAgfSxcbiAgICAgIF0gc2F0aXNmaWVzIFBsYW5DYXJkW10sXG4gICAgW2NhblNob3dGcmVlXVxuICApXG5cbiAgY29uc3Qgc2VydmljZXMgPSB1c2VNZW1vPFNlcnZpY2VDYXJkW10+KFxuICAgICgpID0+XG4gICAgICBbXG4gICAgICAgIHsga2V5OiAnc2V0dXBfY29tcGxldG8nLCB0aXRsZTogJ1NldHVwIENvbXBsZXRvJywgcHJpY2VMYWJlbDogJ1IkIDE1MCAodW1hIHZleiknLCBidWxsZXRzOiBbJ1ZvY8OqIGNvbmZpZ3VyYSB0dWRvIHBhcmEgbyBjbGllbnRlJywgJ0NhZGFzdHJhIHNlcnZpw6dvcywgZm90b3MsIGhvcsOhcmlvcycsICdDb25lY3RhIFdoYXRzQXBwJywgJ1Rlc3RhIGVudmlvcycsICdUcmVpbmEgbyBjbGllbnRlIGVtIDE1IG1pbnV0b3MnXSB9LFxuICAgICAgICB7IGtleTogJ2NvbnN1bHRvcmlhX2hvcmEnLCB0aXRsZTogJ0NvbnN1bHRvcmlhIHBvciBIb3JhJywgcHJpY2VMYWJlbDogJ1IkIDgwL2hvcmEnLCBidWxsZXRzOiBbJ0FqdWRhIGNvbSBjb25maWd1cmHDp8O1ZXMgYXZhbsOnYWRhcycsICdTdWdlc3TDtWVzIGRlIG90aW1pemHDp8OjbycsICdEw7p2aWRhcyBnZXJhaXMnXSB9LFxuICAgICAgXSBzYXRpc2ZpZXMgU2VydmljZUNhcmRbXSxcbiAgICBbXVxuICApXG5cbiAgY29uc3QgY3VycmVudFBsYW4gPSB1c2VNZW1vPFBsYW5LZXk+KCgpID0+IHtcbiAgICBjb25zdCBjdXJyZW50ID0gKHVzdWFyaW8/LnBsYW5vID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKSBhcyBQbGFuS2V5XG4gICAgaWYgKGN1cnJlbnQgPT09ICdmcmVlJykgcmV0dXJuIGNhblNob3dGcmVlID8gJ2ZyZWUnIDogJ2Jhc2ljJ1xuICAgIGlmIChjdXJyZW50ID09PSAnZW50ZXJwcmlzZScpIHJldHVybiAnZW50ZXJwcmlzZSdcbiAgICBpZiAoY3VycmVudCA9PT0gJ3RlYW0nKSByZXR1cm4gJ3BybydcbiAgICBpZiAoY3VycmVudCA9PT0gJ2Jhc2ljJyB8fCBjdXJyZW50ID09PSAncHJvJykgcmV0dXJuIGN1cnJlbnRcbiAgICByZXR1cm4gJ2Jhc2ljJ1xuICB9LCBbY2FuU2hvd0ZyZWUsIHVzdWFyaW8/LnBsYW5vXSlcblxuICBjb25zdCBzZWxlY3RlZFBsYW4gPSB1c2VyU2VsZWN0ZWRQbGFuID8/IGN1cnJlbnRQbGFuXG5cbiAgY29uc3QgZGVmYXVsdEZ1bmNpb25hcmlvc1RvdGFsID0gdXNlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgcmF3ID0gdXN1YXJpbz8ubGltaXRlX2Z1bmNpb25hcmlvc1xuICAgIGNvbnN0IG4gPSB0eXBlb2YgcmF3ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUocmF3KSAmJiByYXcgPiAwID8gTWF0aC5mbG9vcihyYXcpIDogMVxuICAgIHJldHVybiBNYXRoLm1heCgxLCBNYXRoLm1pbigyMDAsIG4pKVxuICB9LCBbdXN1YXJpbz8ubGltaXRlX2Z1bmNpb25hcmlvc10pXG5cbiAgY29uc3QgaW5jbHVkZWRQcm8gPSA4XG4gIGNvbnN0IG1heFBybyA9IDEyXG4gIGNvbnN0IGRlZmF1bHRQcm9GdW5jaW9uYXJpb3NUb3RhbCA9IHVzZU1lbW8oKCkgPT4ge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXhQcm8sIE1hdGgubWF4KGluY2x1ZGVkUHJvLCBkZWZhdWx0RnVuY2lvbmFyaW9zVG90YWwpKVxuICB9LCBbZGVmYXVsdEZ1bmNpb25hcmlvc1RvdGFsLCBpbmNsdWRlZFBybywgbWF4UHJvXSlcblxuICBjb25zdCBlZmZlY3RpdmVGdW5jaW9uYXJpb3NUb3RhbCA9IGZ1bmNpb25hcmlvc1RvdGFsID8/IChzZWxlY3RlZFBsYW4gPT09ICdwcm8nID8gZGVmYXVsdFByb0Z1bmNpb25hcmlvc1RvdGFsIDogZGVmYXVsdEZ1bmNpb25hcmlvc1RvdGFsKVxuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgcnVuID0gYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc2VhcmNoID0gbG9jYXRpb24uc2VhcmNoID8/ICcnXG4gICAgICBpZiAoIXNlYXJjaCkgcmV0dXJuXG4gICAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHNlYXJjaClcbiAgICAgIGNvbnN0IGNoZWNrb3V0ID0gKHBhcmFtcy5nZXQoJ2NoZWNrb3V0JykgPz8gJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gICAgICBpZiAoY2hlY2tvdXQgIT09ICdzdWNjZXNzJyAmJiBjaGVja291dCAhPT0gJ2NhbmNlbCcpIHJldHVyblxuXG4gICAgICBjb25zdCBpdGVtID0gKHBhcmFtcy5nZXQoJ2l0ZW0nKSA/PyBwYXJhbXMuZ2V0KCdwbGFubycpID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKSB8fCBudWxsXG4gICAgICBzZXRDaGVja291dE5vdGljZSh7IGtpbmQ6IGNoZWNrb3V0LCBpdGVtIH0pXG5cbiAgICAgIGNvbnN0IHNlc3Npb25JZCA9IChwYXJhbXMuZ2V0KCdzZXNzaW9uX2lkJykgPz8gJycpLnRyaW0oKVxuICAgICAgY29uc3QgdXN1YXJpb0lkRnJvbVBhcmFtcyA9IChwYXJhbXMuZ2V0KCd1c3VhcmlvX2lkJykgPz8gJycpLnRyaW0oKSB8fCBudWxsXG5cbiAgICAgIGNvbnN0IGZpcnN0ID0gYXdhaXQgcmVmcmVzaCgpXG4gICAgICBjb25zdCByZWZyZXNoZWRVc3VhcmlvSWQgPSBmaXJzdD8ua2luZCA9PT0gJ3VzdWFyaW8nID8gZmlyc3QucHJvZmlsZS5pZCA6IG51bGxcbiAgICAgIGNvbnN0IGVmZmVjdGl2ZVVzdWFyaW9JZCA9IHJlZnJlc2hlZFVzdWFyaW9JZCA/PyB1c3VhcmlvSWRGcm9tUGFyYW1zXG5cbiAgICAgIGlmIChjaGVja291dCA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICBjb25zdCBzeW5jID0gYXdhaXQgc3luY0NoZWNrb3V0U2Vzc2lvblBhZ2FtZW50byhzZXNzaW9uSWQsIGVmZmVjdGl2ZVVzdWFyaW9JZClcbiAgICAgICAgICBpZiAoIXN5bmMub2spIHtcbiAgICAgICAgICAgIHNldEVycm9yKGZvcm1hdENoZWNrb3V0RXJyb3Ioc3luYy5zdGF0dXMsIHN5bmMuYm9keSkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHJlZnJlc2goKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0cmllcyA9IDBcbiAgICAgICAgd2hpbGUgKHRyaWVzIDwgMTApIHtcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCAyMDAwKSlcbiAgICAgICAgICBjb25zdCBuZXh0ID0gYXdhaXQgcmVmcmVzaCgpXG4gICAgICAgICAgaWYgKG5leHQ/LmtpbmQgPT09ICd1c3VhcmlvJyAmJiBuZXh0LnByb2ZpbGUuc3RhdHVzX3BhZ2FtZW50byA9PT0gJ2F0aXZvJykgYnJlYWtcbiAgICAgICAgICB0cmllcyArPSAxXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbmF2aWdhdGUoJy9wYWdhbWVudG8nLCB7IHJlcGxhY2U6IHRydWUgfSlcbiAgICB9XG4gICAgcnVuKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICB9LCBbbG9jYXRpb24uc2VhcmNoLCBuYXZpZ2F0ZSwgcmVmcmVzaF0pXG5cbiAgY29uc3Qgc3RhcnRQbGFuQ2hlY2tvdXQgPSBhc3luYyAobWV0b2RvOiAnY2FyZCcgfCAncGl4JykgPT4ge1xuICAgIGlmICghdXN1YXJpb0lkKSByZXR1cm5cbiAgICBjb25zdCBwbGFuID0gc2VsZWN0ZWRQbGFuXG4gICAgaWYgKCFwbGFuIHx8IHBsYW4gPT09ICdmcmVlJykge1xuICAgICAgc2V0RXJyb3IoJ1NlbGVjaW9uZSB1bSBwbGFubyB2w6FsaWRvLicpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCByZXF1ZXN0ZWQgPSBwbGFuID09PSAncHJvJyA/IE1hdGguZmxvb3IoZWZmZWN0aXZlRnVuY2lvbmFyaW9zVG90YWwgfHwgaW5jbHVkZWRQcm8pIDogMVxuICAgIGlmIChwbGFuID09PSAncHJvJyAmJiByZXF1ZXN0ZWQgPiBtYXhQcm8pIHtcbiAgICAgIHNldFVzZXJTZWxlY3RlZFBsYW4oJ2VudGVycHJpc2UnKVxuICAgICAgc2V0RnVuY2lvbmFyaW9zVG90YWwobnVsbClcbiAgICAgIHNldEVycm9yKCdQYXJhIG1haXMgZGUgMTIgcHJvZmlzc2lvbmFpcywgc2VsZWNpb25lIG8gcGxhbm8gRU1QUkVTQS4nKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgdG90YWwgPSBwbGFuID09PSAncHJvJyA/IE1hdGgubWF4KGluY2x1ZGVkUHJvLCBNYXRoLm1pbihtYXhQcm8sIHJlcXVlc3RlZCkpIDogMVxuXG4gICAgc2V0Q3JlYXRpbmdDaGVja291dCh0cnVlKVxuICAgIHNldEVycm9yKG51bGwpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgY3JlYXRlQ2hlY2tvdXRQYWdhbWVudG8odXN1YXJpb0lkLCBwbGFuLCBtZXRvZG8sIHRvdGFsKVxuICAgIGlmICghcmVzLm9rKSB7XG4gICAgICBzZXRFcnJvcihmb3JtYXRDaGVja291dEVycm9yKHJlcy5zdGF0dXMsIHJlcy5ib2R5KSlcbiAgICAgIHNldENyZWF0aW5nQ2hlY2tvdXQoZmFsc2UpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgYm9keSA9IHJlcy5ib2R5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICAgY29uc3QgdXJsID0gdHlwZW9mIGJvZHkudXJsID09PSAnc3RyaW5nJyA/IGJvZHkudXJsIDogbnVsbFxuICAgIGlmICghdXJsKSB7XG4gICAgICBzZXRFcnJvcignQSBmdW7Dp8OjbyBuw6NvIHJldG9ybm91IG8gbGluayBkZSBjaGVja291dC4nKVxuICAgICAgc2V0Q3JlYXRpbmdDaGVja291dChmYWxzZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybFxuICB9XG5cbiAgY29uc3Qgc3RhcnRTZXJ2aWNlQ2hlY2tvdXQgPSBhc3luYyAobWV0b2RvOiAnY2FyZCcgfCAncGl4JykgPT4ge1xuICAgIGlmICghdXN1YXJpb0lkIHx8ICFzZWxlY3RlZFNlcnZpY2UpIHJldHVyblxuICAgIHNldENyZWF0aW5nQ2hlY2tvdXQodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGNyZWF0ZUNoZWNrb3V0UGFnYW1lbnRvKHVzdWFyaW9JZCwgc2VsZWN0ZWRTZXJ2aWNlLCBtZXRvZG8pXG4gICAgaWYgKCFyZXMub2spIHtcbiAgICAgIHNldEVycm9yKGZvcm1hdENoZWNrb3V0RXJyb3IocmVzLnN0YXR1cywgcmVzLmJvZHkpKVxuICAgICAgc2V0Q3JlYXRpbmdDaGVja291dChmYWxzZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBib2R5ID0gcmVzLmJvZHkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICBjb25zdCB1cmwgPSB0eXBlb2YgYm9keS51cmwgPT09ICdzdHJpbmcnID8gYm9keS51cmwgOiBudWxsXG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHNldEVycm9yKCdBIGZ1bsOnw6NvIG7Do28gcmV0b3Jub3UgbyBsaW5rIGRlIGNoZWNrb3V0LicpXG4gICAgICBzZXRDcmVhdGluZ0NoZWNrb3V0KGZhbHNlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsXG4gIH1cblxuICBpZiAoIXVzdWFyaW8pIHtcbiAgICByZXR1cm4gKFxuICAgICAgPEFwcFNoZWxsPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNzAwXCI+QWNlc3NvIHJlc3RyaXRvLjwvZGl2PlxuICAgICAgPC9BcHBTaGVsbD5cbiAgICApXG4gIH1cblxuICBjb25zdCBmb3JtYXRTdGF0dXNQYWdhbWVudG8gPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IHYgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gICAgaWYgKCF2KSByZXR1cm4gJ+KAlCdcbiAgICBpZiAodiA9PT0gJ2F0aXZvJykgcmV0dXJuICdBdGl2bydcbiAgICBpZiAodiA9PT0gJ3RyaWFsJykgcmV0dXJuICdUcmlhbCdcbiAgICBpZiAodiA9PT0gJ2luYWRpbXBsZW50ZScpIHJldHVybiAnSW5hZGltcGxlbnRlJ1xuICAgIGlmICh2ID09PSAnc3VzcGVuc28nKSByZXR1cm4gJ1N1c3BlbnNvJ1xuICAgIGlmICh2ID09PSAnY2FuY2VsYWRvJykgcmV0dXJuICdDYW5jZWxhZG8nXG4gICAgcmV0dXJuIHZhbHVlXG4gIH1cblxuICBjb25zdCBzdGF0dXNUb25lID0gdXN1YXJpby5zdGF0dXNfcGFnYW1lbnRvID09PSAnaW5hZGltcGxlbnRlJyA/ICdyZWQnIDogdXN1YXJpby5zdGF0dXNfcGFnYW1lbnRvID09PSAnYXRpdm8nID8gJ2dyZWVuJyA6ICdzbGF0ZSdcblxuICBjb25zdCBwbGFub0xhYmVsID0gKHBsYW5vUmF3OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBwID0gU3RyaW5nKHBsYW5vUmF3ID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKVxuICAgIGlmIChwID09PSAnZW50ZXJwcmlzZScpIHJldHVybiAnRU1QUkVTQSdcbiAgICBpZiAocCA9PT0gJ3RlYW0nKSByZXR1cm4gJ1BSTydcbiAgICBpZiAocCA9PT0gJ3BybycpIHJldHVybiAnUFJPJ1xuICAgIGlmIChwID09PSAnYmFzaWMnKSByZXR1cm4gJ0JBU0lDJ1xuICAgIGlmIChwID09PSAnZnJlZScpIHJldHVybiAnRlJFRSdcbiAgICByZXR1cm4gcGxhbm9SYXdcbiAgfVxuXG4gIHJldHVybiAoXG4gICAgPEFwcFNoZWxsPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTZcIj5cbiAgICAgICAge2NoZWNrb3V0Tm90aWNlID8gKFxuICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgIGNsYXNzTmFtZT17W1xuICAgICAgICAgICAgICAncm91bmRlZC14bCBib3JkZXIgcC00IHRleHQtc20nLFxuICAgICAgICAgICAgICBjaGVja291dE5vdGljZS5raW5kID09PSAnc3VjY2VzcycgPyAnYm9yZGVyLWVtZXJhbGQtMjAwIGJnLWVtZXJhbGQtNTAgdGV4dC1lbWVyYWxkLTgwMCcgOiAnYm9yZGVyLWFtYmVyLTIwMCBiZy1hbWJlci01MCB0ZXh0LWFtYmVyLTkwMCcsXG4gICAgICAgICAgICBdLmpvaW4oJyAnKX1cbiAgICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC13cmFwIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTNcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTFcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGRcIj57Y2hlY2tvdXROb3RpY2Uua2luZCA9PT0gJ3N1Y2Nlc3MnID8gJ1BhZ2FtZW50byBjb25jbHXDrWRvJyA6ICdQYWdhbWVudG8gY2FuY2VsYWRvJ308L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAge2NoZWNrb3V0Tm90aWNlLml0ZW0gPyBgSXRlbTogJHtjaGVja291dE5vdGljZS5pdGVtLnRvVXBwZXJDYXNlKCl9LiBgIDogJyd9U3RhdHVzOiB7Zm9ybWF0U3RhdHVzUGFnYW1lbnRvKHVzdWFyaW8uc3RhdHVzX3BhZ2FtZW50byl9LlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgICAgIDxCdXR0b24gdmFyaWFudD1cInNlY29uZGFyeVwiIG9uQ2xpY2s9eygpID0+IHZvaWQgcmVmcmVzaCgpfT5cbiAgICAgICAgICAgICAgICAgIEF0dWFsaXphclxuICAgICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgICAgIDxCdXR0b24gdmFyaWFudD1cInNlY29uZGFyeVwiIG9uQ2xpY2s9eygpID0+IHNldENoZWNrb3V0Tm90aWNlKG51bGwpfT5cbiAgICAgICAgICAgICAgICAgIEZlY2hhclxuICAgICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogbnVsbH1cblxuICAgICAgICB7ZXJyb3IgPyA8ZGl2IGNsYXNzTmFtZT1cInJvdW5kZWQteGwgYm9yZGVyIGJvcmRlci1yb3NlLTIwMCBiZy1yb3NlLTUwIHAtMyB0ZXh0LXNtIHRleHQtcm9zZS03MDBcIj57ZXJyb3J9PC9kaXY+IDogbnVsbH1cblxuICAgICAgICA8Q2FyZD5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInAtNiBzcGFjZS15LTRcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LXdyYXAgaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC0zXCI+XG4gICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS05MDBcIj5QYWdhbWVudG88L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5cbiAgICAgICAgICAgICAgICAgIFBsYW5vIGF0dWFsOiB7cGxhbm9MYWJlbCh1c3VhcmlvLnBsYW5vKX1cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICA8QmFkZ2UgdG9uZT17dXN1YXJpby5hdGl2byA/ICdncmVlbicgOiAncmVkJ30+e3VzdWFyaW8uYXRpdm8gPyAnQ29udGE6IEF0aXZhJyA6ICdDb250YTogSW5hdGl2YSd9PC9CYWRnZT5cbiAgICAgICAgICAgICAgICA8QmFkZ2UgdG9uZT17c3RhdHVzVG9uZX0+UGFnYW1lbnRvOiB7Zm9ybWF0U3RhdHVzUGFnYW1lbnRvKHVzdWFyaW8uc3RhdHVzX3BhZ2FtZW50byl9PC9CYWRnZT5cbiAgICAgICAgICAgICAgICA8QnV0dG9uIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBvbkNsaWNrPXsoKSA9PiB2b2lkIHJlZnJlc2goKX0+XG4gICAgICAgICAgICAgICAgICBBdHVhbGl6YXIgc3RhdHVzXG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZ3JpZCBncmlkLWNvbHMtMSBnYXAtMyBzbTpncmlkLWNvbHMtMiBsZzpncmlkLWNvbHMtM1wiPlxuICAgICAgICAgICAgICB7cGxhbnMubWFwKChwKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RlZFBsYW4gPT09IHAua2V5XG4gICAgICAgICAgICAgICAgY29uc3QgY2xpY2thYmxlID0gcC5rZXkgIT09ICdmcmVlJ1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBwLmtleSA9PT0gJ3BybydcbiAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBrZXk9e3Aua2V5fVxuICAgICAgICAgICAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGlmICghY2xpY2thYmxlKSByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgICBzZXRVc2VyU2VsZWN0ZWRQbGFuKHAua2V5KVxuICAgICAgICAgICAgICAgICAgICAgIHNldEZ1bmNpb25hcmlvc1RvdGFsKG51bGwpXG4gICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17W1xuICAgICAgICAgICAgICAgICAgICAgICd0ZXh0LWxlZnQgcm91bmRlZC14bCBib3JkZXIgYmctd2hpdGUgcC00IHRyYW5zaXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgIGJlc3RcbiAgICAgICAgICAgICAgICAgICAgICAgID8gc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPyAnYm9yZGVyLXNsYXRlLTkwMCByaW5nLTIgcmluZy1zbGF0ZS05MDAvMTAgYmctYW1iZXItNTAnXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDogJ2JvcmRlci1hbWJlci0zMDAgaG92ZXI6YmctYW1iZXItNTAnXG4gICAgICAgICAgICAgICAgICAgICAgICA6IHNlbGVjdGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgID8gJ2JvcmRlci1zbGF0ZS05MDAgcmluZy0yIHJpbmctc2xhdGUtOTAwLzEwJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdib3JkZXItc2xhdGUtMjAwIGhvdmVyOmJnLXNsYXRlLTUwJyxcbiAgICAgICAgICAgICAgICAgICAgICBjbGlja2FibGUgPyAnJyA6ICdjdXJzb3ItZGVmYXVsdCcsXG4gICAgICAgICAgICAgICAgICAgIF0uam9pbignICcpfVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC0zXCI+XG4gICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtOTAwXCI+e3AudGl0bGV9PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS02MDBcIj57cC5wcmljZUxhYmVsfXtwLnN1YnRpdGxlID8gYCDigKIgJHtwLnN1YnRpdGxlfWAgOiAnJ308L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICB7YmVzdCA/IDxCYWRnZSB0b25lPVwieWVsbG93XCI+TWVsaG9yIG9ww6fDo288L0JhZGdlPiA6IG51bGx9XG4gICAgICAgICAgICAgICAgICAgICAgICB7c2VsZWN0ZWQgPyA8QmFkZ2UgdG9uZT1cInNsYXRlXCI+U2VsZWNpb25hZG88L0JhZGdlPiA6IG51bGx9XG4gICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm10LTMgc3BhY2UteS0xXCI+XG4gICAgICAgICAgICAgICAgICAgICAge3AuYnVsbGV0cy5tYXAoKGIpID0+IChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYga2V5PXtifSBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNzAwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgIC0ge2J9XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICApKX1cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIHtzZWxlY3RlZFBsYW4gPT09ICdwcm8nID8gKFxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImdyaWQgZ3JpZC1jb2xzLTEgZ2FwLTMgc206Z3JpZC1jb2xzLTJcIj5cbiAgICAgICAgICAgICAgICA8SW5wdXRcbiAgICAgICAgICAgICAgICAgIGxhYmVsPVwiUHJvZmlzc2lvbmFpc1wiXG4gICAgICAgICAgICAgICAgICB0eXBlPVwibnVtYmVyXCJcbiAgICAgICAgICAgICAgICAgIG1pbj17aW5jbHVkZWRQcm99XG4gICAgICAgICAgICAgICAgICBtYXg9e21heFByb31cbiAgICAgICAgICAgICAgICAgIHZhbHVlPXtTdHJpbmcoZWZmZWN0aXZlRnVuY2lvbmFyaW9zVG90YWwpfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGUudGFyZ2V0LnZhbHVlXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSByYXcudHJpbSgpID09PSAnJyA/IGluY2x1ZGVkUHJvIDogTnVtYmVyKHJhdylcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVyblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpID0gTWF0aC5mbG9vcihuKVxuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+IG1heFBybykge1xuICAgICAgICAgICAgICAgICAgICAgIHNldFVzZXJTZWxlY3RlZFBsYW4oJ2VudGVycHJpc2UnKVxuICAgICAgICAgICAgICAgICAgICAgIHNldEZ1bmNpb25hcmlvc1RvdGFsKG51bGwpXG4gICAgICAgICAgICAgICAgICAgICAgc2V0RXJyb3IoJ1BhcmEgbWFpcyBkZSAxMiBwcm9maXNzaW9uYWlzLCBzZWxlY2lvbmUgbyBwbGFubyBFTVBSRVNBLicpXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KGluY2x1ZGVkUHJvLCBNYXRoLm1pbihtYXhQcm8sIGkpKVxuICAgICAgICAgICAgICAgICAgICBzZXRGdW5jaW9uYXJpb3NUb3RhbChjbGFtcGVkKVxuICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicm91bmRlZC14bCBib3JkZXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MCBwLTQgdGV4dC14cyB0ZXh0LXNsYXRlLTcwMCBmbGV4IGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgTyBjaGVja291dCBjYWxjdWxhIDggcHJvZmlzc2lvbmFpcyBpbmNsdXNvcyArIGFkaWNpb25hbCBwb3IgcHJvZmlzc2lvbmFsIGFjaW1hIGRlIDggKG3DoXhpbW8gMTIgbm8gUFJPKS5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICApIDogbnVsbH1cblxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtd3JhcCBqdXN0aWZ5LWVuZCBnYXAtMlwiPlxuICAgICAgICAgICAgICA8QnV0dG9uIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBvbkNsaWNrPXsoKSA9PiB2b2lkIHN0YXJ0UGxhbkNoZWNrb3V0KCdwaXgnKX0gZGlzYWJsZWQ9e2NyZWF0aW5nQ2hlY2tvdXQgfHwgc2VsZWN0ZWRQbGFuID09PSAnZnJlZSd9PlxuICAgICAgICAgICAgICAgIHtjcmVhdGluZ0NoZWNrb3V0ID8gJ0FicmluZG/igKYnIDogJ1BJWCAoMzAgZGlhcyknfVxuICAgICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXsoKSA9PiB2b2lkIHN0YXJ0UGxhbkNoZWNrb3V0KCdjYXJkJyl9IGRpc2FibGVkPXtjcmVhdGluZ0NoZWNrb3V0IHx8IHNlbGVjdGVkUGxhbiA9PT0gJ2ZyZWUnfT5cbiAgICAgICAgICAgICAgICB7Y3JlYXRpbmdDaGVja291dCA/ICdBYnJpbmRv4oCmJyA6ICdDYXJ0w6NvIChhc3NpbmF0dXJhKSd9XG4gICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvQ2FyZD5cblxuICAgICAgICA8Q2FyZD5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInAtNiBzcGFjZS15LTRcIj5cbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtOTAwXCI+U2VydmnDp29zPC9kaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTYwMFwiPkNvbnRyYXRlIHNlcnZpw6dvcyBhdnVsc29zIHBhcmEgY29uZmlndXJhw6fDo28gZSBzdXBvcnRlLjwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZ3JpZCBncmlkLWNvbHMtMSBnYXAtMyBzbTpncmlkLWNvbHMtMlwiPlxuICAgICAgICAgICAgICB7c2VydmljZXMubWFwKChzKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RlZFNlcnZpY2UgPT09IHMua2V5XG4gICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgICAgICAgICAga2V5PXtzLmtleX1cbiAgICAgICAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXG4gICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldFNlbGVjdGVkU2VydmljZShzLmtleSl9XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17W1xuICAgICAgICAgICAgICAgICAgICAgICd0ZXh0LWxlZnQgcm91bmRlZC14bCBib3JkZXIgYmctd2hpdGUgcC00IHRyYW5zaXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkID8gJ2JvcmRlci1zbGF0ZS05MDAgcmluZy0yIHJpbmctc2xhdGUtOTAwLzEwJyA6ICdib3JkZXItc2xhdGUtMjAwIGhvdmVyOmJnLXNsYXRlLTUwJyxcbiAgICAgICAgICAgICAgICAgICAgXS5qb2luKCcgJyl9XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1zdGFydCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTNcIj5cbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS05MDBcIj57cy50aXRsZX08L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTYwMFwiPntzLnByaWNlTGFiZWx9PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAge3NlbGVjdGVkID8gPEJhZGdlIHRvbmU9XCJzbGF0ZVwiPlNlbGVjaW9uYWRvPC9CYWRnZT4gOiBudWxsfVxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtdC0zIHNwYWNlLXktMVwiPlxuICAgICAgICAgICAgICAgICAgICAgIHtzLmJ1bGxldHMubWFwKChiKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17Yn0gY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTcwMFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAtIHtifVxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC13cmFwIGp1c3RpZnktZW5kIGdhcC0yXCI+XG4gICAgICAgICAgICAgIDxCdXR0b24gdmFyaWFudD1cInNlY29uZGFyeVwiIG9uQ2xpY2s9eygpID0+IHZvaWQgc3RhcnRTZXJ2aWNlQ2hlY2tvdXQoJ3BpeCcpfSBkaXNhYmxlZD17Y3JlYXRpbmdDaGVja291dCB8fCAhc2VsZWN0ZWRTZXJ2aWNlfT5cbiAgICAgICAgICAgICAgICB7Y3JlYXRpbmdDaGVja291dCA/ICdBYnJpbmRv4oCmJyA6ICdQYWdhciBjb20gUElYJ31cbiAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICAgIDxCdXR0b24gb25DbGljaz17KCkgPT4gdm9pZCBzdGFydFNlcnZpY2VDaGVja291dCgnY2FyZCcpfSBkaXNhYmxlZD17Y3JlYXRpbmdDaGVja291dCB8fCAhc2VsZWN0ZWRTZXJ2aWNlfT5cbiAgICAgICAgICAgICAgICB7Y3JlYXRpbmdDaGVja291dCA/ICdBYnJpbmRv4oCmJyA6ICdQYWdhciBjb20gY2FydMOjbyd9XG4gICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvQ2FyZD5cbiAgICAgIDwvZGl2PlxuICAgIDwvQXBwU2hlbGw+XG4gIClcbn1cbiJdLCJmaWxlIjoiQzovVXNlcnMvQWRtaW4vRGVza3RvcC9TTWFnZW5kYS9zbWFnZW5kYS9zcmMvdmlld3MvYXBwL1BhZ2FtZW50b1BhZ2UudHN4In0=
