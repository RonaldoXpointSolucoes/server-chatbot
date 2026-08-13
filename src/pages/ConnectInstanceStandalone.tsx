import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Wifi,
  WifiOff,
  AlertTriangle,
  LogOut,
  Share2,
  Key,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { getActiveEngineUrl } from '../services/environmentService';

interface InstanceData {
  id: string;
  display_name: string;
  phone_number?: string;
  status: string;
  created_at: string;
  api_key?: string;
  tenant_id?: string;
  tenant_name?: string;
}

export default function ConnectInstanceStandalone() {
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const instanceId = paramId || searchParams.get('id');

  const [instance, setInstance] = useState<InstanceData | null>(null);
  const instanceRef = useRef<InstanceData | null>(null);

  // Atualiza o ref sempre que instance mudar
  useEffect(() => {
    instanceRef.current = instance;
  }, [instance]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Conexão
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState<string>('');
  
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedPairing, setCopiedPairing] = useState<boolean>(false);

  // Passo visual do processo: 1=Inicializando, 2=Aguardando Leitura, 3=Autenticando, 4=Conectado
  const [statusStep, setStatusStep] = useState<number>(1);
  const [statusMessage, setStatusMessage] = useState<string>('Inicializando comunicação com o servidor...');

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchEngineApi = useCallback(async (path: string, options: RequestInit = {}) => {
    const baseUrl = getActiveEngineUrl();
    const inst = instanceRef.current;
    const tenantId = inst?.tenant_id;
    const apiKey = inst?.api_key || 'chatboot-secret-key';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': apiKey,
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...((options.headers as Record<string, string>) || {})
    };

    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    });
  }, []);

  // 2. Consulta o status em tempo real no motor Node/Baileys
  const checkEngineStatus = useCallback(async (targetInst?: InstanceData | null) => {
    const inst = targetInst || instanceRef.current;
    const currentInstanceId = instanceId;
    if (!currentInstanceId || !inst?.tenant_id) return;

    try {
      const baseUrl = getActiveEngineUrl();
      const apiKey = inst.api_key || 'chatboot-secret-key';
      const res = await fetch(`${baseUrl}/api/v1/instances/${currentInstanceId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id,
          'apikey': apiKey
        }
      });

      if (!res.ok) return;

      const rawJson = await res.json();
      const data = rawJson.data || rawJson;
      const st = data.status || data.sessionStatus || 'disconnected';
      const phone = data.phoneNumber || data.phone || data.user_jid?.split('@')[0];

      setConnectionStatus(st);
      if (phone) setConnectedNumber(phone);

      const isConn = st === 'connected' || st === 'connected_local' || st === 'open';

      if (isConn) {
        setStatusStep(4);
        setStatusMessage('WhatsApp conectado e sincronizado com sucesso!');
        setQrCodeData(null);
        setQrBase64(null);
      } else if (data.qrBase64 || data.qr_base64 || data.base64) {
        const b64 = data.qrBase64 || data.qr_base64 || data.base64;
        setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
        setQrCodeData(null);
        setStatusStep(2);
        setStatusMessage('Aguardando leitura do QR Code pelo celular...');
      } else if (data.qrCode || data.qr_code || data.whatsapp_instance_runtime?.[0]?.qr_code) {
        const qrText = data.qrCode || data.qr_code || data.whatsapp_instance_runtime?.[0]?.qr_code;
        setQrCodeData(qrText);
        setQrBase64(null);
        setStatusStep(2);
        setStatusMessage('Aguardando leitura do QR Code pelo celular...');
      } else if (st === 'connecting' || st === 'pairing') {
        setStatusStep(3);
        setStatusMessage('QR Code lido no celular! Autenticando com o WhatsApp...');
      } else {
        setStatusStep(1);
        setStatusMessage('Instância pronta para geração de QR Code.');
      }
    } catch (e) {
      console.warn('[ConnectStandalone] Erro ao consultar engine:', e);
    }
  }, [instanceId]);

  // 1. Carrega dados básicos da instância no Supabase
  const loadInstanceMetadata = useCallback(async () => {
    if (!instanceId) {
      setError('ID da instância não informado na URL.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let instData: InstanceData | null = null;

      const { data, error: dbErr } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .maybeSingle();

      if (dbErr || !data) {
        // Se não achou pelo UUID estrito, busca por display_name
        const { data: dataByName } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .ilike('display_name', instanceId)
          .maybeSingle();

        if (dataByName) {
          instData = dataByName;
        }
      } else {
        instData = data;
      }

      if (!instData) {
        setError(`Instância '${instanceId}' não foi encontrada.`);
        setLoading(false);
        return;
      }

      setInstance(instData);
      instanceRef.current = instData;
      setConnectedNumber(instData.phone_number || null);
      setConnectionStatus(instData.status || 'disconnected');

      // Consulta imediatamente o status na engine enviando o tenant_id recém obtido
      checkEngineStatus(instData);
    } catch (e: any) {
      setError(`Erro ao carregar instância: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [instanceId, checkEngineStatus]);

  // 3. Dispara a geração de QR Code
  const handleGenerateQr = async (forceNew = false) => {
    const inst = instanceRef.current;
    if (!instanceId || !inst?.tenant_id) {
      setError('Aguardando carregamento dos dados da instância.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setQrCodeData(null);
      setQrBase64(null);
      setStatusStep(1);
      setStatusMessage('Inicializando motor Baileys e gerando novo QR Code...');

      const baseUrl = getActiveEngineUrl();
      const apiKey = inst.api_key || 'chatboot-secret-key';
      const endpoint = `${baseUrl}/api/v1/instances/${instanceId}/connect${forceNew ? '?force_new=true' : ''}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id,
          'apikey': apiKey
        }
      });

      const rawJson = await res.json();
      const data = rawJson.data || rawJson;

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Falha ao acionar servidor.');
      }

      if (data.qrBase64 || data.qr_base64 || data.base64) {
        const b64 = data.qrBase64 || data.qr_base64 || data.base64;
        setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
        setStatusStep(2);
        setStatusMessage('QR Code gerado com sucesso! Leia com a câmera do WhatsApp.');
      } else if (data.qrCode || data.qr_code) {
        setQrCodeData(data.qrCode || data.qr_code);
        setStatusStep(2);
        setStatusMessage('QR Code gerado com sucesso! Leia com a câmera do WhatsApp.');
      }

      // Inicia o polling contínuo de validação
      checkEngineStatus(inst);
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar QR Code.');
      setStatusStep(1);
      setStatusMessage('Erro na inicialização. Tente novamente.');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Dispara a geração de Código de Pareamento (8 Dígitos)
  const handleGeneratePairingCode = async () => {
    const inst = instanceRef.current;
    if (!instanceId || !inst?.tenant_id) return;
    if (!pairingPhone || pairingPhone.length < 10) {
      setError('Por favor, informe o número completo com DDD (Ex: 5511999999999)');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setPairingCode(null);
      setStatusStep(3);
      setStatusMessage('Solicitando Código de Pareamento de 8 dígitos ao WhatsApp...');

      const cleanPhone = pairingPhone.replace(/\D/g, '');
      const baseUrl = getActiveEngineUrl();
      const apiKey = inst.api_key || 'chatboot-secret-key';
      const endpoint = `${baseUrl}/api/v1/instances/${instanceId}/pairing-code?force_new=true`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id,
          'apikey': apiKey
        },
        body: JSON.stringify({ phone_number: cleanPhone, phoneNumber: cleanPhone })
      });

      const rawJson = await res.json();
      const data = rawJson.data || rawJson;

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Falha ao gerar código de pareamento.');
      }

      const code = data.code || data.pairingCode || data.pairing_code;
      if (code) {
        setPairingCode(code);
        setStatusStep(3);
        setStatusMessage('Código gerado! Digite o código no WhatsApp do celular.');
      } else {
        throw new Error('Código de pareamento não foi retornado pelo servidor.');
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar código de pareamento.');
      setStatusStep(1);
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Desconectar instância
  const handleDisconnect = async () => {
    const inst = instanceRef.current;
    if (!instanceId || !inst?.tenant_id) return;
    if (!window.confirm('Tem certeza que deseja desconectar este WhatsApp? A conexão atual será encerrada.')) return;

    try {
      setActionLoading(true);
      const baseUrl = getActiveEngineUrl();
      const apiKey = inst.api_key || 'chatboot-secret-key';
      await fetch(`${baseUrl}/api/v1/instances/${instanceId}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': inst.tenant_id,
          'apikey': apiKey
        }
      });
      setConnectionStatus('disconnected');
      setConnectedNumber(null);
      setQrCodeData(null);
      setQrBase64(null);
      setPairingCode(null);
      setStatusStep(1);
      setStatusMessage('Sessão encerrada com sucesso.');
    } catch (e: any) {
      setError(`Erro ao desconectar: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Efeito Inicial: Carrega metadados e faz polling contínuo
  useEffect(() => {
    loadInstanceMetadata();

    // Polling a cada 2.5s enquanto estiver na página
    pollTimerRef.current = setInterval(() => {
      checkEngineStatus();
    }, 2500);

    // Inscrição Realtime no Supabase para atualizações instantâneas da instância
    if (instanceId) {
      const channel = supabase
        .channel(`public:whatsapp_instances:${instanceId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances', filter: `id=eq.${instanceId}` },
          (payload) => {
            const updated = payload.new as InstanceData;
            setInstance((prev) => {
              const merged = { ...prev, ...updated };
              instanceRef.current = merged;
              return merged;
            });
            setConnectionStatus(updated.status);
            if (updated.phone_number) setConnectedNumber(updated.phone_number);
            if (updated.status === 'connected' || updated.status === 'connected_local') {
              setStatusStep(4);
              setStatusMessage('WhatsApp conectado e operacional!');
            }
          }
        )
        .subscribe();

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        supabase.removeChannel(channel);
      };
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [instanceId, loadInstanceMetadata, checkEngineStatus]);

  const copyDirectLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyPairingCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopiedPairing(true);
    setTimeout(() => setCopiedPairing(false), 2500);
  };

  const isConnected = connectionStatus === 'connected' || connectionStatus === 'connected_local' || connectionStatus === 'open';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 bg-slate-900/80 border border-slate-800 p-8 rounded-3xl backdrop-blur-md shadow-2xl">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
          <span className="text-sm font-semibold text-slate-300">Carregando painel de conexão...</span>
        </div>
      </div>
    );
  }

  if (error && !instance) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/90 border border-rose-500/30 p-8 rounded-3xl backdrop-blur-md text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-white">Instância Inacessível</h2>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <QrCode className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-wide">
                {instance?.display_name || 'Conectar WhatsApp'}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Autônomo de Conexão Direct</span>
              </p>
            </div>
          </div>

          <button
            onClick={copyDirectLink}
            className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
              copiedLink
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/70 text-slate-300'
            }`}
            title="Copiar Link de Conexão"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
          </button>
        </div>

        {/* Dynamic Status Progress Tracker (4 Passos) */}
        <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-400">Status da Conexão:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 ${
              isConnected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : statusStep > 1
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : statusStep > 1 ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
              }`} />
              {isConnected ? 'Conectado' : statusStep > 1 ? 'Aguardando Leitura' : 'Desconectado'}
            </span>
          </div>

          {/* Barra de Progresso Visual de 4 Passos */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <div className={`h-1.5 rounded-full transition-all ${statusStep >= 1 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`} title="Passo 1: Inicializando" />
            <div className={`h-1.5 rounded-full transition-all ${statusStep >= 2 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`} title="Passo 2: QR Code Pronto" />
            <div className={`h-1.5 rounded-full transition-all ${statusStep >= 3 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`} title="Passo 3: Autenticando Celular" />
            <div className={`h-1.5 rounded-full transition-all ${statusStep >= 4 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`} title="Passo 4: Conectado com Sucesso" />
          </div>

          <p className="text-xs text-slate-300 font-medium pt-1 text-center flex items-center justify-center gap-2">
            {actionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
            ) : isConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span>{statusMessage}</span>
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TELA DE SUCESSO (CONECTADO) */}
        {isConnected ? (
          <div className="py-8 px-6 bg-gradient-to-b from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-3xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500/40 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-bounce">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">Dispositivo Conectado com Sucesso!</h2>
              <p className="text-xs text-slate-400 mt-1">
                A instância <strong className="text-slate-200">{instance?.display_name}</strong> está sincronizada e ativa.
              </p>
            </div>

            {connectedNumber && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 border border-emerald-500/30 rounded-xl text-emerald-400 font-extrabold text-sm shadow-inner">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>+{connectedNumber}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleGenerateQr(true)}
                disabled={actionLoading}
                className="flex-1 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Reconectar / Novo QR</span>
              </button>

              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="py-3.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Desconectar Chip</span>
              </button>
            </div>
          </div>
        ) : (
          /* TELA DE LEITURA (QR CODE OU CÓDIGO DE PAREAMENTO) */
          <div className="space-y-6">
            {/* Alternar Abas */}
            <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80">
              <button
                onClick={() => setConnectMode('qr')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  connectMode === 'qr'
                    ? 'bg-slate-800 text-emerald-400 shadow-lg border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>QR Code</span>
              </button>

              <button
                onClick={() => setConnectMode('pairing')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  connectMode === 'pairing'
                    ? 'bg-slate-800 text-emerald-400 shadow-lg border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span>Código de 8 Dígitos</span>
              </button>
            </div>

            {/* Conteúdo Aba 1: QR Code */}
            {connectMode === 'qr' ? (
              <div className="space-y-6 flex flex-col items-center text-center">
                {actionLoading && !qrBase64 && !qrCodeData ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-slate-400">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
                    <span>Iniciando motor e gerando QR Code...</span>
                  </div>
                ) : qrBase64 ? (
                  <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block ring-8 ring-white/10 transition-all hover:scale-105">
                    <img src={qrBase64} alt="QR Code WhatsApp" className="w-[230px] h-[230px] rounded-2xl object-contain" />
                  </div>
                ) : qrCodeData ? (
                  <div className="p-5 bg-white rounded-3xl shadow-2xl inline-block ring-8 ring-white/10 transition-all hover:scale-105">
                    <QRCode value={qrCodeData} size={220} />
                  </div>
                ) : (
                  <div className="py-8 px-6 bg-slate-950/60 rounded-3xl border border-slate-800/80 w-full space-y-4">
                    <Smartphone className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      Clique no botão abaixo para inicializar a sessão Baileys e gerar o QR Code.
                    </p>
                  </div>
                )}

                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Abra o WhatsApp no celular ➔ Menu ➔ <strong className="text-slate-200">Dispositivos Conectados</strong> ➔ <strong className="text-slate-200">Conectar um dispositivo</strong>
                </p>

                <button
                  onClick={() => handleGenerateQr(true)}
                  disabled={actionLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 border border-emerald-500/40 text-emerald-300 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/10 active:scale-[0.98] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>{qrCodeData || qrBase64 ? 'Gerar Novo QR Code' : 'Gerar QR Code de Conexão'}</span>
                </button>
              </div>
            ) : (
              /* Conteúdo Aba 2: Código de Pareamento */
              <div className="space-y-5">
                <div className="text-left space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Número do Celular com DDD (Ex: 5511999999999)
                  </label>
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner font-mono"
                  />
                </div>

                <button
                  onClick={handleGeneratePairingCode}
                  disabled={actionLoading || !pairingPhone}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  <span>Gerar Código de 8 Dígitos</span>
                </button>

                {pairingCode && (
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3 text-center animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
                      Digite este código no seu celular:
                    </p>
                    <div className="text-3xl font-black text-white tracking-[0.3em] font-mono bg-slate-950 py-3 rounded-xl border border-emerald-500/30 shadow-inner">
                      {pairingCode}
                    </div>
                    <button
                      onClick={copyPairingCode}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      {copiedPairing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPairing ? 'Código Copiado!' : 'Copiar Código'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800/80 text-center flex items-center justify-between text-[11px] text-slate-500">
          <span>Powered by Baileys V6 Engine</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>X-Point Soluções</span>
          </span>
        </div>
      </div>
    </div>
  );
}
