import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Lock,
  User,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Ticket,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  KeyRound,
  MessageCircle,
  X,
  Send
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';

export default function CompanyPortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const currentAccount = useChatStore((state) => state.currentAccount);
  const defaultTenantId = tenantInfo?.id || currentAccount?.id || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  // Permite passar tenant via query param (?tenant=... ou ?empresa=...)
  const targetTenantId = searchParams.get('tenant') || defaultTenantId;
  const prefillUser = searchParams.get('user') || searchParams.get('usuario') || searchParams.get('email') || '';

  const [username, setUsername] = useState<string>(prefillUser);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para Recuperação de Senha (Esqueci Minha Senha)
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [forgotEmpresaName, setForgotEmpresaName] = useState<string>('');
  const [forgotEmpresaUser, setForgotEmpresaUser] = useState<string>('');

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setError('Por favor, informe seu e-mail, usuário ou CNPJ e a senha de acesso.');
      return;
    }

    setLoading(true);

    try {
      // 1. Busca as empresas cadastradas no tenant ativo (LocalStorage)
      const raw = localStorage.getItem(`voucher_companies_${targetTenantId}`) || localStorage.getItem('voucher_companies_global');
      let companies: any[] = [];
      if (raw) {
        try {
          companies = JSON.parse(raw);
        } catch (_) {}
      }

      // Se não encontrou por tenant específico, varre todas as chaves de empresas locais
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

      // 2. Consulta complementar no Supabase caso não encontre localmente
      try {
        const { data: sbList } = await supabase
          .from('voucher_empresas_parceiras')
          .select('*');
        if (Array.isArray(sbList) && sbList.length > 0) {
          const existingIds = new Set(companies.map(c => c.id));
          for (const sbc of sbList) {
            if (!existingIds.has(sbc.id)) {
              companies.push(sbc);
            }
          }
        }
      } catch (_) {}

      // 3. Fallback de Empresas Pré-Configuradas do Restaurante (garante acesso mesmo se o LocalStorage for novo na Vercel)
      if (companies.length === 0 || !companies.some(c => c.cnpj?.includes('24.474.477') || c.razao_social?.includes('TERRAS'))) {
        const defaultTerras = {
          id: 'emp-ecbz1mn',
          tenant_id: targetTenantId,
          razao_social: 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS',
          nome_fantasia: 'Terras Gonçalves Advogados',
          cnpj: '24.474.477/0001-77',
          contato_nome: 'Alex',
          contato_whatsapp: '11972976620',
          email_empresa: 'terrasgonsalves@xpointsolucoes.com.br',
          login_usuario: 'terrasgonsalves@xpointsolucoes.com.br',
          login_senha: '256679',
          saldo_global: 659.00,
          saldo_credito: 659.00,
          credito_fim: '2026-10-02T23:59:59Z',
          ativo: true
        };
        companies.push(defaultTerras);
      }

      // 4. Modo Administrador do SaaS / Restaurante (Super-Login)
      const isAdminLogin =
        (cleanUser === 'xpointsolucoes@gmail.com' || cleanUser === 'ronaldo.xpointsolucoes@gmail.com' || cleanUser === 'admin') &&
        (cleanPass === 'Xx@gh03360102' || cleanPass === 'Cc@xroxmaxi7' || cleanPass === '123456');

      let matchedCompany = null;

      if (isAdminLogin) {
        matchedCompany = companies[0] || {
          id: 'emp-admin-mode',
          tenant_id: targetTenantId,
          razao_social: 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS (Visão Admin)',
          nome_fantasia: 'Terras Gonçalves Advogados',
          cnpj: '24.474.477/0001-77',
          contato_nome: 'Administrador X-Point',
          contato_whatsapp: '11975960999',
          email_empresa: 'xpointsolucoes@gmail.com',
          login_usuario: 'admin',
          login_senha: cleanPass,
          saldo_global: 1000.00,
          saldo_credito: 1000.00,
          ativo: true
        };
      } else {
        // 5. Localiza a empresa pelas credenciais de login (E-mail, Usuário, CNPJ ou WhatsApp)
        const inputNumbersOnly = cleanUser.replace(/\D/g, '');
        const normalizedInput = cleanUser.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c').replace(/s(?=alves)/g, 'c');

        // Match Direto Prioritário para Terras Gonçalves
        if (cleanUser === 'terrasgonsalves@xpointsolucoes.com.br' || cleanUser === 'terrasgoncalves@xpointsolucoes.com.br' || (cleanUser.includes('terras') && cleanUser.includes('xpoint'))) {
          const passMatch = cleanPass === '256679' || cleanPass === '123456' || cleanPass === 'Xx@gh03360102' || cleanPass === 'Cc@xroxmaxi7';
          if (passMatch) {
            matchedCompany = companies.find(c => c.id === 'emp-ecbz1mn' || c.cnpj?.includes('24.474.477') || c.razao_social?.includes('TERRAS')) || {
              id: 'emp-ecbz1mn',
              tenant_id: targetTenantId,
              razao_social: 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS',
              nome_fantasia: 'Terras Gonçalves Advogados',
              cnpj: '24.474.477/0001-77',
              contato_nome: 'Alex',
              contato_whatsapp: '11972976620',
              email_empresa: 'terrasgonsalves@xpointsolucoes.com.br',
              login_usuario: 'terrasgonsalves@xpointsolucoes.com.br',
              login_senha: '256679',
              saldo_global: 659.00,
              saldo_credito: 659.00,
              credito_fim: '2026-10-02T23:59:59Z',
              ativo: true
            };
          }
        }

        if (!matchedCompany) {
          matchedCompany = companies.find((c: any) => {
            const compEmail = (c.email_empresa || c.email || c.email_corporativo || '').toLowerCase().trim();
            const compLogin = (c.login_usuario || '').toLowerCase().trim();
            const compCnpj = (c.cnpj || '').replace(/\D/g, '');
            const compWhatsapp = (c.contato_whatsapp || '').replace(/\D/g, '');
            const normalizedCompLogin = compLogin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c').replace(/s(?=alves)/g, 'c');
            const normalizedCompEmail = compEmail.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c').replace(/s(?=alves)/g, 'c');

            const isUserMatch =
              (compEmail && compEmail === cleanUser) ||
              (compLogin && compLogin === cleanUser) ||
              (normalizedCompEmail && normalizedCompEmail === normalizedInput) ||
              (normalizedCompLogin && normalizedCompLogin === normalizedInput) ||
              (compCnpj && inputNumbersOnly && compCnpj === inputNumbersOnly) ||
              (compWhatsapp && inputNumbersOnly && compWhatsapp === inputNumbersOnly);

            // Validação de Senha (aceita a senha cadastrada, padrão '123456', '256679' ou senha mestre)
            const compPass = String(c.login_senha || '123456').trim();
            const isPassMatch = compPass === cleanPass || cleanPass === '256679' || cleanPass === '123456' || cleanPass === 'Xx@gh03360102' || cleanPass === 'Cc@xroxmaxi7';

            return isUserMatch && isPassMatch;
          });
        }
      }

      if (!matchedCompany) {
        setError('Credenciais inválidas. Verifique seu e-mail/usuário e senha com o restaurante conveniado.');
        setLoading(false);
        return;
      }

      if (matchedCompany.ativo === false) {
        setError('O acesso desta empresa parceira encontra-se temporariamente suspenso.');
        setLoading(false);
        return;
      }

      // 6. Salva sessão corporativa
      const sessionPayload = {
        id: matchedCompany.id,
        tenant_id: matchedCompany.tenant_id || targetTenantId,
        razao_social: matchedCompany.razao_social,
        nome_fantasia: matchedCompany.nome_fantasia || matchedCompany.razao_social,
        cnpj: matchedCompany.cnpj,
        contato_nome: matchedCompany.contato_nome,
        contato_whatsapp: matchedCompany.contato_whatsapp,
        email_empresa: matchedCompany.email_empresa || matchedCompany.email || cleanUser,
        login_usuario: matchedCompany.login_usuario || cleanUser,
        logged_at: new Date().toISOString()
      };

      sessionStorage.setItem('active_company_session', JSON.stringify(sessionPayload));
      localStorage.setItem('active_company_session', JSON.stringify(sessionPayload));

      // Garante que a lista local tenha a empresa salva
      try {
        const localList = JSON.parse(localStorage.getItem(`voucher_companies_${targetTenantId}`) || '[]');
        if (!localList.some((c: any) => c.id === matchedCompany.id)) {
          localStorage.setItem(`voucher_companies_${targetTenantId}`, JSON.stringify([matchedCompany, ...localList]));
        }
      } catch (_) {}

      navigate('/voucher-empresa');
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login corporativo.');
    } finally {
      setLoading(false);
    }
  };

  // Redireciona para o WhatsApp do Restaurante Parceiro com texto formatado de recuperação de senha
  const handleRequestPasswordReset = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const userToRecover = (forgotEmpresaUser || username || '').trim();
    const nameToRecover = (forgotEmpresaName || '').trim();

    // Telefone oficial do restaurante emissor (Burguer Plus / FoodNext)
    const restaurantPhone = '5511947758860';
    const restaurantName = 'BURGUER PLUS';

    const message = `✨ *SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA B2B* ✨\n\n` +
      `Olá, equipe da *${restaurantName}*! 👋\n` +
      `Sou responsável pelo painel da empresa parceira de vouchers corporativos e preciso de auxílio para recuperar minha senha de acesso.\n\n` +
      `🏢 *Empresa Parceira:* ${nameToRecover || 'Empresa Conveniada'}\n` +
      `👤 *Usuário / CNPJ de Acesso:* ${userToRecover || 'Não especificado'}\n\n` +
      `_Poderiam me ajudar com a redefinição ou reenvio da nossa senha de acesso, por favor? Obrigado!_`;

    const encodedMsg = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${restaurantPhone}?text=${encodedMsg}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setShowForgotModal(false);
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
              E-mail Corporativo, Usuário ou CNPJ
            </label>
            <div className="relative">
              {username.includes('@') ? (
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 transition-colors" />
              ) : (
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors" />
              )}
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setForgotEmpresaUser(e.target.value);
                }}
                placeholder="Ex: contato@empresa.com.br, terrasgoncalves ou CNPJ"
                required
                className="w-full bg-black/30 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between pl-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                Senha de Acesso
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmpresaUser(username);
                  setShowForgotModal(true);
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
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
          <button
            type="button"
            onClick={() => {
              setForgotEmpresaUser(username);
              setShowForgotModal(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Falar com o Restaurante Parceiro (Burguer Plus)</span>
          </button>
        </div>

      </div>

      {/* ========================================================= */}
      {/* MODAL: RECUPERAÇÃO DE SENHA / SUPORTE WHATSAPP */}
      {/* ========================================================= */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 text-left relative">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Recuperação de Acesso</h3>
                  <p className="text-[11px] text-slate-400">Suporte direto com o emissor conveniado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explicação */}
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                <Building2 className="w-3.5 h-3.5" />
                <span>Restaurante Emissor: BURGUER PLUS</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Por motivos de segurança, a senha corporativa é redefinida diretamente pela equipe de administração da <strong>Burguer Plus</strong> via WhatsApp.
              </p>
            </div>

            {/* Formulário de Identificação da Empresa */}
            <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                  Nome / Razão Social da Sua Empresa
                </label>
                <input
                  type="text"
                  value={forgotEmpresaName}
                  onChange={(e) => setForgotEmpresaName(e.target.value)}
                  placeholder="Ex: Terras Gonçalves Sociedade de Advogados"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                  Usuário ou CNPJ Cadastrado
                </label>
                <input
                  type="text"
                  value={forgotEmpresaUser}
                  onChange={(e) => setForgotEmpresaUser(e.target.value)}
                  placeholder="Ex: terrasgoncalves ou 24.474.477/0001-77"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-medium"
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-2xl hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-[#0b141a]" />
                  <span>Solicitar Redefinição no WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 text-xs text-slate-400 hover:text-white font-bold transition-colors cursor-pointer text-center"
                >
                  Voltar para o Login
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
