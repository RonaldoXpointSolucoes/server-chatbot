import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import ThemeToggle from '../components/ThemeToggle';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

export default function ClientLogin() {
  const [email, setEmail] = useState('ronaldo.xpointsolucoes@gmail.com');
  const [password, setPassword] = useState('Xx@gh03360102');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      // Procura a empresa pelo nome (case-insensitive) via ilike
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, status, evolution_api_instance')
        .eq('email', email.trim().toLowerCase())
        .eq('password', password)
        .single();

      if (error || !data) {
        setErrorMsg('E-mail ou senha inválidos.');
        setIsLoading(false);
        return;
      }

      if (data.status === 'suspended') {
        setErrorMsg('Acesso bloqueado. Contate o administrador.');
        setIsLoading(false);
        return;
      }

      sessionStorage.setItem('current_tenant_id', data.id);
      sessionStorage.setItem('current_tenant_name', data.name);
      navigate('/chat');
    } catch (err) {
      setErrorMsg('Erro de conexão com o banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#f0f2f5] dark:bg-[#111b21] font-sans relative">
      <div className="absolute top-6 right-6">
         <ThemeToggle />
      </div>
      <div className="w-full max-w-sm p-8 bg-white dark:bg-[#202c33] rounded-3xl shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 text-blue-500">
             <Building2 size={32} />
          </div>
          <h1 className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef]">Workspace Login</h1>
          <p className="text-[#54656f] text-sm mt-1 text-center font-medium">Acesse a central de mensageria da sua empresa.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">E-mail Corporativo</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
              placeholder="exemplo@suaempresa.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">Senha de Acesso</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar Chat <ArrowRight size={18} /></>}
          </button>
          
          {errorMsg && (
            <div className="flex items-center gap-2 mt-4 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg animate-in fade-in">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
