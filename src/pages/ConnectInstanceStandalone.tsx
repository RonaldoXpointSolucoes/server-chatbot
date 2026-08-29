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
  RotateCw,
  Download,
  Share2,
  PlusCircle,
  Monitor,
  Info,
  X,
  ExternalLink,
  ArrowRight,
  FileText,
  Activity,
  Terminal,
  Clock
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

interface ConnectionLogItem {
  id: string;
  type: string;
  message: string;
  level: string;
  created_at: string;
  payload?: {
    event_type?: string;
    error?: string;
    phone?: string;
    status?: string;
    instance_name?: string;
  };
}

const QR_RENEWAL_INTERVAL = 25; // Segundos para auto-renovação do QR Code Baileys

export default function ConnectInstanceStandalone() {
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const instanceId = paramId || searchParams.get('id');

  const [instance, setInstance] = useState<InstanceData | null>(null);
  const instanceRef = useRef<InstanceData | null>(null);

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

  // Estados de PWA / Instalação
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [installPlatform, setInstallPlatform] = useState<'ios' | 'android' | 'desktop'>('android');

  // Estados de Logs de Conexão
  const [showLogsModal, setShowLogsModal] = useState<boolean>(false);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

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

  // 1. Detecta plataforma do usuário e inicializa escuta de eventos PWA
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone ||
        document.referrer.includes('android-app://') ||
        searchParams.get('standalone') === 'true';
      setIsStandalone(Boolean(isStandaloneMode));
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    
    if (isIos) {
      setInstallPlatform('ios');
    } else if (isAndroid) {
      setInstallPlatform('android');
    } else {
      setInstallPlatform('desktop');
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowInstallModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [searchParams]);

  // 2. Injeta dinamicamente o Web App Manifest exclusivo para esta instância
  useEffect(() => {
    if (!instance || !instanceId) return;

    const instanceTitle = `Reconectar ${instance.display_name}`;
    document.title = `${instanceTitle} | WhatsApp Direct`;

    let metaAppleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!metaAppleTitle) {
      metaAppleTitle = document.createElement('meta');
      metaAppleTitle.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(metaAppleTitle);
    }
    metaAppleTitle.setAttribute('content', instanceTitle);

    const customManifest = {
      name: `Reconectar WhatsApp - ${instance.display_name}`,
      short_name: `${instance.display_name.slice(0, 16)}`,
      description: `Painel de Reconexão e Status do WhatsApp para a instância ${instance.display_name}`,
      start_url: `/connect-instance/${instanceId}?standalone=true`,
      scope: `/connect-instance/`,
      id: `/connect-instance/${instanceId}`,
      display: 'standalone',
      display_override: ['standalone', 'fullscreen', 'minimal-ui'],
      background_color: '#090e11',
      theme_color: '#090e11',
      orientation: 'portrait',
      categories: ['business', 'utilities'],
      icons: [
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    };

    const manifestBlob = new Blob([JSON.stringify(customManifest)], { type: 'application/json' });
    const manifestBlobUrl = URL.createObjectURL(manifestBlob);

    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestBlobUrl;

    return () => {
      URL.revokeObjectURL(manifestBlobUrl);
    };
  }, [instance, instanceId]);

  // 3. Consulta o status em tempo real no motor Node/Baileys com fallback no Supabase
  const checkEngineStatus = useCallback(async (targetInst?: InstanceData | null) => {
    const inst = targetInst || instanceRef.current;
    const currentInstanceId = instanceId;
    if (!currentInstanceId) return;

    const tenantId = inst?.tenant_id || '00000000-0000-0000-0000-000000000000';
    const apiKey = inst?.api_key || 'chatboot-secret-key';

    try {
      const baseUrl = getActiveEngineUrl();
      const res = await fetch(`${baseUrl}/api/v1/instances/${currentInstanceId}/status?_t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'apikey': apiKey
        },
        cache: 'no-store'
      });

      let data: any = null;
      if (res.ok) {
        const rawJson = await res.json();
        data = rawJson.data || rawJson;
      }

      let qrFromRt: string | null = null;
      if (!data?.qr_code && !data?.qrBase64 && !data?.qr_base64) {
        const { data: rt } = await supabase
          .from('whatsapp_instance_runtime')
          .select('qr_code, pairing_code')
          .eq('instance_id', currentInstanceId)
          .maybeSingle();
        if (rt?.qr_code) {
          qrFromRt = rt.qr_code;
        }
      }

      const st = data?.status || data?.sessionStatus || inst?.status || 'disconnected';
      const phone = data?.phoneNumber || data?.phone || data?.user_jid?.split('@')[0];

      setConnectionStatus(st);
      if (phone) setConnectedNumber(phone);

      const isConn = st === 'connected' || st === 'connected_local' || st === 'open';

      if (isConn) {
        setStatusStep(4);
        setStatusMessage('WhatsApp conectado e sincronizado com sucesso!');
        setQrCodeData(null);
        setQrBase64(null);
        setActionLoading(false);
      } else {
        const rawQr = data?.qrBase64 || data?.qr_base64 || data?.base64 || data?.qrCode || data?.qr_code || 
          (Array.isArray(data?.whatsapp_instance_runtime) ? data.whatsapp_instance_runtime[0]?.qr_code : data?.whatsapp_instance_runtime?.qr_code) ||
          qrFromRt;

        if (rawQr) {
          if (rawQr.startsWith('data:image') || rawQr.length > 500) {
            setQrBase64(rawQr.startsWith('data:image') ? rawQr : `data:image/png;base64,${rawQr}`);
            setQrCodeData(null);
          } else {
            setQrCodeData(rawQr);
            setQrBase64(null);
          }
          setStatusStep(2);
          setStatusMessage('Aguardando leitura do QR Code pelo celular...');
          setActionLoading(false);
        } else if (data?.is_authenticated || data?.pairingSuccess || phone) {
          setStatusStep(3);
          setStatusMessage('QR Code lido no celular! Autenticando com o WhatsApp...');
        } else if (st === 'connecting' || st === 'pairing' || st === 'reconnecting') {
          setStatusStep(1);
          setStatusMessage(actionLoading ? 'Gerando QR Code oficial... Aguarde alguns instantes.' : 'Conectando ao motor WhatsApp para gerar o QR Code...');
        } else {
          setStatusStep(1);
          setStatusMessage('Instância pronta para geração de QR Code.');
        }
      }
    } catch (e) {
      console.warn('[ConnectStandalone] Erro ao consultar engine:', e);
    }
  }, [instanceId, actionLoading]);

  // 4. Dispara a geração ou auto-renovação de QR Code com polling ativo
  const handleGenerateQr = useCallback(async (forceNew = false, isAuto = false) => {
    const inst = instanceRef.current;
    if (!instanceId || isConnected) return;

    if (isAutoGeneratingRef.current && isAuto) return;
    isAutoGeneratingRef.current = true;

    const tenantId = inst?.tenant_id || '00000000-0000-0000-0000-000000000000';
    const apiKey = inst?.api_key || 'chatboot-secret-key';

    try {
      if (isAuto) {
        setIsRenewingAuto(true);
      } else {
        setActionLoading(true);
        setStatusStep(1);
        setStatusMessage('Gerando QR Code oficial... Conectando ao WhatsApp.');
      }
      setError(null);

      const baseUrl = getActiveEngineUrl();
      const endpoint = `${baseUrl}/api/v1/instances/${instanceId}/connect${forceNew ? '?force_new=true' : ''}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'apikey': apiKey
        },
        body: JSON.stringify({ forceNew }),
        cache: 'no-store'
      });

      const rawJson = await res.json();
      const data = rawJson.data || rawJson;

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Falha ao acionar servidor.');
      }

      setQrCountdown(QR_RENEWAL_INTERVAL);

      if (data.qrBase64 || data.qr_base64 || data.base64) {
        const b64 = data.qrBase64 || data.qr_base64 || data.base64;
        setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
        setQrCodeData(null);
        setStatusStep(2);
        setStatusMessage('QR Code gerado e ativo! Aponte a câmera do WhatsApp.');
        setActionLoading(false);
      } else if (data.qrCode || data.qr_code) {
        setQrCodeData(data.qrCode || data.qr_code);
        setQrBase64(null);
        setStatusStep(2);
        setStatusMessage('QR Code gerado e ativo! Aponte a câmera do WhatsApp.');
        setActionLoading(false);
      } else {
        let found = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const { data: rt } = await supabase
            .from('whatsapp_instance_runtime')
            .select('qr_code')
            .eq('instance_id', instanceId)
            .maybeSingle();

          if (rt?.qr_code) {
            const raw = rt.qr_code;
            if (raw.startsWith('data:image') || raw.length > 500) {
              setQrBase64(raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`);
              setQrCodeData(null);
            } else {
              setQrCodeData(raw);
              setQrBase64(null);
            }
            setStatusStep(2);
            setStatusMessage('QR Code gerado e ativo! Aponte a câmera do WhatsApp.');
            setActionLoading(false);
            found = true;
            break;
          }
        }
        if (!found) {
          checkEngineStatus(inst);
        }
      }
    } catch (e: any) {
      if (!isAuto) {
        setError(e.message || 'Erro ao gerar QR Code.');
        setStatusStep(1);
        setStatusMessage('Erro na inicialização. Tente novamente.');
      }
    } finally {
      if (isAuto) {
        setIsRenewingAuto(false);
      }
      isAutoGeneratingRef.current = false;
    }
  }, [instanceId, isConnected, checkEngineStatus]);

  // 5. Carrega dados básicos da instância no Supabase
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
        .select('*, whatsapp_instance_runtime(qr_code, pairing_code)')
        .eq('id', instanceId)
        .maybeSingle();

      if (dbErr || !data) {
        const { data: dataByName } = await supabase
          .from('whatsapp_instances')
          .select('*, whatsapp_instance_runtime(qr_code, pairing_code)')
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

      const isAlreadyConn = instData.status === 'connected' || instData.status === 'connected_local';
      const runtime = Array.isArray((instData as any).whatsapp_instance_runtime)
        ? (instData as any).whatsapp_instance_runtime[0]
        : (instData as any).whatsapp_instance_runtime;

      if (!isAlreadyConn && runtime?.qr_code) {
        const b64 = runtime.qr_code;
        if (b64.startsWith('data:image') || b64.length > 500) {
          setQrBase64(b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`);
          setQrCodeData(null);
        } else {
          setQrCodeData(b64);
          setQrBase64(null);
        }
        setStatusStep(2);
        setStatusMessage('QR Code ativo! Aponte a câmera do WhatsApp no celular.');
      } else if (!isAlreadyConn) {
        handleGenerateQr(false, false);
      }

      checkEngineStatus(instData);
    } catch (e: any) {
      setError(`Erro ao carregar instância: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [instanceId, handleGenerateQr, checkEngineStatus]);

  // 6. Carrega os logs de conexão da instância
  const fetchConnectionLogs = useCallback(async () => {
    if (!instanceId) return;
    setLoadingLogs(true);
    try {
      const baseUrl = getActiveEngineUrl();
      const res = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/connection-logs?limit=40&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.logs && Array.isArray(data.logs)) {
          setConnectionLogs(data.logs);
          setLoadingLogs(false);
          return;
        }
      }

      // Fallback direto no Supabase
      const { data: dbLogs } = await supabase
        .from('system_logs')
        .select('*')
        .eq('type', 'WhatsApp Connection')
        .filter('payload->>instance_id', 'eq', instanceId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (dbLogs) {
        setConnectionLogs(dbLogs as ConnectionLogItem[]);
      }
    } catch (err) {
      console.warn('[ConnectStandalone] Erro ao carregar logs de conexão:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [instanceId]);

  // 7. Dispara a geração de Código de Pareamento (8 Dígitos)
  const handleGeneratePairingCode = async () => {
    const inst = instanceRef.current;
    if (!instanceId) return;
    if (!pairingPhone || pairingPhone.length < 10) {
      setError('Por favor, informe o número completo com DDD (Ex: 5511999999999)');
      return;
    }

    const tenantId = inst?.tenant_id || '00000000-0000-0000-0000-000000000000';
    const apiKey = inst?.api_key || 'chatboot-secret-key';

    try {
      setActionLoading(true);
      setError(null);
      setPairingCode(null);
      setStatusStep(3);
      setStatusMessage('Solicitando Código de Pareamento de 8 dígitos ao WhatsApp...');

      const cleanPhone = pairingPhone.replace(/\D/g, '');
      const baseUrl = getActiveEngineUrl();
      const endpoint = `${baseUrl}/api/v1/instances/${instanceId}/pairing-code?force_new=true`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
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

  // 8. Desconectar instância
  const handleDisconnect = async () => {
    const inst = instanceRef.current;
    if (!instanceId) return;
    if (!window.confirm('Tem certeza que deseja desconectar este WhatsApp? A conexão atual será encerrada.')) return;

    const tenantId = inst?.tenant_id || '00000000-0000-0000-0000-000000000000';
    const apiKey = inst?.api_key || 'chatboot-secret-key';

    try {
      setActionLoading(true);
      const baseUrl = getActiveEngineUrl();
      await fetch(`${baseUrl}/api/v1/instances/${instanceId}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
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

  // 9. Dispara o fluxo de instalação PWA
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsStandalone(true);
          setDeferredPrompt(null);
        }
      } catch (err) {
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // Efeito Inicial: Carrega metadados, polling e Realtime duplo
  useEffect(() => {
    loadInstanceMetadata();

    pollTimerRef.current = setInterval(() => {
      checkEngineStatus();
    }, 2500);

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

  // Loop de Auto-Renovação Contínua do QR Code
  useEffect(() => {
    if (isConnected || connectMode !== 'qr' || (!qrCodeData && !qrBase64)) {
      return;
    }

    renewTimerRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          handleGenerateQr(true, true);
          return QR_RENEWAL_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (renewTimerRef.current) clearInterval(renewTimerRef.current);
    };
  }, [isConnected, connectMode, qrCodeData, qrBase64, handleGenerateQr]);

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
      <div className="fixed inset-0 w-full h-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4 select-none font-sans z-50">
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
      <div className="fixed inset-0 w-full h-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4 select-none font-sans z-50">
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
    <div className="min-h-screen w-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-3 sm:p-5 md:p-6 lg:p-8 select-none font-sans relative overflow-x-hidden">
      
      {/* Luzes de Fundo Ambientais (Cyber Backlights) */}
      <div className="fixed -top-32 -left-32 w-96 h-96 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Card Principal Widescreen (2 Colunas no Desktop para visibilidade total sem rolagem) */}
      <div className="w-full max-w-4xl lg:max-w-5xl bg-[#111b21]/95 border border-white/10 rounded-[32px] p-5 sm:p-7 md:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl relative z-10 space-y-5 my-auto shrink-0">
        
        {/* ========================================================= */}
        {/* HEADER SUPERIOR COM NOME, STATUS E AÇÕES RÁPIDAS */}
        {/* ========================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.08] pb-4 gap-3.5">
          
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25 border border-white/20 shrink-0">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-black text-white tracking-wide truncate max-w-[200px] sm:max-w-[280px]">
                  {instance?.display_name || 'Conectar WhatsApp'}
                </h1>
                {/* Badge de Status de Conexão */}
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 border ${
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
              <p className="text-[10.5px] text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Link Autônomo de Conexão Direct</span>
              </p>
            </div>
          </div>

          {/* Botões de Ação do Header */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {/* Botão de Histórico de Logs */}
            <button
              onClick={() => {
                fetchConnectionLogs();
                setShowLogsModal(true);
              }}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
              title="Visualizar logs e histórico de tentativas de conexão desta instância"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Logs</span>
            </button>

            {!isStandalone ? (
              <button
                onClick={handleInstallClick}
                className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/30 hover:shadow-emerald-500/40 active:scale-95 cursor-pointer border border-emerald-400/30 animate-pulse"
                title="Instalar este Reconector na Área de Trabalho ou Celular"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Instalar App</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>App Standalone Ativo</span>
              </span>
            )}

            <button
              onClick={copyDirectLink}
              className={`px-3 py-2 rounded-2xl border text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                copiedLink
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/20'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Copiar Link de Conexão Direct"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>

        </div>

        {/* Banner de Erro se houver */}
        {error && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-bold flex items-center gap-2.5 shadow-md">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* CORPO PRINCIPAL EM GRID DE 2 COLUNAS (SPLIT LAYOUT) */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-stretch">
          
          {/* ========================================================= */}
          {/* COLUNA DA ESQUERDA: INFORMAÇÕES, STATUS E INSTRUÇÕES */}
          {/* ========================================================= */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-4 text-left">
            
            <div className="space-y-4">
              {/* Tracker de Status Dinâmico */}
              <div className="bg-[#0c1317] p-3.5 rounded-2xl border border-white/[0.08] space-y-2.5 shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-black">
                  <span className="text-slate-400 uppercase tracking-wider">Etapa do Processo:</span>
                  <span className="text-emerald-400 font-mono font-bold">Passo {statusStep} de 4</span>
                </div>

                {/* Barra de Progresso Visual de 4 Segmentos */}
                <div className="grid grid-cols-4 gap-1.5">
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 1 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 1: Inicializando" />
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 2 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 2: QR Code Pronto" />
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 3 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 3: Autenticando Celular" />
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${statusStep >= 4 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/10'}`} title="Passo 4: Conectado com Sucesso" />
                </div>

                <p className="text-[11px] text-slate-300 font-bold flex items-center gap-2 pt-0.5">
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

              {/* Passo a Passo Ilustrado "Como conectar no WhatsApp" */}
              <div className="bg-[#0c1317] p-3.5 rounded-2xl border border-white/[0.08] space-y-2.5 shadow-inner">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <Zap size={13} className="text-emerald-400" />
                  <span>Instruções para Conectar no Celular:</span>
                </span>
                
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">1</span>
                    <div className="min-w-0">
                      <strong className="text-white block leading-tight">Abra o aplicativo WhatsApp</strong>
                      <span className="text-[10px] text-slate-400 leading-tight">No celular principal onde está o chip.</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">2</span>
                    <div className="min-w-0">
                      <strong className="text-white block leading-tight">Acesse "Aparelhos Conectados"</strong>
                      <span className="text-[10px] text-slate-400 leading-tight">Toque em Configurações (ou ⋮) ➔ Conectar um aparelho.</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">3</span>
                    <div className="min-w-0">
                      <strong className="text-white block leading-tight">Aponte a Câmera para o QR Code</strong>
                      <span className="text-[10px] text-slate-400 leading-tight">Enquadre o código ao lado na tela do seu aparelho.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alternador de Abas (QR Code vs Código de 8 Dígitos) */}
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
                  <span>Usar QR Code</span>
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
            </div>

            {/* Banner de Instalação PWA Inteligente na Esquerda */}
            {!isStandalone && (
              <div className="p-3 bg-gradient-to-r from-emerald-950/40 via-[#0c1317] to-teal-950/30 border border-emerald-500/25 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <h3 className="text-[11px] font-black text-emerald-300 leading-tight">Instalar Atalho Exclusivo</h3>
                    <p className="text-[9.5px] text-slate-400 leading-tight truncate">Abra em 1 clique sem precisar fazer login.</p>
                  </div>
                </div>
                <button
                  onClick={handleInstallClick}
                  className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider rounded-xl shrink-0 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>Instalar</span>
                </button>
              </div>
            )}

            {/* Rodapé / Footer Corporativo */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10.5px] text-slate-500 font-bold">
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

          {/* ========================================================= */}
          {/* COLUNA DA DIREITA: QR CODE HERO / CÓDIGO / SUCESSO */}
          {/* ========================================================= */}
          <div className="lg:col-span-6 bg-[#0c1317]/90 rounded-[28px] border border-white/[0.08] p-5 sm:p-6 flex flex-col items-center justify-center text-center shadow-inner relative min-h-[380px]">
            
            {/* ESTADO 1: DISPOSITIVO CONECTADO */}
            {isConnected ? (
              <div className="w-full space-y-5 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.45)] ring-4 ring-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10 text-slate-950 stroke-[2.5]" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-lg font-black text-white tracking-wide">
                    Dispositivo Conectado com Sucesso!
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    A instância <strong className="text-emerald-300">{instance?.display_name}</strong> está sincronizada e ativa.
                  </p>
                </div>

                {connectedNumber && (
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#111b21] border border-emerald-500/40 rounded-2xl text-emerald-300 font-black text-sm shadow-inner font-mono tracking-wider">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>+{connectedNumber}</span>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5 w-full">
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
            ) : connectMode === 'qr' ? (
              /* ESTADO 2: ABA QR CODE */
              <div className="w-full flex flex-col items-center justify-center space-y-4">
                
                {/* Moldura Cibernética do QR Code */}
                {actionLoading && !qrBase64 && !qrCodeData ? (
                  <div className="w-[220px] h-[220px] sm:w-[240px] sm:h-[240px] bg-[#111b21] rounded-[28px] border border-emerald-500/30 flex flex-col items-center justify-center gap-3 text-xs text-slate-300 shadow-inner p-4 animate-pulse">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
                    <span className="font-bold text-center leading-tight">
                      Gerando QR Code oficial...<br/>
                      <span className="text-[10px] text-slate-400 font-normal">Conectando aos servidores do WhatsApp</span>
                    </span>
                  </div>
                ) : qrBase64 ? (
                  <div className="p-3.5 bg-white rounded-[26px] shadow-[0_15px_50px_rgba(0,0,0,0.7)] inline-block ring-6 ring-emerald-500/25 transition-all hover:scale-[1.01] relative group">
                    <img src={qrBase64} alt="QR Code WhatsApp" className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-xl object-contain" />
                  </div>
                ) : qrCodeData ? (
                  <div className="p-3.5 bg-white rounded-[26px] shadow-[0_15px_50px_rgba(0,0,0,0.7)] inline-block ring-6 ring-emerald-500/25 transition-all hover:scale-[1.01] relative group">
                    <QRCode value={qrCodeData} size={220} />
                  </div>
                ) : (
                  <div className="py-10 px-5 bg-[#111b21] rounded-[26px] border border-white/10 w-full space-y-3 shadow-inner">
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
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#111b21] border border-emerald-500/30 rounded-full text-[10px] font-black text-emerald-300 shadow-sm">
                    <RotateCw className={`w-3 h-3 text-emerald-400 ${isRenewingAuto ? 'animate-spin' : ''}`} />
                    <span>Auto-renovação em {qrCountdown}s</span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  </div>
                )}

                {/* Botão Gerar / Renovar QR Code Manualmente */}
                <button
                  onClick={() => handleGenerateQr(true, false)}
                  disabled={actionLoading}
                  className="w-full max-w-xs py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_8px_25px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.45)] active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>{qrCodeData || qrBase64 ? 'Renovar QR Code Agora' : 'Gerar QR Code de Conexão'}</span>
                </button>

              </div>
            ) : (
              /* ESTADO 3: ABA CÓDIGO DE PAREAMENTO (8 DÍGITOS) */
              <div className="w-full max-w-xs space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="text-left space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <PhoneCall size={12} className="text-emerald-400" />
                    <span>Número do Celular com DDD</span>
                  </label>
                  <input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-[#111b21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono shadow-inner font-bold"
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
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-[24px] space-y-2.5 text-center animate-in fade-in zoom-in-95 duration-200 shadow-lg">
                    <p className="text-[10px] text-emerald-300 font-black uppercase tracking-wider">
                      Digite este código no seu celular:
                    </p>
                    <div className="text-2xl sm:text-3xl font-black text-white tracking-[0.3em] font-mono bg-[#111b21] py-3 rounded-2xl border border-emerald-500/40 shadow-inner">
                      {pairingCode}
                    </div>
                    <button
                      onClick={copyPairingCode}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      {copiedPairing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{copiedPairing ? 'Copiado!' : 'Copiar Código'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ========================================================= */}
      {/* MODAL DE HISTÓRICO E LOGS DE CONEXÃO */}
      {/* ========================================================= */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-[#111b21] border border-white/15 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left relative overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Fechar */}
            <button
              onClick={() => setShowLogsModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Cabeçalho */}
            <div className="flex items-center gap-3 pr-8">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 border border-white/20 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-white leading-tight">
                  Logs de Tentativas de Conexão
                </h3>
                <p className="text-xs text-emerald-400 font-bold truncate">
                  Instância: {instance?.display_name || instanceId}
                </p>
              </div>
            </div>

            {/* Botão de Atualização Manual */}
            <div className="flex items-center justify-between bg-[#0c1317] px-3.5 py-2 rounded-xl border border-white/10 text-xs">
              <span className="text-slate-400 font-medium">Eventos registrados no servidor:</span>
              <button
                onClick={fetchConnectionLogs}
                disabled={loadingLogs}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-emerald-400 font-bold rounded-lg border border-white/10 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {/* Lista de Logs */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-1 min-h-[220px]">
              {loadingLogs && connectionLogs.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs font-bold">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>Carregando logs do servidor...</span>
                </div>
              ) : connectionLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-medium space-y-2">
                  <Terminal className="w-8 h-8 mx-auto text-slate-600" />
                  <p>Nenhuma tentativa de conexão registrada ainda para esta instância.</p>
                </div>
              ) : (
                connectionLogs.map((log) => {
                  const isErr = log.level === 'error' || log.payload?.event_type === 'connection_error';
                  const isSucc = log.payload?.event_type === 'connection_success' || log.message.includes('sucesso');
                  const logDate = new Date(log.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit'
                  });

                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-2xl border text-xs space-y-1 transition-all ${
                        isSucc
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : isErr
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                          : 'bg-[#0c1317] border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                          isSucc
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isErr
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-white/10 text-slate-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSucc ? 'bg-emerald-400' : isErr ? 'bg-rose-400' : 'bg-slate-400'}`} />
                          {isSucc ? 'Conectado' : isErr ? 'Falha / Erro' : 'Tentativa'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{logDate}</span>
                        </span>
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed pt-0.5">
                        {log.message}
                      </p>
                      {log.payload?.error && (
                        <p className="text-[10px] text-rose-400 font-mono bg-black/30 p-1.5 rounded-lg">
                          Detalhes: {log.payload.error}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setShowLogsModal(false)}
              className="w-full py-3 bg-white/10 hover:bg-white/15 text-slate-200 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer border border-white/10"
            >
              Fechar Painel de Logs
            </button>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE GUIA DE INSTALAÇÃO PWA (iOS / Android / Desktop) */}
      {/* ========================================================= */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#111b21] border border-white/15 rounded-[32px] p-6 shadow-2xl space-y-5 text-left relative overflow-hidden">
            
            <button
              onClick={() => setShowInstallModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 border border-white/20">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white leading-tight">
                  Instalar Reconector WhatsApp
                </h3>
                <p className="text-xs text-emerald-400 font-bold">
                  {instance?.display_name}
                </p>
              </div>
            </div>

            <div className="flex bg-[#0c1317] p-1 rounded-xl border border-white/10 text-[11px] font-black">
              <button
                onClick={() => setInstallPlatform('ios')}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  installPlatform === 'ios'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>iPhone / iOS</span>
              </button>
              <button
                onClick={() => setInstallPlatform('android')}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  installPlatform === 'android'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android</span>
              </button>
              <button
                onClick={() => setInstallPlatform('desktop')}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  installPlatform === 'desktop'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Computador</span>
              </button>
            </div>

            {installPlatform === 'ios' && (
              <div className="space-y-3 bg-[#0c1317] p-4 rounded-2xl border border-white/5 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">1</div>
                  <p className="text-slate-300">
                    No Safari do iPhone/iPad, toque no ícone <strong className="text-white inline-flex items-center gap-1"><Share2 className="w-3.5 h-3.5 text-emerald-400 inline" /> Compartilhar</strong> na barra inferior.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">2</div>
                  <p className="text-slate-300">
                    Role as opções para cima e toque em <strong className="text-white inline-flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5 text-emerald-400 inline" /> Adicionar à Tela de Início</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">3</div>
                  <p className="text-slate-300">
                    Toque em <strong className="text-emerald-400">Adicionar</strong> no canto superior direito. O ícone de reconexão estará na sua tela inicial!
                  </p>
                </div>
              </div>
            )}

            {installPlatform === 'android' && (
              <div className="space-y-3 bg-[#0c1317] p-4 rounded-2xl border border-white/5 text-xs">
                {deferredPrompt ? (
                  <div className="text-center space-y-3">
                    <p className="text-slate-300">
                      Seu navegador suporta a instalação direta em 1 toque.
                    </p>
                    <button
                      onClick={handleInstallClick}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                    >
                      <Download className="w-4 h-4" />
                      <span>Instalar Aplicativo Agora</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">1</div>
                      <p className="text-slate-300">
                        Toque no menu de <strong className="text-white">três pontinhos (⋮)</strong> no canto superior direito do Chrome.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">2</div>
                      <p className="text-slate-300">
                        Selecione a opção <strong className="text-white">"Instalar aplicativo"</strong> ou <strong className="text-white">"Adicionar à tela inicial"</strong>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {installPlatform === 'desktop' && (
              <div className="space-y-3 bg-[#0c1317] p-4 rounded-2xl border border-white/5 text-xs">
                {deferredPrompt ? (
                  <div className="text-center space-y-3">
                    <p className="text-slate-300">
                      Instale o aplicativo na sua Área de Trabalho para acesso rápido.
                    </p>
                    <button
                      onClick={handleInstallClick}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                    >
                      <Download className="w-4 h-4" />
                      <span>Instalar na Área de Trabalho</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">1</div>
                      <p className="text-slate-300">
                        Clique no ícone de <strong className="text-white">Instalar App</strong> no lado direito da barra de endereço do Chrome ou Edge.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center shrink-0 text-xs">2</div>
                      <p className="text-slate-300">
                        Ou clique nos <strong className="text-white">três pontinhos (⋮)</strong> ➔ <strong className="text-white">"Salvar e compartilhar"</strong> ➔ <strong className="text-white">"Instalar este site como app"</strong>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => setShowInstallModal(false)}
              className="w-full py-3 bg-white/10 hover:bg-white/15 text-slate-200 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer border border-white/10"
            >
              Entendi, Fechar
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
