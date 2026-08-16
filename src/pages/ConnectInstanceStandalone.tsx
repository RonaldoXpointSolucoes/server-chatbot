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
  ShieldCheck,
  Wifi,
  AlertTriangle,
  LogOut,
  Key,
  Sparkles,
  Shield,
  Zap,
  PhoneCall,
  RotateCw
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

const QR_RENEWAL_INTERVAL = 25; // Segundos para auto-renovação do QR Code Baileys

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

  // Contador de Auto-Renovação do QR Code
  const [qrCountdown, setQrCountdown] = useState<number>(QR_RENEWAL_INTERVAL);
  const [isRenewingAuto, setIsRenewingAuto] = useState<boolean>(false);

  // Passo visual do processo: 1=Inicializando, 2=Aguardando Leitura, 3=Autenticando, 4=Conectado
  const [statusStep, setStatusStep] = useState<number>(1);
  const [statusMessage, setStatusMessage] = useState<string>('Inicializando comunicação com o servidor...');

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const renewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoGeneratingRef = useRef<boolean>(false);

  const isConnected = connectionStatus === 'connected' || connectionStatus === 'connected_local' || connectionStatus === 'open';

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

  // 3. Dispara a geração ou auto-renovação de QR Code
  const handleGenerateQr = useCallback(async (forceNew = false, isAuto = false) => {
    const inst = instanceRef.current;
    if (!instanceId || !inst?.tenant_id || isConnected) return;

    if (isAutoGeneratingRef.current && isAuto) return;
    isAutoGeneratingRef.current = true;

    try {
      if (isAuto) {
        setIsRenewingAuto(true);
      } else {
        setActionLoading(true);
      }
      setError(null);

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

      // Resetar o contador de auto-renovação
      setQrCountdown(QR_RENEWAL_INTERVAL);

      if (data.qrBase64 || data.qr_base64 || data.base64) {
        const b64 = data.qrBase64 || data.qr_base64 || data.base64;
        setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
        setStatusStep(2);
        setStatusMessage('QR Code gerado e ativo! Aponte a câmera do WhatsApp.');
      } else if (data.qrCode || data.qr_code) {
        setQrCodeData(data.qrCode || data.qr_code);
        setStatusStep(2);
        setStatusMessage('QR Code gerado e ativo! Aponte a câmera do WhatsApp.');
      }

      // Polling de validação imediato
      checkEngineStatus(inst);
    } catch (e: any) {
      if (!isAuto) {
        setError(e.message || 'Erro ao gerar QR Code.');
        setStatusStep(1);
        setStatusMessage('Erro na inicialização. Tente novamente.');
      }
    } finally {
      setActionLoading(false);
      setIsRenewingAuto(false);
      isAutoGeneratingRef.current = false;
    }
  }, [instanceId, isConnected, checkEngineStatus]);

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

      // Se não estiver conectado, inicia automaticamente o motor e gera o QR inicial
      const isAlreadyConn = instData.status === 'connected' || instData.status === 'connected_local';
      if (!isAlreadyConn) {
        handleGenerateQr(false, false);
      }

      // Consulta imediatamente o status na engine enviando o tenant_id recém obtido
      checkEngineStatus(instData);
    } catch (e: any) {
      setError(`Erro ao carregar instância: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [instanceId, handleGenerateQr, checkEngineStatus]);

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
        setStatusMessage('Código gerado! Digite o código no WhatsApp do seu celular.');
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

  // Efeito Inicial: Carrega metadados, polling e Realtime duplo
  useEffect(() => {
    loadInstanceMetadata();

    // Polling contínuo de status a cada 2.5s
    pollTimerRef.current = setInterval(() => {
      checkEngineStatus();
    }, 2500);

    // Inscrição Realtime no Supabase para whatsapp_instances (status de conexão)
    if (instanceId) {
      const instChannel = supabase
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

      // Inscrição Realtime no Supabase para whatsapp_instance_runtime (novos QR Codes gerados pelo Baileys)
      const runtimeChannel = supabase
        .channel(`public:whatsapp_instance_runtime:${instanceId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_instance_runtime', filter: `instance_id=eq.${instanceId}` },
          (payload: any) => {
            const newRuntime = payload.new;
            if (newRuntime && newRuntime.qr_code) {
              const b64 = newRuntime.qr_code;
              setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
              setQrCodeData(null);
              setStatusStep(2);
              setQrCountdown(QR_RENEWAL_INTERVAL);
              setStatusMessage('QR Code atualizado pelo servidor! Aponte a câmera do WhatsApp.');
            }
          }
        )
        .subscribe();

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        supabase.removeChannel(instChannel);
        supabase.removeChannel(runtimeChannel);
      };
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [instanceId, loadInstanceMetadata, checkEngineStatus]);

  // Loop de Auto-Renovação Contínua do QR Code (A cada 1 segundo)
  useEffect(() => {
    if (isConnected || connectMode !== 'qr') {
      return;
    }

    renewTimerRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          // Quando chega a zero, aciona a auto-renovação silenciosa
          handleGenerateQr(true, true);
          return QR_RENEWAL_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (renewTimerRef.current) clearInterval(renewTimerRef.current);
    };
  }, [isConnected, connectMode, handleGenerateQr]);

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

  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4 select-none overflow-y-auto custom-scrollbar font-sans z-50">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col items-center gap-4 bg-[#111b21]/90 border border-white/10 p-8 rounded-[32px] backdrop-blur-2xl shadow-2xl relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Loader2 className="w-7 h-7 animate-spin text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">Carregando painel de conexão...</span>
        </div>
      </div>
    );
  }

  if (error && !instance) {
    return (
      <div className="fixed inset-0 w-full h-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4 select-none overflow-y-auto custom-scrollbar font-sans z-50">
        <div className="w-full max-w-md bg-[#111b21]/95 border border-rose-500/30 p-8 rounded-[32px] backdrop-blur-2xl text-center space-y-5 shadow-2xl relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-black text-white uppercase tracking-wider">Instância Inacessível</h2>
            <p className="text-xs text-slate-400 font-medium">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 bg-white/10 hover:bg-white/15 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer border border-white/10"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-start overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 select-none font-sans z-30">
      
      {/* Luzes de Fundo Ambientais (Cyber Backlights) */}
      <div className="fixed -top-32 -left-32 w-96 h-96 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Card Principal Glassmorphism com Rolagem Livre */}
      <div className="w-full max-w-md md:max-w-lg bg-[#111b21]/95 border border-white/10 rounded-[32px] p-5 sm:p-7 md:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.65)] backdrop-blur-2xl relative z-10 space-y-5 my-auto shrink-0">
        
        {/* Header com Nome da Instância e Botão Copiar Link */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25 border border-white/20 shrink-0">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-wide truncate max-w-[180px] sm:max-w-[240px]">
                {instance?.display_name || 'Conectar WhatsApp'}
              </h1>
              <p className="text-[10.5px] text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Autônomo de Conexão Direct</span>
              </p>
            </div>
          </div>

          <button
            onClick={copyDirectLink}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0 ${
              copiedLink
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/20'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
            }`}
            title="Copiar Link de Conexão Direct"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden xs:inline sm:inline">{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
          </button>
        </div>

        {/* Rastreador de Status Dinâmico (4 Passos) */}
        <div className="bg-[#0c1317] p-3.5 sm:p-4 rounded-2xl border border-white/[0.08] space-y-2.5 shadow-inner">
          <div className="flex items-center justify-between text-xs font-black">
            <span className="text-slate-400 text-[10px] sm:text-[10.5px] uppercase tracking-wider">Status da Conexão:</span>
            <span className={`px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[9.5px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border ${
              isConnected
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : statusStep > 1
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : statusStep > 1 ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'
              }`} />
              {isConnected ? 'Conectado' : statusStep > 1 ? 'Aguardando Leitura' : 'Desconectado'}
            </span>
          </div>

          {/* Barra de Progresso Visual de 4 Segmentos */}
          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 1 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 1: Inicializando" />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 2 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 2: QR Code Pronto" />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 3 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 3: Autenticando Celular" />
            <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 4 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 4: Conectado com Sucesso" />
          </div>

          <p className="text-[10.5px] sm:text-[11px] text-slate-300 font-bold pt-0.5 text-center flex items-center justify-center gap-2">
            {actionLoading || isRenewingAuto ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
            ) : isConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{statusMessage}</span>
          </p>
        </div>

        {/* Banner de Erro */}
        {error && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-bold flex items-center gap-2.5 shadow-md">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* TELA DE SUCESSO (DISPOSITIVO CONECTADO) */}
        {/* ========================================================= */}
        {isConnected ? (
          <div className="py-7 px-5 bg-gradient-to-b from-emerald-500/15 via-teal-500/10 to-transparent border border-emerald-500/30 rounded-[28px] text-center space-y-5 animate-in fade-in zoom-in-95 duration-300 shadow-xl">
            <div className="w-16 h-16 sm:w-18 sm:h-18 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_35px_rgba(16,185,129,0.45)] ring-4 ring-emerald-500/20">
              <CheckCircle2 className="w-9 h-9 text-slate-950 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Dispositivo Conectado com Sucesso!
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                A instância <strong className="text-emerald-300">{instance?.display_name}</strong> está sincronizada e pronta.
              </p>
            </div>

            {connectedNumber && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0c1317] border border-emerald-500/40 rounded-2xl text-emerald-300 font-black text-xs sm:text-sm shadow-inner font-mono tracking-wider">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>+{connectedNumber}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => handleGenerateQr(true, false)}
                disabled={actionLoading}
                className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/15 text-slate-200 font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer border border-white/10"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Reconectar / Novo QR</span>
              </button>

              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="py-3 px-4 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Desconectar Chip</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* TELA DE PAREAMENTO (QR CODE OU CÓDIGO DE 8 DÍGITOS) */
          /* ========================================================= */
          <div className="space-y-4">
            {/* Alternador de Abas */}
            <div className="flex bg-[#0c1317] p-1 rounded-2xl border border-white/[0.08] shadow-inner">
              <button
                onClick={() => setConnectMode('qr')}
                className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  connectMode === 'qr'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Code</span>
              </button>

              <button
                onClick={() => setConnectMode('pairing')}
                className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  connectMode === 'pairing'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Código de 8 Dígitos</span>
              </button>
            </div>

            {/* ABA 1: QR CODE */}
            {connectMode === 'qr' ? (
              <div className="space-y-4 flex flex-col items-center text-center">
                
                {/* Moldura Cibernética do QR Code */}
                {actionLoading && !qrBase64 && !qrCodeData ? (
                  <div className="w-[220px] h-[220px] bg-[#0c1317] rounded-[28px] border border-white/10 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-400 shadow-inner">
                    <Loader2 className="w-9 h-9 animate-spin text-emerald-400" />
                    <span className="font-bold">Gerando novo QR Code...</span>
                  </div>
                ) : qrBase64 ? (
                  <div className="p-3.5 bg-white rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.6)] inline-block ring-6 ring-emerald-500/20 transition-all hover:scale-[1.01] relative group">
                    <img src={qrBase64} alt="QR Code WhatsApp" className="w-[190px] h-[190px] sm:w-[210px] sm:h-[210px] rounded-xl object-contain" />
                  </div>
                ) : qrCodeData ? (
                  <div className="p-3.5 bg-white rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.6)] inline-block ring-6 ring-emerald-500/20 transition-all hover:scale-[1.01] relative group">
                    <QRCode value={qrCodeData} size={200} />
                  </div>
                ) : (
                  <div className="py-8 px-5 bg-[#0c1317] rounded-[24px] border border-white/10 w-full space-y-3 shadow-inner">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-slate-400 font-semibold max-w-xs mx-auto">
                      Clique no botão abaixo para gerar o QR Code oficial de conexão.
                    </p>
                  </div>
                )}

                {/* Badge de Auto-Renovação Contínua */}
                {(qrBase64 || qrCodeData) && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#0c1317] border border-emerald-500/30 rounded-full text-[10px] font-black text-emerald-300 shadow-sm">
                    <RotateCw className={`w-3 h-3 text-emerald-400 ${isRenewingAuto ? 'animate-spin' : ''}`} />
                    <span>Auto-renovação em {qrCountdown}s</span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  </div>
                )}

                {/* Passo a Passo Ilustrado em 3 Etapas */}
                <div className="w-full bg-[#0c1317] p-3 rounded-2xl border border-white/[0.08] text-left space-y-2 shadow-inner">
                  <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <Zap size={12} className="text-emerald-400" />
                    <span>Como conectar no WhatsApp:</span>
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px]">
                    <div className="flex items-center gap-2 bg-white/[0.02] p-2 rounded-xl border border-white/5">
                      <span className="w-4 h-4 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-[9px] flex items-center justify-center shrink-0">1</span>
                      <span className="text-slate-300 font-semibold leading-tight">Abra o WhatsApp</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/[0.02] p-2 rounded-xl border border-white/5">
                      <span className="w-4 h-4 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-[9px] flex items-center justify-center shrink-0">2</span>
                      <span className="text-slate-300 font-semibold leading-tight">Aparelhos Conectados</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/[0.02] p-2 rounded-xl border border-white/5">
                      <span className="w-4 h-4 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-[9px] flex items-center justify-center shrink-0">3</span>
                      <span className="text-slate-300 font-semibold leading-tight">Aponte para o QR Code</span>
                    </div>
                  </div>
                </div>

                {/* Botão Gerar / Renovar QR Code Manualmente */}
                <button
                  onClick={() => handleGenerateQr(true, false)}
                  disabled={actionLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_8px_25px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.45)] active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>{qrCodeData || qrBase64 ? 'Renovar QR Code Agora' : 'Gerar QR Code de Conexão'}</span>
                </button>

              </div>
            ) : (
              /* ABA 2: CÓDIGO DE PAREAMENTO (8 DÍGITOS) */
              <div className="space-y-4">
                <div className="text-left space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <PhoneCall size={12} className="text-emerald-400" />
                    <span>Número do Celular com DDD (Ex: 5511999999999)</span>
                  </label>
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-[#0c1317] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono shadow-inner font-bold"
                  />
                </div>

                <button
                  onClick={handleGeneratePairingCode}
                  disabled={actionLoading || !pairingPhone}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_8px_25px_rgba(16,185,129,0.35)] active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  <span>Gerar Código de 8 Dígitos</span>
                </button>

                {pairingCode && (
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-[24px] space-y-3 text-center animate-in fade-in zoom-in-95 duration-200 shadow-lg">
                    <p className="text-[10.5px] text-emerald-300 font-black uppercase tracking-wider">
                      Digite este código na notificação do celular:
                    </p>
                    <div className="text-3xl sm:text-4xl font-black text-white tracking-[0.35em] font-mono bg-[#0c1317] py-3.5 rounded-2xl border border-emerald-500/40 shadow-inner">
                      {pairingCode}
                    </div>
                    <button
                      onClick={copyPairingCode}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      {copiedPairing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPairing ? 'Código Copiado com Sucesso!' : 'Copiar Código de Pareamento'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Rodapé / Footer Corporativo */}
        <div className="pt-3 border-t border-white/[0.08] text-center flex items-center justify-between text-[10.5px] text-slate-500 font-bold">
          <span className="flex items-center gap-1.5">
            <Shield size={12} className="text-emerald-400/70" />
            <span>Powered by Baileys V6 Engine</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>X-Point Soluções</span>
          </span>
        </div>

      </div>
    </div>
  );
}
