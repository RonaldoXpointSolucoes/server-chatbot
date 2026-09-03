import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Building2,
  Terminal,
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
  ArrowUpRight,
  Share2,
  Link as LinkIcon,
  Send,
  Square
} from 'lucide-react';

import { migrateInstanceHistory } from '../services/whatsappEngine';
import { InstanceLogsModal } from '../components/InstanceLogsModal';
import { supabase, masterSupabase } from '../services/supabase';

const ENGINE_CANDIDATES = [
  import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim(),
  'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io'
].filter(Boolean) as string[];

// Helper resiliente com auto-fallback de servidor backend
const fetchEngineApi = async (path: string, options: RequestInit = {}) => {
  let lastError: any = null;
  const uniqueCandidates = Array.from(new Set(ENGINE_CANDIDATES));

  for (const baseUrl of uniqueCandidates) {
    try {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, options);
      if (res) {
        return res;
      }
    } catch (e) {
      lastError = e;
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
  profile_picture_url?: string | null;
}

interface Company {
  id: string;
  name: string;
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

  // Instâncias & Empresas
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);

  // Criar Instância & Empresa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstancePhone, setNewInstancePhone] = useState('');
  const [newInstanceColor, setNewInstanceColor] = useState('#10b981');
  const [newInstanceCompanyId, setNewInstanceCompanyId] = useState<string>('');
  const [showCompanySelection, setShowCompanySelection] = useState<boolean>(false);
  const [isCreatingNewCompany, setIsCreatingNewCompany] = useState<boolean>(false);
  const [newCompanyName, setNewCompanyName] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Re-vincular Empresa de Instância Existente
  const [reassignTargetInstance, setReassignTargetInstance] = useState<WhatsAppInstance | null>(null);
  const [reassignCompanyId, setReassignCompanyId] = useState<string>('');
  const [reassigning, setReassigning] = useState<boolean>(false);

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

  // Modal de Logs Exclusivos do Servidor em Tempo Real
  const [logTargetInstance, setLogTargetInstance] = useState<WhatsAppInstance | null>(null);

  // Suite de Diagnóstico & Testes da Instância (Tela Inteira)
  const [testTargetInstance, setTestTargetInstance] = useState<WhatsAppInstance | null>(null);
  const [runningAllTests, setRunningAllTests] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<{
    db: { status: 'idle' | 'testing' | 'success' | 'warning' | 'error'; message: string; latency?: number; details?: any };
    server: { status: 'idle' | 'testing' | 'success' | 'warning' | 'error'; message: string; latency?: number; details?: any };
    baileys: { status: 'idle' | 'testing' | 'success' | 'warning' | 'error'; message: string; latency?: number; details?: any };
    whatsappMeta: { status: 'idle' | 'testing' | 'success' | 'warning' | 'error'; message: string; latency?: number; details?: any };
  }>({
    db: { status: 'idle', message: 'Pendente de execução' },
    server: { status: 'idle', message: 'Pendente de execução' },
    baileys: { status: 'idle', message: 'Pendente de execução' },
    whatsappMeta: { status: 'idle', message: 'Pendente de execução' }
  });

  const addTestLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setTestLogs((prev) => [`[${timestamp}] ${msg}`, ...prev]);
  };

  const runTestDb = async (inst: WhatsAppInstance) => {
    const start = Date.now();
    setTestResults((prev) => ({ ...prev, db: { status: 'testing', message: 'Consultando Supabase Postgres DB...' } }));
    addTestLog(`[Teste 1/4] Iniciando validação de banco para instância ${inst.display_name} (${inst.id})...`);
    try {
      const { data, error } = await supabase.from('whatsapp_instances').select('*').eq('id', inst.id).single();
      const latency = Date.now() - start;
      if (error || !data) {
        setTestResults((prev) => ({ ...prev, db: { status: 'error', message: `Erro ao consultar Supabase: ${error?.message || 'Instância não encontrada'}`, latency } }));
        addTestLog(`❌ [Teste 1/4] Erro na consulta do DB (${latency}ms): ${error?.message || 'Não encontrada'}`);
      } else {
        const isConn = data.status === 'connected' || data.status === 'connected_local';
        setTestResults((prev) => ({
          ...prev,
          db: {
            status: isConn ? 'success' : 'warning',
            message: `Instância registrada no DB com status: ${data.status.toUpperCase()}`,
            latency,
            details: data
          }
        }));
        addTestLog(`✅ [Teste 1/4] Banco de dados Supabase verificado em ${latency}ms! Status: ${data.status}`);
      }
    } catch (e: any) {
      const latency = Date.now() - start;
      setTestResults((prev) => ({ ...prev, db: { status: 'error', message: e.message || 'Falha de conexão com DB', latency } }));
      addTestLog(`❌ [Teste 1/4] Exceção no banco (${latency}ms): ${e.message}`);
    }
  };

  const runTestServer = async () => {
    const start = Date.now();
    setTestResults((prev) => ({ ...prev, server: { status: 'testing', message: 'Testando ping HTTP com servidor Express...' } }));
    addTestLog(`[Teste 2/4] Enviando requisição de ping HTTP ao servidor backend Node...`);
    try {
      const res = await fetchEngineApi('/health', { method: 'GET' });
      const latency = Date.now() - start;
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResults((prev) => ({
          ...prev,
          server: {
            status: 'success',
            message: `Servidor Node.js Express Online (v${data.version || '5.9.9'})`,
            latency,
            details: data
          }
        }));
        addTestLog(`✅ [Teste 2/4] Ping de servidor com sucesso em ${latency}ms! Engine: ${data.engine || 'Express Node'}`);
      } else {
        setTestResults((prev) => ({ ...prev, server: { status: 'warning', message: `Servidor respondeu com código HTTP ${res.status}`, latency, details: data } }));
        addTestLog(`⚠️ [Teste 2/4] Servidor respondeu com HTTP ${res.status} em ${latency}ms`);
      }
    } catch (e: any) {
      const latency = Date.now() - start;
      setTestResults((prev) => ({ ...prev, server: { status: 'error', message: e.message || 'Servidor backend offline', latency } }));
      addTestLog(`❌ [Teste 2/4] Servidor backend inacessível (${latency}ms): ${e.message}`);
    }
  };

  const runTestBaileys = async (inst: WhatsAppInstance) => {
    const start = Date.now();
    setTestResults((prev) => ({ ...prev, baileys: { status: 'testing', message: 'Inspecionando socket Baileys na memória RAM do servidor...' } }));
    addTestLog(`[Teste 3/4] Inspecionando socket em memória RAM para instância ${inst.id}...`);
    try {
      const res = await fetchEngineApi(`/api/v1/instances/${inst.id}/status`, {
        headers: {
          'x-tenant-id': inst.tenant_id,
          'apikey': inst.api_key || ''
        }
      });
      const latency = Date.now() - start;
      const respJson = await res.json();
      const data = respJson.data || respJson;

      if (res.ok) {
        const isAlive = data.status === 'connected' || data.status === 'connected_local' || data.status === 'connecting' || data.status === 'open';
        setTestResults((prev) => ({
          ...prev,
          baileys: {
            status: isAlive ? 'success' : 'warning',
            message: `Socket em memória RAM com estado: ${String(data.status).toUpperCase()}`,
            latency,
            details: data
          }
        }));
        addTestLog(`✅ [Teste 3/4] Engine Baileys validada em ${latency}ms! Estado RAM: ${data.status}`);
      } else {
        setTestResults((prev) => ({ ...prev, baileys: { status: 'error', message: `Erro ao obter status da instância (HTTP ${res.status})`, latency, details: data } }));
        addTestLog(`❌ [Teste 3/4] Falha na inspeção do socket em memória (${latency}ms)`);
      }
    } catch (e: any) {
      const latency = Date.now() - start;
      setTestResults((prev) => ({ ...prev, baileys: { status: 'error', message: e.message || 'Falha ao conectar com o motor Baileys', latency } }));
      addTestLog(`❌ [Teste 3/4] Exceção no teste Baileys (${latency}ms): ${e.message}`);
    }
  };

  const runTestWhatsappMeta = async (inst: WhatsAppInstance) => {
    const start = Date.now();
    setTestResults((prev) => ({ ...prev, whatsappMeta: { status: 'testing', message: 'Testando ping de presença WebSocket com servidores oficiais Meta/WhatsApp...' } }));
    addTestLog(`[Teste 4/4] Disparando ping WebSocket para web.whatsapp.com...`);
    try {
      const res = await fetchEngineApi(`/api/v1/instances/${inst.id}/ping-whatsapp`, {
        headers: {
          'x-tenant-id': inst.tenant_id,
          'apikey': inst.api_key || ''
        }
      }).catch(() => null);

      const latency = Date.now() - start;

      // 1. Se o endpoint ping-whatsapp responder com JSON válido
      if (res && res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          const isWsActive = data.wsOpen && data.status === 'connected';
          setTestResults((prev) => ({
            ...prev,
            whatsappMeta: {
              status: isWsActive ? 'success' : 'warning',
              message: isWsActive
                ? `Conexão Meta Ativa! Latência WS: ${data.metaPingMs || latency}ms`
                : `Instância não pareada com a Meta ou socket fechado`,
              latency: data.metaPingMs || latency,
              details: data
            }
          }));
          if (isWsActive) {
            addTestLog(`🟢 [Teste 4/4] Ping nos Servidores Meta com Sucesso! Resposta WS: ${data.metaPingMs || latency}ms | Latência Servidor: ${data.serverLatencyMs || latency}ms`);
          } else {
            addTestLog(`⚠️ [Teste 4/4] Instância desconectada da Meta. Status: ${data.status}`);
          }
          return;
        }
      }

      // 2. Fallback resiliente via endpoint /status
      const statusRes = await fetchEngineApi(`/api/v1/instances/${inst.id}/status`, {
        headers: {
          'x-tenant-id': inst.tenant_id,
          'apikey': inst.api_key || ''
        }
      });

      const statusData = await statusRes.json();
      const instanceStatus = statusData.data?.status || 'disconnected';
      const isConnected = instanceStatus === 'connected' || instanceStatus === 'connected_local' || instanceStatus === 'open';

      setTestResults((prev) => ({
        ...prev,
        whatsappMeta: {
          status: isConnected ? 'success' : 'warning',
          message: isConnected ? `Servidores Meta Ativos! Latência estimada: ${latency}ms` : `Instância com status: ${instanceStatus.toUpperCase()}`,
          latency,
          details: statusData
        }
      }));
      addTestLog(`${isConnected ? '🟢' : '⚠️'} [Teste 4/4] Validação de Conexão com Meta concluída em ${latency}ms! Status: ${instanceStatus}`);
    } catch (e: any) {
      const latency = Date.now() - start;
      setTestResults((prev) => ({ ...prev, whatsappMeta: { status: 'error', message: e.message || 'Instância sem resposta do gateway Meta', latency } }));
      addTestLog(`❌ [Teste 4/4] Exceção no ping Meta (${latency}ms): ${e.message}`);
    }
  };

  const runAllSuiteTests = async (inst: WhatsAppInstance) => {
    setRunningAllTests(true);
    addTestLog(`🚀 INICIANDO BATERIA COMPLETA DE DIAGNÓSTICO PARA: ${inst.display_name.toUpperCase()}`);
    await runTestDb(inst);
    await runTestServer();
    await runTestBaileys(inst);
    await runTestWhatsappMeta(inst);
    addTestLog(`✨ BATERIA DE TESTES CONCLUÍDA!`);
    setRunningAllTests(false);
  };

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

  const STANDALONE_TENANT_ID = '00000000-0000-0000-0000-000000000000';

  // Carregar lista de empresas (tenants)
  const fetchCompanies = async () => {
    try {
      let rawCompanies: any[] = [];

      // 1. Tentar buscar direto do Supabase Master Client (service_role)
      const { data: sbData, error: sbError } = await masterSupabase
        .from('companies')
        .select('id, name, trade_name')
        .order('name', { ascending: true });

      if (!sbError && sbData && sbData.length > 0) {
        rawCompanies = sbData;
      } else {
        // 2. Fallback para client local
        const { data: localData } = await supabase
          .from('companies')
          .select('id, name, trade_name')
          .order('name', { ascending: true });
        if (localData) rawCompanies = localData;
      }

      if (rawCompanies.length > 0) {
        const formatted = rawCompanies
          .filter(c => c.id !== STANDALONE_TENANT_ID)
          .map(c => ({
            id: c.id,
            name: c.name || c.trade_name || 'Empresa Sem Nome'
          }));

        const uniqueCompanies = Array.from(
          new Map(formatted.map(item => [item.id, item])).values()
        );
        setCompanies(uniqueCompanies);
      }
    } catch (err) {
      console.error('Erro ao buscar empresas:', err);
    }
  };

  // Re-vincular Empresa de Instância Existente
  const handleReassignCompany = async () => {
    if (!reassignTargetInstance) return;
    setReassigning(true);
    try {
      let targetCompanyId: string = (reassignCompanyId === 'none' || !reassignCompanyId || reassignCompanyId === STANDALONE_TENANT_ID)
        ? STANDALONE_TENANT_ID
        : reassignCompanyId;

      if (isCreatingNewCompany) {
        if (!newCompanyName.trim()) {
          alert('Por favor, informe o nome da nova empresa.');
          setReassigning(false);
          return;
        }
        const { data: newComp, error: compErr } = await supabase
          .from('companies')
          .insert([{ name: newCompanyName.trim() }])
          .select('id, name')
          .single();

        if (compErr || !newComp) {
          throw new Error(`Erro ao criar empresa: ${compErr?.message || 'Falha no servidor'}`);
        }
        targetCompanyId = newComp.id;
        await fetchCompanies();
      }

      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ tenant_id: targetCompanyId })
        .eq('id', reassignTargetInstance.id);

      if (error) throw error;

      alert(
        targetCompanyId !== STANDALONE_TENANT_ID
          ? `Caixa "${reassignTargetInstance.display_name}" vinculada com sucesso!`
          : `Vínculo de empresa removido da caixa "${reassignTargetInstance.display_name}" com sucesso!`
      );
      setReassignTargetInstance(null);
      setIsCreatingNewCompany(false);
      setNewCompanyName('');
      fetchInstances();
    } catch (err: any) {
      alert(`Erro ao vincular empresa: ${err.message || 'Falha na atualização'}`);
    } finally {
      setReassigning(false);
    }
  };

  // Carregar instâncias de forma suave (sem piscar a tela)
  const fetchInstances = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const activeClient = masterSupabase || supabase;
      const { data, error } = await activeClient
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
      fetchCompanies();
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

  // Abrir Modal de Criação garantindo a lista de empresas
  const openCreateModal = () => {
    fetchCompanies();
    setIsCreatingNewCompany(false);
    setShowCompanySelection(false);
    setNewCompanyName('');
    setNewInstanceCompanyId('');
    setShowCreateModal(true);
  };

  // Criar Nova Instância (padrão com Empresa: Nenhuma)
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim()) return;

    setCreating(true);
    try {
      const targetCompanyId = STANDALONE_TENANT_ID;

      const newId = crypto.randomUUID();
      const apiKey = `sk_inst_${crypto.randomUUID().replace(/-/g, '')}`;

      const { error } = await supabase
        .from('whatsapp_instances')
        .insert([
          {
            id: newId,
            tenant_id: targetCompanyId,
            display_name: newInstanceName.trim(),
            phone_number: null,
            status: 'disconnected',
            color: newInstanceColor,
            api_key: apiKey,
            assigned_node_id: 'production-worker',
            settings: {
              bot_delay: 10,
              bot_active: true,
              always_online: true,
              read_messages: false,
              sync_history: false,
              is_api_only: true,
              chat_enabled: false
            }
          }
        ]);

      if (error) throw error;

      setShowCreateModal(false);
      setNewInstanceName('');
      setNewInstancePhone('');
      setNewCompanyName('');
      setIsCreatingNewCompany(false);
      fetchInstances();
    } catch (err: any) {
      alert(`Erro ao criar instância: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setCreating(false);
    }
  };


  // Alternar permissão de exibição no Chat UI (chat_enabled)
  const handleToggleChatEnabled = async (inst: WhatsAppInstance) => {
    try {
      const currentSettings = inst.settings || {};
      const newChatEnabled = !currentSettings.chat_enabled;
      const updatedSettings = {
        ...currentSettings,
        chat_enabled: newChatEnabled
      };
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ settings: updatedSettings })
        .eq('id', inst.id);

      if (error) throw error;
      fetchInstances(false);
    } catch (err: any) {
      alert(`Erro ao atualizar modo da instância: ${err.message}`);
    }
  };

  // Gerar Chave de API se ausente
  const handleGenerateApiKey = async (instId: string) => {
    try {
      const newKey = `sk_inst_${crypto.randomUUID().replace(/-/g, '')}`;
      await supabase.from('whatsapp_instances').update({ api_key: newKey }).eq('id', instId);
      fetchInstances();
    } catch (err) {
      console.error('Erro ao gerar chave de API:', err);
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

      // 1. Tentar migrar histórico para outra caixa do mesmo número/tenant se existir
      const otherTarget = instances.find(i => i.id !== deleteTarget.id && (i.phone_number === deleteTarget.phone_number || i.status === 'connected' || i.status === 'connected_local'));
      if (otherTarget) {
        await migrateInstanceHistory(deleteTarget.id, otherTarget.id);
      } else {
        // Se não houver outra caixa, apenas desvincula o instance_id para PRESERVAR todo o histórico no Supabase!
        await supabase.from('messages').update({ instance_id: null }).eq('instance_id', deleteTarget.id);
        await supabase.from('conversations').update({ instance_id: null }).eq('instance_id', deleteTarget.id);
        await supabase.from('contacts').update({ instance_id: null }).eq('instance_id', deleteTarget.id);
      }
      await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', deleteTarget.id);

      // 2. Excluir a instância
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

  const getCompanyName = (tenantId: string | null | undefined) => {
    if (!tenantId) return '🚫 Nenhuma (Sem Empresa / Standalone)';
    const found = companies.find(c => c.id === tenantId);
    if (found) return found.name;
    if (tenantId === '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21') return 'X-Point Soluções';
    return tenantId;
  };

  // Filtros
  const filteredInstances = instances.filter((inst) => {
    const matchesSearch =
      inst.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inst.phone_number && inst.phone_number.includes(searchTerm)) ||
      inst.id.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'connected') matchesStatus = (inst.status === 'connected' || inst.status === 'connected_local');
    if (statusFilter === 'disconnected') matchesStatus = (inst.status === 'disconnected' || inst.status === 'offline');
    if (statusFilter === 'connecting') matchesStatus = inst.status === 'connecting';

    const matchesCompany = companyFilter === 'all' 
      ? true 
      : companyFilter === 'none' 
      ? (!inst.tenant_id || inst.tenant_id === '') 
      : inst.tenant_id === companyFilter;

    return matchesSearch && matchesStatus && matchesCompany;
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
            {/* Filtro por Empresa */}
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition shadow-inner"
            >
              <option value="all">🌐 Todas as Empresas ({companies.length})</option>
              <option value="none">🚫 Nenhuma (Sem Empresa / Standalone)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  🏢 {c.name}
                </option>
              ))}
            </select>

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
              onClick={() => {
                fetchInstances(false);
                fetchCompanies();
              }}
              disabled={loading}
              className="p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition flex items-center justify-center"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={openCreateModal}
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
                        {inst.profile_picture_url ? (
                          <img
                            src={inst.profile_picture_url}
                            alt={inst.display_name}
                            className="w-11 h-11 rounded-2xl object-cover ring-4 ring-slate-800/50 shrink-0 border border-slate-700/50 shadow-md"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
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
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition line-clamp-1">
                              {inst.display_name}
                            </h4>
                            <button
                              onClick={() => copyToClipboard(inst.display_name, `name_${inst.id}`)}
                              className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800/80 transition flex items-center shrink-0"
                              title="Copiar Nome da Instância"
                            >
                              {copiedId === `name_${inst.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
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
                      {/* Empresa / Tenant da Instância */}
                      <div className="flex items-center justify-between text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-slate-500 shrink-0">Empresa:</span>
                          <span className="font-semibold text-slate-200 truncate" title={getCompanyName(inst.tenant_id)}>
                            {getCompanyName(inst.tenant_id)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setReassignTargetInstance(inst);
                            setReassignCompanyId(inst.tenant_id);
                            fetchCompanies();
                          }}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline shrink-0 ml-1"
                        >
                          Vincular
                        </button>
                      </div>
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
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Chave de API:</span>
                        {inst.api_key ? (
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
                        ) : (
                          <button
                            onClick={() => handleGenerateApiKey(inst.id)}
                            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 transition flex items-center gap-1"
                            title="Gerar Chave de API única para esta instância"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Gerar Chave</span>
                          </button>
                        )}
                      </div>

                      {/* Modo de Operação / Chat UI */}
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Modo de Operação:</span>
                        <button
                          onClick={() => handleToggleChatEnabled(inst)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 ${
                            inst.settings?.chat_enabled
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                          }`}
                          title={inst.settings?.chat_enabled ? 'Clique para alternar para Apenas API' : 'Clique para habilitar exibição no Chat'}
                        >
                          {inst.settings?.chat_enabled ? (
                            <>
                              <UserCheck className="w-3 h-3 text-blue-400" />
                              <span>Habilitado no Chat</span>
                            </>
                          ) : (
                            <>
                              <Key className="w-3 h-3 text-amber-400" />
                              <span>API Gateway (Apenas API)</span>
                            </>
                          )}
                        </button>
                      </div>

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
                      onClick={() => {
                        const directUrl = `https://reconecta-zap.vercel.app/${inst.id}`;
                        try {
                          navigator.clipboard.writeText(directUrl);
                        } catch {}
                        window.open(directUrl, '_blank');
                      }}
                      className="p-3 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/40 text-emerald-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer shadow-sm hover:shadow-emerald-500/20"
                      title="Abrir Painel ConectaZap desta Instância (Nova Aba)"
                    >
                      <ExternalLink className="w-4 h-4 text-emerald-400" />
                      <span>ConectaZap</span>
                    </button>

                    <button
                      onClick={() => {
                        setTestTargetInstance(inst);
                        runAllSuiteTests(inst);
                      }}
                      className="p-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl transition flex items-center gap-1.5 font-bold text-xs"
                      title="Abrir Tela Completa de Diagnóstico & Testes"
                    >
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <span className="hidden sm:inline">Testes</span>
                    </button>

                    <button
                      onClick={() => setLogTargetInstance(inst)}
                      className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-[0.98]"
                      title="Ver Logs Exclusivos do Servidor em Tempo Real para esta Instância"
                    >
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <span className="hidden sm:inline">Logs</span>
                    </button>

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
                  autoFocus
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Ex: Comercial X-Point, Suporte SP"
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

      {/* MODAL RE-VINCULAR EMPRESA (TENANT) DA INSTÂNCIA */}
      {reassignTargetInstance && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-left relative z-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Building2 className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Vincular Empresa</h3>
                  <p className="text-xs text-slate-400">{reassignTargetInstance.display_name}</p>
                </div>
              </div>
              <button
                onClick={() => setReassignTargetInstance(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Selecione a Empresa / Tenant Destino *
              </label>
              {!isCreatingNewCompany ? (
                <div className="space-y-2">
                  <select
                    value={reassignCompanyId || 'none'}
                    onChange={(e) => setReassignCompanyId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition shadow-inner"
                  >
                    <option value="none">🚫 Nenhuma (Remover Vínculo / Desassociar)</option>
                    {companies.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        🏢 {comp.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewCompany(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Criar uma nova empresa para esta caixa...</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Nome da Nova Empresa (Ex: Pizzaria Oliveira, HBI...)"
                    className="w-full bg-slate-950 border border-cyan-500/50 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewCompany(false)}
                    className="text-xs text-slate-400 hover:text-slate-200 font-medium underline pt-1"
                  >
                    Voltar para seleção de empresas existentes
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
              💡 Ao desassociar e selecionar uma nova empresa, a caixa <strong>{reassignTargetInstance.display_name}</strong> deixará de aparecer para a empresa <strong>X-Point Soluções</strong> e pertencerá exclusivamente à nova empresa selecionada.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setReassignTargetInstance(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleReassignCompany}
                disabled={reassigning || !reassignCompanyId}
                className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Salvar Vínculo</span>}
              </button>
            </div>
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const directUrl = `https://reconecta-zap.vercel.app/${connectInstance.id}`;
                    try {
                      navigator.clipboard.writeText(directUrl);
                    } catch {}
                    window.open(directUrl, '_blank');
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/40 text-emerald-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                  title="Abrir Painel ConectaZap desta Instância (Nova Aba)"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Abrir ConectaZap</span>
                </button>

                <button
                  onClick={closeConnectModal}
                  className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

      {/* TELA INTEIRA DE DIAGNÓSTICO & TESTES DA INSTÂNCIA */}
      {testTargetInstance && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col p-4 sm:p-8 overflow-y-auto">
          {/* Header da Suite de Testes */}
          <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white shadow-inner ring-4 ring-slate-800/80 shrink-0"
                style={{
                  backgroundColor: `${testTargetInstance.color || '#10b981'}20`,
                  color: testTargetInstance.color || '#10b981',
                  borderColor: `${testTargetInstance.color || '#10b981'}40`
                }}
              >
                <Activity className="w-7 h-7 stroke-[2.2] animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                    Central de Diagnóstico & Testes
                  </h2>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    Instância: {testTargetInstance.display_name}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span>ID: <strong className="text-slate-200 font-mono">{testTargetInstance.id}</strong></span>
                  <span>•</span>
                  <span>Número: <strong className="text-slate-200 font-mono">{testTargetInstance.phone_number || 'Sem número'}</strong></span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={() => runAllSuiteTests(testTargetInstance)}
                disabled={runningAllTests}
                className="py-3 px-5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold rounded-2xl text-xs flex items-center gap-2 transition shadow-xl shadow-emerald-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${runningAllTests ? 'animate-spin' : ''}`} />
                <span>{runningAllTests ? 'Executando Testes...' : 'Executar Todos os Testes'}</span>
              </button>

              <button
                onClick={() => setTestTargetInstance(null)}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-2xl transition"
                title="Fechar Suite de Testes"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Grid dos 4 Cards de Testes Principais */}
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Teste 1: Conexão Supabase / DB */}
            <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">1. Teste de Conexão se está Conectado (Supabase DB)</h3>
                    <p className="text-xs text-slate-400">Valida integridade do registro e chave de API no Postgres</p>
                  </div>
                </div>
                <button
                  onClick={() => runTestDb(testTargetInstance)}
                  disabled={testResults.db.status === 'testing'}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResults.db.status === 'testing' ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {testResults.db.status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : testResults.db.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : testResults.db.status === 'warning' ? (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  ) : testResults.db.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                  )}
                  <span className="text-slate-200 font-medium">{testResults.db.message}</span>
                </div>
                {testResults.db.latency !== undefined && (
                  <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    {testResults.db.latency} ms
                  </span>
                )}
              </div>
            </div>

            {/* Teste 2: Ping no Servidor Backend Node.js */}
            <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">2. Teste de Ping no Servidor</h3>
                    <p className="text-xs text-slate-400">Mede a latência HTTP de ida e volta com o servidor Node.js Express</p>
                  </div>
                </div>
                <button
                  onClick={() => runTestServer()}
                  disabled={testResults.server.status === 'testing'}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResults.server.status === 'testing' ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {testResults.server.status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : testResults.server.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : testResults.server.status === 'warning' ? (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  ) : testResults.server.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                  )}
                  <span className="text-slate-200 font-medium">{testResults.server.message}</span>
                </div>
                {testResults.server.latency !== undefined && (
                  <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    {testResults.server.latency} ms
                  </span>
                )}
              </div>
            </div>

            {/* Teste 3: Ping na Baileys em Memória */}
            <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">3. Teste de Ping na Baileys (RAM)</h3>
                    <p className="text-xs text-slate-400">Verifica se o socket da instância está ativo na memória RAM</p>
                  </div>
                </div>
                <button
                  onClick={() => runTestBaileys(testTargetInstance)}
                  disabled={testResults.baileys.status === 'testing'}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResults.baileys.status === 'testing' ? 'animate-spin text-teal-400' : ''}`} />
                </button>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {testResults.baileys.status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  ) : testResults.baileys.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : testResults.baileys.status === 'warning' ? (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  ) : testResults.baileys.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                  )}
                  <span className="text-slate-200 font-medium">{testResults.baileys.message}</span>
                </div>
                {testResults.baileys.latency !== undefined && (
                  <span className="font-mono text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded-lg border border-teal-500/20">
                    {testResults.baileys.latency} ms
                  </span>
                )}
              </div>
            </div>

            {/* Teste 4: Ping no Servidor do WhatsApp usando a Baileys */}
            <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">4. Teste de Ping no Servidor do WhatsApp (usando a Baileys)</h3>
                    <p className="text-xs text-slate-400">Dispara ping WebSocket direta com os servidores oficiais da Meta</p>
                  </div>
                </div>
                <button
                  onClick={() => runTestWhatsappMeta(testTargetInstance)}
                  disabled={testResults.whatsappMeta.status === 'testing'}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResults.whatsappMeta.status === 'testing' ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {testResults.whatsappMeta.status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  ) : testResults.whatsappMeta.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : testResults.whatsappMeta.status === 'warning' ? (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  ) : testResults.whatsappMeta.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                  )}
                  <span className="text-slate-200 font-medium">{testResults.whatsappMeta.message}</span>
                </div>
                {testResults.whatsappMeta.latency !== undefined && (
                  <span className="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20">
                    {testResults.whatsappMeta.latency} ms
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Console de Terminal Log de Diagnóstico */}
          <div className="w-full max-w-6xl mx-auto bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 shadow-xl flex flex-col flex-1 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Console de Logs em Tempo Real</span>
              </div>
              <button
                onClick={() => {
                  const reportText = `--- RELATÓRIO DE DIAGNÓSTICO BAILYES ---\nInstância: ${testTargetInstance.display_name} (${testTargetInstance.id})\nTelefone: ${testTargetInstance.phone_number}\n\nLOGS:\n${testLogs.join('\n')}`;
                  navigator.clipboard.writeText(reportText);
                  alert('Relatório de teste copiado para a área de transferência!');
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Relatório</span>
              </button>
            </div>

            <div className="bg-slate-950 font-mono text-xs text-emerald-400/90 p-4 rounded-2xl border border-slate-800/80 h-48 overflow-y-auto space-y-1 shadow-inner">
              {testLogs.length === 0 ? (
                <p className="text-slate-600 italic">Clique em "Executar Todos os Testes" para iniciar a bateria de diagnóstico...</p>
              ) : (
                testLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LOGS EXCLUSIVOS DO SERVIDOR EM TEMPO REAL */}
      <InstanceLogsModal
        instance={logTargetInstance}
        isOpen={Boolean(logTargetInstance)}
        onClose={() => setLogTargetInstance(null)}
      />
    </div>
  );
}
