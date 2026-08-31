import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Ticket,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function CompanyPortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const currentAccount = useChatStore((state) => state.currentAccount);
  const defaultTenantId = tenantInfo?.id || currentAccount?.id || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  // Permite passar tenant via query param (?tenant=... ou ?empresa=...)
  const targetTenantId = searchParams.get('tenant') || defaultTenantId;
  const prefillUser = searchParams.get('user') || searchParams.get('usuario') || '';

  const [username, setUsername] = useState<string>(prefillUser);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Se já estiver logado, redireciona para o dashboard corporativo
  useEffect(() => {
    try {
      const activeSession = sessionStorage.getItem('active_company_session') || localStorage.getItem('active_company_session');
      if (activeSession) {
        const parsed = JSON.parse(activeSession);
        if (parsed?.id && parsed?.tenant_id) {
          navigate('/voucher-empresa');
        }
      }
    } catch (_) {}
  }, [navigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setError('Por favor, preencha o usuário e a senha de acesso.');
      return;
    }

    setLoading(true);

    try {
      // 1. Busca as empresas cadastradas no tenant ativo
      const raw = localStorage.getItem(`voucher_companies_${targetTenantId}`) || localStorage.getItem('voucher_companies_global');
      let companies: any[] = [];
      if (raw) {
        try {
          companies = JSON.parse(raw);
        } catch (_) {}
      }

      // Se não encontrou por tenant específico, varre todas as chaves de empresas
      if (companies.length === 0) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('voucher_companies_')) {
            try {
              const list = JSON.parse(localStorage.getItem(key) || '[]');
              if (Array.isArray(list)) {
                companies.push(...list);
              }
            } catch (_) {}
          }
        }
      }

      // 2. Localiza a empresa pelas credenciais de login ou CNPJ/Email/Contato
      const matchedCompany = companies.find((c: any) => {
        const compLogin = (c.login_usuario || '').toLowerCase().trim();
        const compEmail = (c.email_empresa || c.email || '').toLowerCase().trim();
        const compCnpj = (c.cnpj || '').replace(/\D/g, '');
        const inputUser = cleanUser.replace(/\D/g, '') || cleanUser;

        const isUserMatch =
          compLogin === cleanUser ||
          compEmail === cleanUser ||
          (compCnpj && compCnpj === inputUser) ||
          (c.contato_whatsapp && c.contato_whatsapp.replace(/\D/g, '') === inputUser);

        // Senha da empresa (ou senha padrão '123456' se ainda não configurada)
        const compPass = c.login_senha || '123456';
        const isPassMatch = compPass === cleanPass;

        return isUserMatch && isPassMatch;
      });

      if (!matchedCompany) {
        setError('Credenciais inválidas. Verifique seu usuário e senha com o restaurante parceiro.');
        setLoading(false);
        return;
      }

      if (matchedCompany.ativo === false) {
        setError('O acesso desta empresa parceira encontra-se temporariamente suspenso.');
        setLoading(false);
        return;
      }

      // 3. Salva sessão corporativa
      const sessionPayload = {
        id: matchedCompany.id,
        tenant_id: matchedCompany.tenant_id || targetTenantId,
        razao_social: matchedCompany.razao_social,
        nome_fantasia: matchedCompany.nome_fantasia || matchedCompany.razao_social,
        cnpj: matchedCompany.cnpj,
        contato_nome: matchedCompany.contato_nome,
        contato_whatsapp: matchedCompany.contato_whatsapp,
        login_usuario: matchedCompany.login_usuario || cleanUser,
        logged_at: new Date().toISOString()
      };

      sessionStorage.setItem('active_company_session', JSON.stringify(sessionPayload));
      localStorage.setItem('active_company_session', JSON.stringify(sessionPayload));

      navigate('/voucher-empresa');
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login corporativo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0b141a] flex items-center justify-center p-4 relative overflow-hidden text-slate-100 font-sans select-none">
      {/* Luzes de Fundo & Glassmorphism Glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
        
        {/* Cabeçalho */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <Building2 className="w-8 h-8 text-[#0b141a]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-black uppercase tracking-wider mb-1 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Portal B2B Corporativo
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Acesso Empresa Parceira
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Gerencie seus créditos e emita vouchers digitais para seus colaboradores e convidados
            </p>
          </div>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-start gap-2.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulário de Login */}
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 pl-1 block">
              Usuário ou CNPJ
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: terrasgoncalves ou 24.474.477/0001-77"
                required
                className="w-full bg-black/30 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 pl-1 block">
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-black/30 border border-white/10 rounded-2xl pl-10 pr-10 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-2xl hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Autenticando Empresa...</span>
            ) : (
              <>
                <span>Acessar Painel Corporativo</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Rodapé Informativo */}
        <div className="pt-2 border-t border-white/5 text-center space-y-2">
          <p className="text-[11px] text-slate-500">
            Dúvidas ou precisa de recarga de créditos?
          </p>
          <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-400 font-bold">
            <Ticket className="w-3.5 h-3.5" />
            <span>Sistema Integrado de Vouchers Corporativos</span>
          </div>
        </div>

      </div>
    </div>
  );
}
