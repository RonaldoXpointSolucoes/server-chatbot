import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Key, LogIn, Loader2, HelpCircle } from 'lucide-react';
import { supabase } from '../services/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('ronaldo.xpointsolucoes@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setError(false);
    setErrorMessage('');

    try {
      // Usar a autenticação real do Supabase
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim()
      });

      if (signInError) {
        setError(true);
        setErrorMessage('Credenciais inválidas. Senha ou e-mail incorretos.');
        setTimeout(() => setError(false), 3000);
      } else {
        // Acesso concedido
        sessionStorage.setItem('admin_token', 'true');
        navigate('/admin');
      }
    } catch (err) {
      console.error(err);
      setError(true);
      setErrorMessage('Erro de conexão com o servidor.');
      setTimeout(() => setError(false), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-gradient-to-br from-[#111b21] to-[#202c33] font-sans">
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#00a884] rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="relative w-full max-w-md p-8 bg-white/10 dark:bg-black/30 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-6 fade-in duration-700">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#00a884]/20 rounded-2xl flex items-center justify-center mb-4 border border-[#00a884]/30">
             <ShieldAlert className="text-[#00a884] w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">SaaS Auth Center</h1>
          <p className="text-[#aebac1] text-sm mt-1 font-medium">Acesso restrito ao Administrador Global</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#aebac1] uppercase tracking-wider ml-1">E-mail Administrativo</label>
            <div className="relative">
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#202c33]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-[#54656f] outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                placeholder="master@dominio.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center ml-1">
              <label className="text-xs font-semibold text-[#aebac1] uppercase tracking-wider">Senha de Segurança</label>
              <button 
                type="button" 
                onClick={() => setShowHint(!showHint)}
                className="text-xs flex items-center gap-1 text-[#00a884] hover:text-[#00bfa5] transition-colors"
                title="Ver dica de senha"
              >
                <HelpCircle size={14} /> Dica
              </button>
            </div>
            
            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#202c33]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-[#54656f] outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                placeholder="••••••••"
                required
              />
              <Key className="absolute right-3 top-3.5 text-[#54656f] w-5 h-5" />
            </div>

            {showHint && (
              <div className="mt-2 p-3 bg-[#00a884]/10 border border-[#00a884]/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                <p className="text-sm text-[#00a884] font-medium">
                  <span className="font-bold">Dica:</span> Sua senha original é a sua data de nascimento (DDMMAAAA) contendo 8 dígitos numéricos.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-400 text-sm font-medium text-center animate-in shake">
              {errorMessage || 'Credenciais inválidas. Acesso negado.'}
            </p>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-gradient-to-r from-[#00a884] to-[#018b6e] hover:from-[#00bfa5] hover:to-[#00a884] disabled:from-[#00a884]/50 disabled:to-[#018b6e]/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-[#00a884]/30 transition-all hover:-translate-y-0.5 hover:shadow-[#00a884]/40 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar Painel Global <LogIn size={18} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
