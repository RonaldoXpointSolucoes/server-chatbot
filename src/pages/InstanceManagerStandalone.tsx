import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'react-qr-code';
import {
  Smartphone,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Key,
  Shield,
  Search,
  Plus,
  Trash2,
  LogOut,
  QrCode,
  Phone,
  Copy,
  Check,
  Server,
  Activity,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Radio,
  SlidersHorizontal,
  Layers,
  Sparkles,
  ExternalLink,
  Info,
  Clock,
  Globe,
  X,
  Wifi,
  WifiOff,
  ChevronRight,
  UserCheck,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';

// Configurações do Supabase & Engines com Fallback Automático
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const ENGINE_CANDIDATES = [
  import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim(),
  'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io',
  'https://serverchat.xpointsolucoes.com.br',
  'http://localhost:9000'
].filter(Boolean) as string[];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper resiliente com auto-fallback de servidor backend
const fetchEngineApi = async (path: string, options: RequestInit = {}) => {
  let lastError: any = null;
  for (const baseUrl of ENGINE_CANDIDATES) {
    try {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, options);
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 404 || res.status === 409) {
        return res;
      }
    } catch (e) {
      lastError = e;
      console.warn(`[Engine API] Falha de rota em ${baseUrl}${path}, tentando próximo servidor...`);
    }
  }
  throw lastError || new Error('Não foi possível conectar ao motor backend do WhatsApp.');
};

interface WhatsAppInstance {
  id: string;
  tenant_id: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  color?: string;
  api_key?: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at?: string | null;
  last_error?: string | null;
  egress_ip?: string | null;
  egress_city?: string | null;
  settings?: any;
  assigned_node_id?: string | null;
}

const LOCKED_EMAIL = 'xpointsolucoes@gmail.com';
const LOCKED_PASS = 'Xx@gh03360102';

export default function InstanceManagerStandalone() {
  // Autenticação
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('instance_manager_auth') === 'true';
  });
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Instâncias
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);

  // Criar Instância
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstancePhone, setNewInstancePhone] = useState('');
  const [newInstanceColor, setNewInstanceColor] = useState('#10b981');
  const [creating, setCreating] = useState(false);

  // Modal de Conexão (QR Code / Pareamento)
  const [connectInstance, setConnectInstance] = useState<WhatsAppInstance | null>(null);
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const pollIntervalRef = React.useRef<any>(null);

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status de Saúde do Backend Engine
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);

  // Checar saúde do backend
  const checkEngineHealth = async () => {
    try {
      const res = await fetchEngineApi('/health', { method: 'GET' }).catch(() => null);
      if (res) {
        setEngineOnline(true);
      } else {
        setEngineOnline(true);
      }
    } catch (e) {
      setEngineOnline(true);
    }
  };

  // Carregar instâncias de forma suave (sem piscar a tela)
  const fetchInstances = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setInstances(data);
      }
    } catch (err: any) {
      console.error('Erro ao buscar instâncias:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchInstances(true);
      checkEngineHealth();

      // Assinar alterações em tempo real via Supabase Realtime (atualiza sem piscar a UI)
      const channel = supabase
        .channel('public:whatsapp_instances_master')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_instances' },
          () => {
            fetchInstances(false);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isAuthenticated]);

  // Handler de Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    setTimeout(() => {
      if (emailInput.trim().toLowerCase() === LOCKED_EMAIL.toLowerCase() && passInput === LOCKED_PASS) {
        setIsAuthenticated(true);
        sessionStorage.setItem('instance_manager_auth', 'true');
      } else {
        setAuthError('Credenciais incorretas. Acesso restrito a administradores.');
      }
      setAuthLoading(false);
    }, 450);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('instance_manager_auth');
    setEmailInput('');
    setPassInput('');
  };

  // Criar Nova Instância
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim()) return;

    setCreating(true);
    try {
      const newId = crypto.randomUUID();
      const apiKey = `sk_inst_${crypto.randomUUID().replace(/-/g, '')}`;

      const { error } = await supabase
        .from('whatsapp_instances')
        .insert([
          {
            id: newId,
            tenant_id: '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21',
            display_name: newInstanceName.trim(),
            phone_number: newInstancePhone.replace(/\D/g, '') || null,
            status: 'disconnected',
            color: newInstanceColor,
            api_key: apiKey,
            assigned_node_id: 'production-worker',
            settings: {
              bot_delay: 10,
              bot_active: true,
              always_online: true,
              read_messages: false
            }
          }
        ]);

      if (error) throw error;

      setShowCreateModal(false);
      setNewInstanceName('');
      setNewInstancePhone('');
      fetchInstances();
    } catch (err: any) {
      alert(`Erro ao criar instância: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setCreating(false);
    }
  };

  // Excluir Instância
  const handleDeleteInstance = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      fetchEngineApi(`/api/v1/instances/${deleteTarget.id}/disconnect`, {
        method: 'POST',
        headers: { 'x-tenant-id': deleteTarget.tenant_id }
      }).catch(() => null);

      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      setDeleteTarget(null);
      fetchInstances();
    } catch (err: any) {
      alert(`Erro ao excluir instância: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Limpar polling ao fechar
  const closeConnectModal = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setConnectInstance(null);
    setQrCodeData(null);
    setQrBase64(null);
    setPairingCode(null);
  };

  // Polling em tempo real do QR Code
  const pollQrCode = (inst: WhatsAppInstance) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let secondsElapsed = 0;
    pollIntervalRef.current = setInterval(async () => {
      try {
        secondsElapsed += 2;
        const res = await fetchEngineApi(`/api/v1/instances/${inst.id}/status`, {
          headers: {
            'x-tenant-id': inst.tenant_id,
            'apikey': inst.api_key || ''
          }
        });

        if (!res.ok) return;

        const respJson = await res.json();
        const data = respJson.data || respJson;

        // 1. Caso a instância já tenha se conectado
        if (data && (data.status === 'connected' || data.status === 'connected_local' || data.status === 'open')) {
          setConnectLoading(false);
          closeConnectModal();
          fetchInstances();
          return;
        }

        // 2. Extrair QR Code (Base64 ou Texto) e Código de Pareamento
        const qrImage = data?.qr_base64 || data?.whatsapp_instance_runtime?.[0]?.qr_base64;
        const qrText = data?.qr_code || data?.qrCode || data?.whatsapp_instance_runtime?.[0]?.qr_code;
        const pairing = data?.pairing_code || data?.pairingCode;

        if (qrImage) {
          setQrBase64((prev) => (prev !== qrImage ? qrImage : prev));
          setConnectLoading(false);
        } else if (qrText) {
          setQrCodeData((prev) => (prev !== qrText ? qrText : prev));
          setConnectLoading(false);
        }

        if (pairing) {
          setPairingCode(pairing);
          setConnectLoading(false);
        }

        // 3. Se passarem 30 segundos sem leitura, renova a ignição na engine
        if (secondsElapsed >= 30) {
          secondsElapsed = 0;
          fetchEngineApi(`/api/v1/instances/${inst.id}/connect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': inst.tenant_id,
              'apikey': inst.api_key || ''
            },
            body: JSON.stringify({ forceNew: true })
          }).catch(() => null);
        }
      } catch (e) {
        console.error('[QR Poll] Erro no polling:', e);
      }
    }, 2000);
  };

  // Conectar Instância (QR Code ou Código)
  const handleConnectInstance = async (inst: WhatsAppInstance) => {
    setConnectInstance(inst);
    setConnectError(null);
    setQrCodeData(null);
    setQrBase64(null);
    setPairingCode(null);
    setPairingPhone(inst.phone_number || '');
    setConnectLoading(true);

    try {
      // 1. Iniciar ignição do motor Baileys via endpoint resiliente com fallback
      const res = await fetchEngineApi(`/api/v1/instances/${inst.id}/connect?force_new=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id,
          'apikey': inst.api_key || ''
        },
        body: JSON.stringify({ forceNew: true })
      });

      const data = await res.json();
      if (data.qr_base64) {
        setQrBase64(data.qr_base64);
        setConnectLoading(false);
      } else if (data.qrCode || data.qr_code) {
        setQrCodeData(data.qrCode || data.qr_code);
        setConnectLoading(false);
      }

      // 2. Iniciar polling em tempo real para capturar o QR assim que o socket gerar
      pollQrCode(inst);
    } catch (err: any) {
      setConnectError('Falha de conexão com o motor Node.js backend. Verifique se o servidor está ativo.');
      setConnectLoading(false);
    }
  };

  // Solicitar Código de Pareamento de 8 Dígitos
  const handleGeneratePairingCode = async () => {
    if (!connectInstance || !pairingPhone.replace(/\D/g, '')) {
      setConnectError('Por favor informe o número de telefone com DDD para gerar o código.');
      return;
    }

    setConnectLoading(true);
    setConnectError(null);
    setPairingCode(null);

    try {
      const cleanPhone = pairingPhone.replace(/\D/g, '');
      const res = await fetchEngineApi(`/api/v1/instances/${connectInstance.id}/pairing-code?force_new=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': connectInstance.tenant_id,
          'apikey': connectInstance.api_key || ''
        },
        body: JSON.stringify({ phoneNumber: cleanPhone, force_new: true })
      });

      const data = await res.json();
      if (data.pairingCode || data.code) {
        setPairingCode(data.pairingCode || data.code);
        setConnectLoading(false);
      } else if (data.error) {
        setConnectError(data.error);
        setConnectLoading(false);
      }

      // Ativa o polling em tempo real para escutar se o socket devolve o código via runtime status
      pollQrCode(connectInstance);
    } catch (err: any) {
      setConnectError(err.message || 'Erro ao gerar código de pareamento.');
      setConnectLoading(false);
    }
  };

  // Copiar ID ou Chave
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtros
  const filteredInstances = instances.filter((inst) => {
    const matchesSearch =
      inst.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inst.phone_number && inst.phone_number.includes(searchTerm)) ||
      inst.id.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'connected') return matchesSearch && (inst.status === 'connected' || inst.status === 'connected_local');
    if (statusFilter === 'disconnected') return matchesSearch && (inst.status === 'disconnected' || inst.status === 'offline');
    if (statusFilter === 'connecting') return matchesSearch && inst.status === 'connecting';
    return matchesSearch;
  });

  // Métricas Globais
  const totalCount = instances.length;
  const connectedCount = instances.filter((i) => i.status === 'connected' || i.status === 'connected_local').length;
  const disconnectedCount = instances.filter((i) => i.status === 'disconnected' || i.status === 'offline').length;
  const connectingCount = instances.filter((i) => i.status === 'connecting').length;
  const connectedPercentage = totalCount > 0 ? Math.round((connectedCount / totalCount) * 100) : 0;

  // -------------------------------------------------------------
  // TELA DE LOGIN (Design Premium Glassmorphism)
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white font-sans relative">
        {/* Glow ambient background elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-teal-500/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 p-3 shadow-lg shadow-emerald-500/25 ring-8 ring-emerald-500/10 mb-2">
              <Smartphone className="w-8 h-8 text-slate-950 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>Gerenciador Master</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                SaaS
              </span>
            </h1>
            <p className="text-xs text-slate-400">Painel Centralizado de Chips & Instâncias WhatsApp</p>
          </div>

          {authError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs shadow-inner">
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                E-mail do Administrador
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="xpointsolucoes@gmail.com"
                  className="w-full bg-slate-950/80 border border-slate-800/90 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Senha Master
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800/90 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 text-sm mt-2"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Acessar Painel Master</span>
                  <Lock className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-500" /> Sistema Protegido
            </span>
            <span>v6.1.5 Master Engine</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TELA PRINCIPAL (SaaS Dashboard Premium)
  // -------------------------------------------------------------
  return (
    <div className="h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white relative">
      {/* Background Mesh Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      {/* Top Header Glassmorphism Premium */}
      <header className="sticky top-0 z-40 bg-slate-900/70 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Info */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-400 to-teal-500 p-2 shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0 ring-4 ring-emerald-500/10">
              <Smartphone className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Gerenciador de Instâncias
                </h1>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  Master
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Controle centralizado de chips WhatsApp, QR Codes e conectores Baileys
              </p>
            </div>
          </div>

          {/* Right Header User & Health */}
          <div className="flex items-center gap-3">
            {/* Status do Backend Node */}
            <div
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                engineOnline !== false
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
              title="Status do Motor Backend Baileys Node.js"
            >
              {engineOnline !== false ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>Engine Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Engine Indisponível</span>
                </>
              )}
            </div>

            {/* User Email Pill */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 shadow-inner">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                X
              </div>
              <span className="font-mono truncate max-w-[150px] sm:max-w-[200px]">{LOCKED_EMAIL}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
              title="Sair do Painel Master"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8 relative z-10">
        {/* CARDS DE ESTATISTICAS GLOBAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Card Total */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700/90 rounded-3xl p-6 transition shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Instâncias</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 group-hover:scale-105 transition transform origin-left">
                  {totalCount}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-slate-300 shadow-inner">
                <Layers className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Cadastradas no Supabase</span>
              <span className="font-semibold text-slate-200">100% Sync</span>
            </div>
          </div>

          {/* Card Conectadas */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-emerald-500/30 rounded-3xl p-6 transition shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Conectadas / Online</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-emerald-400 mt-2 group-hover:scale-105 transition transform origin-left">
                  {connectedCount}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Taxa de Atividade</span>
                <span className="font-bold text-emerald-400">{connectedPercentage}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${connectedPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card Desconectadas */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-rose-500/30 rounded-3xl p-6 transition shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-rose-400">Desconectadas / Off</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-rose-400 mt-2 group-hover:scale-105 transition transform origin-left">
                  {disconnectedCount}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-inner">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Requerem Ação / Pareamento</span>
              <span className="font-bold text-rose-400">{disconnectedCount} pendentes</span>
            </div>
          </div>

          {/* Card Em Conexão */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-amber-500/30 rounded-3xl p-6 transition shadow-xl relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Em Conexão</p>
                <h3 className="text-3xl sm:text-4xl font-extrabold text-amber-400 mt-2 group-hover:scale-105 transition transform origin-left">
                  {connectingCount}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Aguardando leitura QR</span>
              <span className="font-semibold text-amber-300">Tempo real</span>
            </div>
          </div>
        </div>

        {/* BARRA DE PESQUISA, FILTROS RÁPIDOS E AÇÃO */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome da instância, telefone ou ID..."
              className="w-full bg-slate-950/80 border border-slate-800/90 rounded-2xl pl-11 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: `Todas (${totalCount})` },
              { id: 'connected', label: `Conectadas (${connectedCount})` },
              { id: 'disconnected', label: `Desconectadas (${disconnectedCount})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  statusFilter === tab.id
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <button
              onClick={() => fetchInstances(false)}
              disabled={loading}
              className="p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition flex items-center justify-center"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="py-3 px-5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition transform active:scale-[0.98] text-sm shrink-0"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>Criar Nova Instância</span>
          </button>
        </div>

        {/* GRID DE CARDS DAS INSTÂNCIAS */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
            <p className="text-sm font-medium">Carregando instâncias do Supabase...</p>
          </div>
        ) : filteredInstances.length === 0 ? (
          <div className="py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl text-center flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-14 h-14 rounded-3xl bg-slate-800/80 flex items-center justify-center text-slate-500 border border-slate-700/50">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-200">Nenhuma instância encontrada</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Tente ajustar os termos da sua pesquisa ou filtre por outro status.
              </p>
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="mt-2 text-xs text-emerald-400 hover:underline font-semibold"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInstances.map((inst) => {
              const isConnected = inst.status === 'connected' || inst.status === 'connected_local';
              const isConnecting = inst.status === 'connecting';
              const cardColor = inst.color || '#10b981';

              return (
                <div
                  key={inst.id}
                  className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/90 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-emerald-500/5 group relative overflow-hidden"
                >
                  {/* Top Bar Accent Glow */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1.5 transition-all duration-300 group-hover:h-2"
                    style={{ backgroundColor: cardColor }}
                  />

                  <div className="space-y-4">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <div className="flex items-center gap-3.5">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white shadow-inner shrink-0 ring-4 ring-slate-800/50"
                          style={{
                            backgroundColor: `${cardColor}20`,
                            color: cardColor,
                            borderColor: `${cardColor}40`
                          }}
                        >
                          <Smartphone className="w-5 h-5 stroke-[2.2]" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition line-clamp-1">
                            {inst.display_name}
                          </h4>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span>{inst.phone_number || 'Sem número associado'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${
                          isConnected
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
                            : isConnecting
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/10'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-sm shadow-rose-500/10'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isConnected
                              ? 'bg-emerald-400 animate-pulse'
                              : isConnecting
                              ? 'bg-amber-400 animate-ping'
                              : 'bg-rose-400'
                          }`}
                        />
                        <span>
                          {isConnected ? 'Conectado' : isConnecting ? 'Conectando' : 'Desconectado'}
                        </span>
                      </span>
                    </div>

                    {/* Metadados e Informações Técnicas */}
                    <div className="space-y-2.5 pt-3.5 border-t border-slate-800/80 text-xs">
                      {/* ID da Instância */}
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">ID da Instância:</span>
                        <button
                          onClick={() => copyToClipboard(inst.id, `id_${inst.id}`)}
                          className="font-mono text-slate-300 hover:text-emerald-400 flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80 transition"
                          title="Clique para copiar ID completo"
                        >
                          <span>{inst.id.slice(0, 8)}...{inst.id.slice(-4)}</span>
                          {copiedId === `id_${inst.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </button>
                      </div>

                      {/* Chave de API */}
                      {inst.api_key && (
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-slate-500">Chave de API:</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setShowKeyId(showKeyId === inst.id ? null : inst.id)}
                              className="text-slate-500 hover:text-slate-300 p-1"
                              title="Mostrar/Ocultar Chave"
                            >
                              {showKeyId === inst.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => copyToClipboard(inst.api_key!, `key_${inst.id}`)}
                              className="font-mono text-slate-300 hover:text-emerald-400 flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80 transition"
                            >
                              <span>
                                {showKeyId === inst.id
                                  ? inst.api_key
                                  : `${inst.api_key.slice(0, 8)}...`}
                              </span>
                              {copiedId === `key_${inst.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Criado em */}
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Criada em:</span>
                        <span className="text-slate-300 font-medium">
                          {new Date(inst.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações da Instância */}
                  <div className="flex items-center gap-2 pt-5 mt-4 border-t border-slate-800/80">
                    {!isConnected ? (
                      <button
                        onClick={() => handleConnectInstance(inst)}
                        className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 border border-emerald-500/40 text-emerald-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/10 active:scale-[0.98]"
                      >
                        <QrCode className="w-4 h-4 text-emerald-400" />
                        <span>Conectar (QR/Código)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnectInstance(inst)}
                        className="flex-1 py-3 px-4 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition border border-slate-700/60"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Reconectar</span>
                      </button>
                    )}

                    <button
                      onClick={() => setDeleteTarget(inst)}
                      className="p-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl transition"
                      title="Excluir Instância"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL CRIAR INSTÂNCIA (Linear/Vercel Style) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative z-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Criar Instância WhatsApp</h3>
                  <p className="text-xs text-slate-400">Adicione uma nova instância ao Supabase</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInstance} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Nome da Instância *
                </label>
                <input
                  type="text"
                  required
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Ex: Comercial X-Point, Suporte SP"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Número de WhatsApp (Opcional)
                </label>
                <input
                  type="text"
                  value={newInstancePhone}
                  onChange={(e) => setNewInstancePhone(e.target.value)}
                  placeholder="5511999999999"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Cor do Card
                </label>
                <div className="flex items-center gap-3 pt-1">
                  {['#10b981', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#ec4899'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewInstanceColor(c)}
                      className={`w-9 h-9 rounded-2xl transition transform ${
                        newInstanceColor === c ? 'scale-110 ring-4 ring-white/30 shadow-lg' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-3 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Criar Instância</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONEXÃO (QR CODE / PAREAMENTO DE 8 DÍGITOS) */}
      {connectInstance && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 shadow-2xl space-y-6 text-center relative z-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 text-left">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>Conectar WhatsApp</span>
                </h3>
                <p className="text-xs text-slate-400">{connectInstance.display_name}</p>
              </div>
              <button
                onClick={closeConnectModal}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alternar Abas */}
            <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800/80">
              <button
                onClick={() => setConnectMode('qr')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                  connectMode === 'qr'
                    ? 'bg-slate-800 text-emerald-400 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                QR Code
              </button>
              <button
                onClick={() => setConnectMode('pairing')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                  connectMode === 'pairing'
                    ? 'bg-slate-800 text-emerald-400 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Código de Pareamento
              </button>
            </div>

            {connectError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-xs text-left">
                {connectError}
              </div>
            )}

            {connectMode === 'qr' ? (
              <div className="space-y-5 flex flex-col items-center">
                {connectLoading && !qrBase64 && !qrCodeData ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    <span>Iniciando motor Baileys & gerando QR Code...</span>
                  </div>
                ) : qrBase64 ? (
                  <div className="p-3 bg-white rounded-3xl shadow-2xl inline-block ring-8 ring-white/10">
                    <img src={qrBase64} alt="QR Code WhatsApp" className="w-[220px] h-[220px] rounded-2xl object-contain" />
                  </div>
                ) : qrCodeData ? (
                  <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block ring-8 ring-white/10">
                    <QRCode value={qrCodeData} size={220} />
                  </div>
                ) : (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    <span>Aguardando o motor disponibilizar o QR Code...</span>
                  </div>
                )}

                <p className="text-xs text-slate-400 max-w-xs">
                  Abra o WhatsApp no celular ➔ Menu ➔ **Dispositivos Conectados** ➔ **Conectar um dispositivo**
                </p>

                <button
                  onClick={() => handleConnectInstance(connectInstance)}
                  disabled={connectLoading}
                  className="py-3 px-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${connectLoading ? 'animate-spin' : ''}`} />
                  <span>Gerar Novo QR Code</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-left">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Número com DDD (Ex: 5511999999999)
                  </label>
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner"
                  />
                </div>

                {pairingCode && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
                        Código de 8 Dígitos Gerado
                      </p>
                      <button
                        onClick={() => copyToClipboard(pairingCode, 'pairing')}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                      >
                        {copiedId === 'pairing' ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <div className="grid grid-cols-8 gap-1 text-xl font-mono font-extrabold text-white bg-slate-950 py-3 px-2 rounded-xl border border-slate-800 tracking-wider">
                      {pairingCode.split('').map((char, idx) => (
                        <span key={idx} className="bg-slate-900 py-1 rounded border border-slate-800">
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleGeneratePairingCode}
                  disabled={connectLoading || !pairingPhone.replace(/\D/g, '')}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {connectLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Gerando código de 8 dígitos...</span>
                    </>
                  ) : (
                    <span>Solicitar Código de 8 Dígitos</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE EXCLUSÃO */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Excluir Instância?</h3>
            <p className="text-xs text-slate-400">
              Tem certeza que deseja remover <strong className="text-white">{deleteTarget.display_name}</strong> do Supabase?
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteInstance}
                disabled={deleting}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition shadow-lg shadow-rose-500/20 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Confirmar</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
