import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Lock,
  User,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Store,
  CheckCircle2,
  Ticket,
  Sparkles,
  ChevronLeft
} from 'lucide-react';
import { voucherService } from '../../services/voucherService';

interface StoreChoice {
  empresa_id: string;
  tenant_id: string;
  razao_social: string;
  nome_fantasia?: string;
  store_name: string;
}

export default function CompanyPortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantParam = searchParams.get('empresa') || searchParams.get('tenant') || null;
  const userParam = searchParams.get('u') || '';

  const [loginUsuario, setLoginUsuario] = useState(userParam);
  const [loginSenha, setLoginSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeChoices, setStoreChoices] = useState<StoreChoice[] | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(tenantParam);

  useEffect(() => {
    const existingToken = localStorage.getItem('voucher_portal_token');
    const existingSession = localStorage.getItem('voucher_empresa_session');
    if (existingToken && existingSession) {
      navigate('/voucher-empresa', { replace: true });
    }
  }, [navigate]);

  const performLogin = async (overrideTenantId?: string | null) => {
    setError(null);
    if (!loginUsuario.trim() || !loginSenha.trim()) {
      setError('Por favor, informe usuário (e-mail ou CNPJ) e senha.');
      return;
    }

    setLoading(true);
    try {
      const targetTenant = overrideTenantId !== undefined ? overrideTenantId : selectedTenantId;
      const res = await voucherService.portalLogin(loginUsuario.trim(), loginSenha, targetTenant);

      if (!res.success && res.status === 'MULTIPLE_STORES' && Array.isArray(res.options)) {
        setStoreChoices(res.options);
        setLoading(false);
        return;
      }

      if (!res.success || !res.portal_token || !res.empresa) {
        setError(res.error || 'Usuário ou senha incorretos, ou empresa parceira suspensa.');
        setLoading(false);
        return;
      }

      localStorage.setItem('voucher_portal_token', res.portal_token);
      localStorage.setItem('voucher_empresa_session', JSON.stringify(res.empresa));
      if (res.restaurante) {
        localStorage.setItem('voucher_restaurante_info', JSON.stringify(res.restaurante));
      }

      navigate('/voucher-empresa', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao autenticar no portal.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin();
  };

  const handleSelectStore = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setStoreChoices(null);
    performLogin(tenantId);
  };

  return (
    <div className="min-h-screen w-full bg-[#070b0e] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient Glassmorphism Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-96 h-96 rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute -bottom-40 -right-32 w-96 h-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 shadow-lg shadow-emerald-950/50 mb-4">
            <Ticket className="w-7 h-7 text-emerald-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3 h-3" /> Portal Corporativo B2B
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Acesso Empresa Parceira
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Gerencie colaboradores, compre créditos com desconto e emita vouchers com envio direto no WhatsApp.
          </p>
        </div>

        {/* Main Glass Card */}
        <div className="rounded-3xl bg-slate-900/75 backdrop-blur-xl border border-slate-800/80 shadow-2xl p-6 sm:p-8">
          {storeChoices ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5">
                <Store className="w-5 h-5 shrink-0" />
                <span>Sua conta possui convênio com mais de um estabelecimento. Escolha onde deseja acessar:</span>
              </div>

              <div className="space-y-2.5">
                {storeChoices.map(choice => (
                  <button
                    key={`${choice.tenant_id}_${choice.empresa_id}`}
                    type="button"
                    onClick={() => handleSelectStore(choice.tenant_id)}
                    className="w-full min-h-[56px] p-4 rounded-2xl bg-slate-800/70 hover:bg-emerald-500/15 border border-slate-700 hover:border-emerald-500/50 flex items-center justify-between gap-3 text-left transition-all"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate flex items-center gap-2">
                        <Store className="w-4 h-4 text-emerald-400 shrink-0" />
                        {choice.store_name}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {choice.nome_fantasia || choice.razao_social}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStoreChoices(null)}
                className="w-full min-h-[48px] rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Usuário, E-mail Corporativo ou CNPJ
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={loginUsuario}
                    onChange={e => setLoginUsuario(e.target.value)}
                    placeholder="ex: rh@suaempresa.com.br"
                    autoComplete="username"
                    className="w-full min-h-[48px] pl-10 pr-4 rounded-2xl bg-slate-950/70 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Senha de Acesso
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginSenha}
                    onChange={e => setLoginSenha(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full min-h-[48px] pl-10 pr-12 rounded-2xl bg-slate-950/70 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[50px] mt-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Autenticando sessão segura...
                  </>
                ) : (
                  <>
                    Entrar no Portal Corporativo <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Security Badges */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 gap-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl px-3 py-2 border border-slate-800/60">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Sessão Criptografada</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl px-3 py-2 border border-slate-800/60">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Saldo Auditado</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-5 flex items-center justify-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          Não lembra sua senha? Solicite uma nova credencial ao estabelecimento conveniado.
        </p>
      </div>
    </div>
  );
}
