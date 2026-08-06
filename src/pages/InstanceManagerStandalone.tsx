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
  Globe
} from 'lucide-react';

// Configurações do Supabase & Engine
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';
const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

  // Criar Instância
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstancePhone, setNewInstancePhone] = useState('');
  const [newInstanceColor, setNewInstanceColor] = useState('#3b82f6');
  const [creating, setCreating] = useState(false);

  // Modal de Conexão (QR Code / Pareamento)
  const [connectInstance, setConnectInstance] = useState<WhatsAppInstance | null>(null);
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carregar instâncias
  const fetchInstances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar instâncias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchInstances();

      // Assinar alterações em tempo real via Supabase Realtime
      const channel = supabase
        .channel('public:whatsapp_instances')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_instances' },
          () => {
            fetchInstances();
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
        setAuthError('E-mail ou senha incorretos. Acesso restrito.');
      }
      setAuthLoading(false);
    }, 400);
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

      const { data, error } = await supabase
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
        ])
        .select()
        .single();

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
      // 1. Tentar desconectar do backend
      fetch(`${ENGINE_URL}/api/v1/instances/${deleteTarget.id}/disconnect`, {
        method: 'POST',
        headers: { 'x-tenant-id': deleteTarget.tenant_id }
      }).catch(() => null);

      // 2. Apagar do Supabase
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

  // Conectar Instância (QR Code ou Código)
  const handleConnectInstance = async (inst: WhatsAppInstance) => {
    setConnectInstance(inst);
    setConnectError(null);
    setQrCodeData(null);
    setPairingCode(null);
    setPairingPhone(inst.phone_number || '');
    setConnectLoading(true);

    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/instances/${inst.id}/connect?force_new=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id
        },
        body: JSON.stringify({ forceNew: true })
      });

      const data = await res.json();
      if (data.qrCode) {
        setQrCodeData(data.qrCode);
      }
    } catch (err: any) {
      setConnectError('Erro ao iniciar ignição do motor. Verifique se o servidor backend está online.');
    } finally {
      setConnectLoading(false);
    }
  };

  // Solicitar Código de Pareamento
  const handleGeneratePairingCode = async () => {
    if (!connectInstance || !pairingPhone.replace(/\D/g, '')) return;

    setConnectLoading(true);
    setConnectError(null);
    try {
      const cleanPhone = pairingPhone.replace(/\D/g, '');
      const res = await fetch(`${ENGINE_URL}/api/v1/instances/${connectInstance.id}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': connectInstance.tenant_id
        },
        body: JSON.stringify({ phoneNumber: cleanPhone })
      });

      const data = await res.json();
      if (data.pairingCode) {
        setPairingCode(data.pairingCode);
      } else if (data.qrCode) {
        setQrCodeData(data.qrCode);
      } else {
        setConnectError('Não foi possível obter o código de pareamento. Tente via QR Code.');
      }
    } catch (err: any) {
      setConnectError(err.message || 'Erro ao gerar código de pareamento.');
    } finally {
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
    return matchesSearch && inst.status === statusFilter;
  });

  // Métricas
  const totalCount = instances.length;
  const connectedCount = instances.filter((i) => i.status === 'connected' || i.status === 'connected_local').length;
  const disconnectedCount = instances.filter((i) => i.status === 'disconnected' || i.status === 'offline').length;
  const connectingCount = instances.filter((i) => i.status === 'connecting').length;

  // -------------------------------------------------------------
  // TELA DE LOGIN (Se não autenticado)
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white font-sans relative overflow-hidden">
        {/* Orbes de fundo brilhantes */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-3 shadow-lg shadow-emerald-500/20 mb-4">
              <Smartphone className="w-8 h-8 text-slate-950 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Gerenciador Master</h1>
            <p className="text-sm text-slate-400 mt-1">Painel Administrativo de Instâncias WhatsApp</p>
          </div>

          {authError && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                E-mail Administrativo
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="xpointsolucoes@gmail.com"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Senha de Acesso Master
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Entrar no Painel</span>
                  <Lock className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center text-xs text-slate-500">
            Acesso Restrito & Protected Engine System
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // PAINEL DE GERENCIAMENTO (Autenticado)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header Glassmorphism */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-2 shadow-md shadow-emerald-500/20 flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Gerenciador de Instâncias</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  Master
                </span>
              </h1>
              <p className="text-xs text-slate-400">Controle global de chips WhatsApp e conectores SaaS</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>{LOCKED_EMAIL}</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition flex items-center gap-2 text-xs font-semibold"
              title="Sair do Painel"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* CARDS DE METRICAS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Total de Instâncias</p>
                <h3 className="text-3xl font-extrabold text-white mt-1">{totalCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-300">
                <Layers className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-400 tracking-wider">Conectadas / On</p>
                <h3 className="text-3xl font-extrabold text-emerald-400 mt-1">{connectedCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-rose-400 tracking-wider">Desconectadas / Off</p>
                <h3 className="text-3xl font-extrabold text-rose-400 mt-1">{disconnectedCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-amber-400 tracking-wider">Em Conexão</p>
                <h3 className="text-3xl font-extrabold text-amber-400 mt-1">{connectingCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* BARRA DE ACOES E FILTROS */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-2xl">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, telefone ou ID..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="all">Todos os Status</option>
                <option value="connected">Conectadas 🟢</option>
                <option value="disconnected">Desconectadas 🔴</option>
                <option value="connecting">Conectando 🟡</option>
              </select>

              <button
                onClick={fetchInstances}
                disabled={loading}
                className="p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition flex items-center justify-center"
                title="Atualizar Lista"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="py-2.5 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition text-sm"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Criar Nova Instância</span>
          </button>
        </div>

        {/* GRID DE INSTANCIAS */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <p className="text-sm">Carregando instâncias do banco de dados...</p>
          </div>
        ) : filteredInstances.length === 0 ? (
          <div className="py-20 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500">
              <Smartphone className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-300">Nenhuma instância encontrada</p>
            <p className="text-xs text-slate-500 max-w-sm">
              Não encontramos nenhuma instância correspondente à sua busca ou filtro.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInstances.map((inst) => {
              const isConnected = inst.status === 'connected' || inst.status === 'connected_local';
              const isConnecting = inst.status === 'connecting';

              return (
                <div
                  key={inst.id}
                  className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between transition-all shadow-xl group relative overflow-hidden"
                >
                  {/* Faixa superior colorida */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1.5"
                    style={{ backgroundColor: inst.color || '#3b82f6' }}
                  />

                  <div className="space-y-4">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-inner shrink-0"
                          style={{ backgroundColor: (inst.color || '#3b82f6') + '22', color: inst.color || '#3b82f6' }}
                        >
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition">
                            {inst.display_name}
                          </h4>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{inst.phone_number || 'Sem número cadastrado'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          isConnected
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : isConnecting
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
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

                    {/* Detalhes da Instância */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">ID da Instância:</span>
                        <button
                          onClick={() => copyToClipboard(inst.id, `id_${inst.id}`)}
                          className="font-mono text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition"
                        >
                          <span>{inst.id.slice(0, 8)}...{inst.id.slice(-4)}</span>
                          {copiedId === `id_${inst.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {inst.api_key && (
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-slate-500">API Key:</span>
                          <button
                            onClick={() => copyToClipboard(inst.api_key!, `key_${inst.id}`)}
                            className="font-mono text-slate-300 hover:text-emerald-400 flex items-center gap-1 transition"
                          >
                            <span>{inst.api_key.slice(0, 10)}...</span>
                            {copiedId === `key_${inst.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Criada em:</span>
                        <span className="text-slate-300">
                          {new Date(inst.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações da Instância */}
                  <div className="flex items-center gap-2 pt-5 mt-4 border-t border-slate-800/80">
                    {!isConnected ? (
                      <button
                        onClick={() => handleConnectInstance(inst)}
                        className="flex-1 py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Conectar (QR/Código)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnectInstance(inst)}
                        className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reconectar</span>
                      </button>
                    )}

                    <button
                      onClick={() => setDeleteTarget(inst)}
                      className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl transition"
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

      {/* MODAL CRIAR INSTANCIA */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Nova Instância do WhatsApp</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInstance} className="space-y-4">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Número do WhatsApp (Opcional)
                </label>
                <input
                  type="text"
                  value={newInstancePhone}
                  onChange={(e) => setNewInstancePhone(e.target.value)}
                  placeholder="5511999999999"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Cor de Identificação
                </label>
                <div className="flex items-center gap-3">
                  {['#3b82f6', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewInstanceColor(c)}
                      className={`w-8 h-8 rounded-full transition transform ${
                        newInstanceColor === c ? 'scale-125 ring-2 ring-white shadow-lg' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-2.5 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Criar Instância</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONEXAO (QR CODE / PAREAMENTO) */}
      {connectInstance && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 text-left">
              <div>
                <h3 className="text-base font-bold text-white">Conectar Instância</h3>
                <p className="text-xs text-slate-400">{connectInstance.display_name}</p>
              </div>
              <button
                onClick={() => setConnectInstance(null)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Alternar Abas */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setConnectMode('qr')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  connectMode === 'qr' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                QR Code
              </button>
              <button
                onClick={() => setConnectMode('pairing')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  connectMode === 'pairing' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Código de Pareamento
              </button>
            </div>

            {connectLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-xs text-slate-400">Solicitando dados do motor de WhatsApp...</p>
              </div>
            ) : connectError ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs">
                {connectError}
              </div>
            ) : connectMode === 'qr' ? (
              <div className="space-y-4 flex flex-col items-center">
                {qrCodeData ? (
                  <div className="p-4 bg-white rounded-2xl shadow-xl inline-block">
                    <QRCode value={qrCodeData} size={220} />
                  </div>
                ) : (
                  <div className="py-8 text-xs text-slate-400">
                    Clique em **Gerar QR Code** para exibir o código na tela.
                  </div>
                )}

                <button
                  onClick={() => handleConnectInstance(connectInstance)}
                  className="py-2.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-semibold rounded-xl text-xs flex items-center gap-2 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Gerar Novo QR Code</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-left">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Número de Telefone (com DDD)
                  </label>
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {pairingCode && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                    <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Código de Pareamento</p>
                    <div className="text-2xl font-mono font-extrabold text-white tracking-widest bg-slate-950 py-2 rounded-xl border border-slate-800">
                      {pairingCode}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Abra o WhatsApp no celular ➔ Dispositivos Conectados ➔ Conectar com Código
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGeneratePairingCode}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold rounded-xl text-xs transition"
                >
                  Solicitar Código de 8 Dígitos
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE EXCLUSAO */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Excluir Instância?</h3>
            <p className="text-xs text-slate-400">
              Tem certeza que deseja apagar a instância <strong className="text-white">{deleteTarget.display_name}</strong>? Esta ação não pode ser desfeita.
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
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition disabled:opacity-50"
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
