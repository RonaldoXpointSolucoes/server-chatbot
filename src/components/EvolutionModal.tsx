import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store/chatStore";
import { useWaCallsStore } from "../store/useWaCallsStore";
import { useDevStore } from "../store/devStore";
import { cn } from "../lib/utils";
import {
  Smartphone,
  CheckCircle,
  Loader2,
  AlertCircle,
  Signal,
  Link as LinkIcon,
  PlusCircle,
  LogOut,
  RefreshCcw,
  UserCircle2,
  Trash2,
  QrCode,
  UserPlus,
  UserMinus,
  ShieldAlert,
  ShieldCheck,
  PenSquare,
  Share2,
  Settings,
  Users,
  Save,
  Activity,
  X,
  Volume2,
} from "lucide-react";
import {
  createInstance,
  fetchEngineStatus,
  logoutEngine,
  reconnectEngine,
  clearEngineStore,
  syncEngineContacts,
  forceEnginePresence,
  fetchEngineGroups,
  fetchEngineGroupMetadata,
  createEngineGroup,
  updateEngineGroupSubject,
  updateEngineGroupDescription,
  updateEngineGroupSettings,
  updateEngineGroupParticipants,
  leaveEngineGroup,
  getEngineGroupInviteCode,
  revokeEngineGroupInvite,
  acceptEngineGroupInvite,
  fetchEngineGroupProfilePicture,
  updateEngineGroupProfilePicture,
  toggleEngineGroupEphemeral,
} from "../services/whatsappEngine";
import { supabase } from "../services/supabase";
import {
  NOTIFICATION_SOUNDS,
  playNotificationSound,
} from "../utils/AudioEngine";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatPhoneNumber(jidOrNum: string) {
  if (!jidOrNum) return "";
  
  // WhatsApp oculta números em comunidades usando LIDs (Linked Device IDs)
  if (jidOrNum.includes("@lid")) {
    return "Oculto (Privacidade)";
  }

  const num = jidOrNum.split("@")[0];
  const cleaned = num.replace(/\D/g, "");
  
  // Heurística para LIDs disfarçados de números normais (geralmente >= 13 dígitos ou números impossíveis)
  if (cleaned.length >= 14) {
    return "Oculto (Privacidade)";
  }
  if (cleaned.length >= 13 && !cleaned.startsWith("55")) {
    return "Oculto (Privacidade)";
  }

  if (cleaned.startsWith("55") && cleaned.length >= 12) {
    const ddd = cleaned.substring(2, 4);
    const firstPart = cleaned.length === 13 ? cleaned.substring(4, 9) : cleaned.substring(4, 8);
    const secondPart = cleaned.length === 13 ? cleaned.substring(9) : cleaned.substring(8);
    return `(${ddd}) ${firstPart}-${secondPart}`;
  }
  return `+${cleaned}`;
}

export default function EvolutionModal({
  isOpen,
  onClose,
  targetInstanceName,
}: {
  isOpen?: boolean;
  onClose: () => void;
  targetInstanceName?: string | null;
}) {
  const { evolutionConnected, setEvolutionConnection, modalReason, contacts, instancesStatus } =
    useChatStore();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
  const [copiedCode, setCopiedCode] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeEntered, setCodeEntered] = useState(false);
  const [hasSeenAwaitingState, setHasSeenAwaitingState] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [engineUser, setEngineUser] = useState<any>(null);

  const [tab, setTab] = useState<"existing" | "new">("new");
  const [existingInstances, setExistingInstances] = useState<any[]>([]);

  const [extName, setExtName] = useState("");
  const [extApiKey, setExtApiKey] = useState("");
  const [customName, setCustomName] = useState<string>("");

  const targetInstObj = targetInstanceName
    ? existingInstances.find((i) => i.id === targetInstanceName)
    : null;

  const liveStatus = targetInstanceName ? instancesStatus[targetInstanceName] : null;
  const isTargetConnected = targetInstanceName
    ? ((targetInstObj
        ? targetInstObj.status === "connected" ||
          targetInstObj.connection_status === "connected" ||
          targetInstObj.status === "connected_local" ||
          targetInstObj.connection_status === "connected_local" ||
          targetInstObj.status === "open" ||
          targetInstObj.connection_status === "open"
        : false) ||
        liveStatus === "connected" ||
        liveStatus === "connected_local" ||
        liveStatus === "open")
    : evolutionConnected;
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [customColor, setCustomColor] = useState<string>("#10b981");
  const [customSound, setCustomSound] = useState<string>("default");
  const [connectionStatusMessage, setConnectionStatusMessage] = useState<string | null>(null);
  const [activePollingId, setActivePollingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [engineGroups, setEngineGroups] = useState<any[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [groupMetadata, setGroupMetadata] = useState<any | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupSubject, setNewGroupSubject] = useState("");
  const [newGroupParticipants, setNewGroupParticipants] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);

  const [actionModal, setActionModal] = useState<{
    type: "subject" | "description" | "participants" | "settings" | "avatar" | "join" | "ephemeral";
    isOpen: boolean;
  } | null>(null);
  const [modalInput1, setModalInput1] = useState("");

  const existingInstancesRef = useRef(existingInstances);
  const activePollingIdRef = useRef(activePollingId);
  const loadingRef = useRef(loading);
  const pairingCodeRef = useRef(pairingCode);
  const pairingLoadingRef = useRef(pairingLoading);

  const [breadcrumbsLogs, setBreadcrumbsLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsub = useDevStore.subscribe((state) => {
      const relevant = state.logs
        .filter(l => l.source === 'EvolutionModal' || l.source === 'WhatsApp Pairing' || (l.message && l.message.includes('[MIGALHA')))
        .slice(-8)
        .map(l => {
          const match = l.message.match(/\[MIGALHA (?:PASSO )?(\d+)\/(\d+)\]/i) || l.message.match(/Passo (\d+)\/(\d+)/i);
          const step = match ? parseInt(match[1]) : 1;
          const total = match ? parseInt(match[2]) : 7;
          const cleanMsg = l.message.replace(/\[MIGALHA (?:PASSO )?\d+\/\d+\]\s*📍?\s*/gi, '').trim();
          return {
            id: l.id,
            step,
            total,
            message: cleanMsg,
            timestamp: new Date(l.timestamp).toLocaleTimeString(),
            type: l.type
          };
        });
      setBreadcrumbsLogs(relevant);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    existingInstancesRef.current = existingInstances;
  }, [existingInstances]);

  useEffect(() => {
    activePollingIdRef.current = activePollingId;
  }, [activePollingId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    pairingCodeRef.current = pairingCode;
  }, [pairingCode]);

  useEffect(() => {
    pairingLoadingRef.current = pairingLoading;
  }, [pairingLoading]);
  // Pré-preenche o número de telefone de pareamento
  useEffect(() => {
    if (activePollingId) {
      const currentInst = existingInstances.find((i) => i.id === activePollingId);
      if (currentInst?.phone_number) {
        setPairingPhone(currentInst.phone_number);
      } else {
        setPairingPhone("");
      }
    } else if (targetInstanceName) {
      const currentInst = existingInstances.find((i) => i.id === targetInstanceName);
      if (currentInst?.phone_number) {
        setPairingPhone(currentInst.phone_number);
      } else {
        setPairingPhone("");
      }
    } else {
      setPairingPhone("");
    }
  }, [activePollingId, existingInstances, targetInstanceName]);

  const INSTANCE_COLORS = [
    { value: "#10b981", label: "Esmeralda" },
    { value: "#3b82f6", label: "Azul" },
    { value: "#a855f7", label: "Roxo" },
    { value: "#f97316", label: "Laranja" },
    { value: "#f43f5e", label: "Rosa" },
    { value: "#06b6d4", label: "Ciano" },
  ];

  useEffect(() => {
    fetchExistingInstances();
  }, []);

  useEffect(() => {
    if (isOpen && targetInstanceName && !activePollingId) {
      const targetInst = existingInstances.find((i) => i.id === targetInstanceName || i.display_name === targetInstanceName) || { id: targetInstanceName };
      handleConnectExisting(targetInst, true);
    }
  }, [isOpen, targetInstanceName, activePollingId, existingInstances]);

  // Sincroniza a URL do navegador com a abertura do modal
  useEffect(() => {
    if (isOpen && targetInstanceName) {
      const targetPath = `/instances/${targetInstanceName}/settings`;
      if (window.location.pathname !== targetPath) {
        const prevPath = window.location.pathname + window.location.search;
        window.history.pushState({ prevPath }, '', targetPath);
      }
    }
  }, [isOpen, targetInstanceName]);

  // Fecha o modal caso o usuário utilize o botão Voltar do navegador
  useEffect(() => {
    if (!isOpen) return;
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  // Restaura a URL anterior quando o modal for fechado/desmontado
  useEffect(() => {
    return () => {
      const match = window.location.pathname.match(/\/instances\/[^/]+\/settings/);
      if (match) {
        const state = window.history.state;
        if (state && state.prevPath) {
          window.history.replaceState(null, '', state.prevPath);
        } else {
          window.history.replaceState(null, '', '/chat');
        }
      }
    };
  }, []);

  const fetchExistingInstances = async () => {
    try {
      const tenantId =
        localStorage.getItem("current_tenant_id") ||
        sessionStorage.getItem("current_tenant_id");
      if (!tenantId) return;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (data) {
        setExistingInstances(data);
        if (data.length === 0) setTab("new");
      }
    } catch (e) {}
  };

  const handleConnectExisting = async (inst: any, forceNew = false) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setQrBase64(null);
    setConnectionStatusMessage("Iniciando gerador de QR Code...");
    setCodeEntered(false);
    setActivePollingId(inst.id);

    useDevStore.getState().addBreadcrumb(1, 7, `Iniciando reconexão da instância '${inst.display_name || inst.id}'`, 'EvolutionModal', { instanceId: inst.id, forceNew });

    try {
      let targetInst = inst;
      if (!targetInst?.api_key || !targetInst?.display_name) {
        const { data: dbInst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .or(`id.eq.${inst.id},display_name.eq.${inst.id}`)
          .maybeSingle();
        if (dbInst) {
          targetInst = dbInst;
          setActivePollingId(dbInst.id);
        }
      }

      const liveStatus = instancesStatus[inst.id];
      const isConn =
        !forceNew && (
          targetInst.connection_status === "connected" ||
          targetInst.status === "connected" ||
          targetInst.connection_status === "connected_local" ||
          targetInst.status === "connected_local" ||
          targetInst.connection_status === "open" ||
          targetInst.status === "open" ||
          liveStatus === "connected" ||
          liveStatus === "connected_local" ||
          liveStatus === "open"
        );

      if (isConn) {
        useDevStore.getState().addBreadcrumb(7, 7, `Instância já estava previamente conectada: ${targetInst.id}`, 'EvolutionModal');
        useChatStore.getState().updateTenantInstance(inst.id);
        setEvolutionConnection(true, inst.id);
        setLoading(false);
        return;
      }

      const cId =
        localStorage.getItem("current_tenant_id") ||
        sessionStorage.getItem("current_tenant_id");
      if (!cId) throw new Error("Tenant não identificado");

      useDevStore.getState().addBreadcrumb(2, 7, `Enviando requisição de ignição para o servidor Node/Baileys...`, 'EvolutionModal', { tenantId: cId, instanceId: targetInst.id });
      await createInstance(cId, targetInst.id, targetInst.api_key || "", true);
    } catch (err: any) {
      const msg = err?.message || "";
      useDevStore.getState().addLog({
        type: 'error',
        message: `[MIGALHA ERRO 2/7] Falha ao comunicar com motor: ${msg}`,
        source: 'EvolutionModal',
        details: err
      });
      if (msg === "Failed to fetch" || msg.includes("network") || msg.includes("fetch")) {
        console.warn("[EvolutionModal] Oscilação temporária de rede ao acionar motor:", err);
      } else {
        setError(msg || "Erro ao conectar motor.");
      }
      setLoading(false);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    const cId =
      localStorage.getItem("current_tenant_id") ||
      sessionStorage.getItem("current_tenant_id");
    if (!cId) return;
    setLoading(true);
    setError(null);
    try {
      // Tenta deslogar da memória para limpeza, mas ignora se falhar
      const inst = existingInstances.find((i) => i.id === id);
      const key = inst?.api_key || "";
      await logoutEngine(cId, id, key).catch(() => {});

      const { error: dbErr } = await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("id", id);
      if (dbErr) throw dbErr;

      setConfirmDeleteId(null);
      await fetchExistingInstances();
      // Se a instância apagada estiver conectada agora, damos logout local
      if (useChatStore.getState().connectedInstanceName === id) {
        setEvolutionConnection(false, null);
      }
    } catch (err: any) {
      setError("Erro ao excluir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setQrBase64(null);
    setConnectionStatusMessage(null);

    const nameStr = customName.trim();

    if (!nameStr) {
      setError("O Nome da Instância é OBRIGATÓRIO (Ex: WhatsApp Vendas).");
      setLoading(false);
      return;
    }

    let finalApiKey = customApiKey.trim();
    if (!finalApiKey) {
      finalApiKey =
        "sk_" +
        Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
    }

    try {
      const newEngineId = uuidv4();
      const cId =
        localStorage.getItem("current_tenant_id") ||
        sessionStorage.getItem("current_tenant_id");
      if (!cId) throw new Error("Tenant não identificado");

      const { error: dbErr } = await supabase
        .from("whatsapp_instances")
        .insert({
          id: newEngineId,
          display_name: nameStr,
          status: "offline",
          tenant_id: cId,
          api_key: finalApiKey,
          color: customColor,
          notification_sound: customSound,
        });

      if (dbErr)
        throw new Error("Falha ao registrar instância. " + dbErr.message);

      useChatStore.getState().updateTenantInstance(newEngineId);

      setActivePollingId(newEngineId);
      await createInstance(cId, newEngineId, finalApiKey);

      setCustomName("");
      setCustomApiKey("");
      setCustomColor("#10b981");
      setCustomSound("default");
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "";
      if (msg === "Failed to fetch" || msg.includes("network") || msg.includes("fetch")) {
        console.warn("[EvolutionModal] Oscilação temporária de rede ao criar instância:", err);
      } else {
        setError(msg || "Erro de comunicação com o sistema.");
      }
      setLoading(false);
    }
  };

  // AÇÃO DE SUCESSO COMPARTILHADA
  const handleSuccess = (instanceIdToUse?: string | null) => {
    const finalId = instanceIdToUse || activePollingId || targetInstanceName || useChatStore.getState().connectedInstanceName;
    setSuccessMsg("Conectado com sucesso! Preparando ambiente...");
    setLoading(false);
    setQrBase64(null);
    setActivePollingId(null);
    setConnectionStatusMessage(null);
    setCodeEntered(false);
    if (finalId) {
      setEvolutionConnection(true, finalId);
      useChatStore.getState().syncEvolutionContacts(finalId);
    }
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 2500);
  };

  // SUBSCRIPTION DO REALTIME DE CONEXÃO
  useEffect(() => {
    if (!activePollingId) return;

    const tenantId =
      localStorage.getItem("current_tenant_id") ||
      sessionStorage.getItem("current_tenant_id");
    const channelName = `tenant:${tenantId}:instance:${activePollingId}`;

    useDevStore.getState().addBreadcrumb(3, 7, `Inscrito no canal Realtime Supabase: ${channelName}`, 'EvolutionModal');
    console.log(`[Realtime] Inscrito no canal: ${channelName} | Modo: ${connectMode}`);
    const channel = supabase.channel(channelName);

    // Timeout de segurança contra loop infinito
    const timeoutId = setTimeout(() => {
      if (loadingRef.current || activePollingIdRef.current) {
        useDevStore.getState().addLog({
          type: 'error',
          message: `[MIGALHA ERRO TIMEOUT] O motor demorou mais de 3 minutos para responder`,
          source: 'EvolutionModal'
        });
        setError(
          "Erro: Timeout de Conexão. O Motor demorou muito para responder. Verifique se o seu celular tem acesso à internet ou reinicie a conexão.",
        );
        setLoading(false);
        setQrBase64(null);
        setActivePollingId(null);
        setConnectionStatusMessage(null);
      }
    }, 180000); // 3 minutos timeout

    let pollInterval: any;

    channel
      .on("broadcast", { event: "instance.qr_updated" }, (payload: any) => {
        if (payload.payload?.qr_code) {
          useDevStore.getState().addBreadcrumb(4, 7, `QR Code recebido via Realtime e renderizado na tela`, 'EvolutionModal');
          setQrBase64(payload.payload.qr_code);
          setLoading(false);
          if (pairingCodeRef.current) {
            setConnectionStatusMessage("Chave de acesso requerida! Escaneie o QR Code no celular...");
          } else {
            setConnectionStatusMessage("QR Code pronto! Aguardando leitura no seu celular...");
          }
        }
      })
      .on("broadcast", { event: "instance.status" }, (payload: any) => {
        const st = payload.payload?.status;
        const lastError = payload.payload?.last_error;

        useDevStore.getState().addBreadcrumb(5, 7, `Broadcast de status recebido: [${st}]`, 'EvolutionModal', payload.payload);

        if (lastError && (lastError.includes("Chave de Acesso") || lastError.includes("Passkey") || lastError.includes("PASSKEY_BLOCKED"))) {
          useDevStore.getState().addLog({
            type: 'error',
            message: `[MIGALHA ERRO PASSKEY] ${lastError}`,
            source: 'EvolutionModal'
          });
          setError(lastError);
          setLoading(false);
          setQrBase64(null);
          setActivePollingId(null);
          setPairingCode(null);
          setConnectionStatusMessage(null);
          setCodeEntered(false);
          return;
        }

        if (st === "offline") {
          if (pairingCodeRef.current) {
            console.log("[Realtime] Ignorando status offline na conexão via Pairing Code (transição esperada)");
            return;
          }
          useDevStore.getState().addLog({
            type: 'error',
            message: `[MIGALHA ERRO OFFLINE] Instância declarou status offline: ${payload.payload?.reason || 'sem motivo informado'}`,
            source: 'EvolutionModal'
          });
          setError(
            payload.payload?.reason
              ? `Falha com código: ${payload.payload.reason}`
              : "A conexão caiu ou foi rejeitada.",
          );
          setLoading(false);
          setQrBase64(null);
          setActivePollingId(null);
          setConnectionStatusMessage(null);
        } else if (st === "connecting" || st === "qr_ready") {
          if (pairingCodeRef.current) {
            if (pairingCodeRef.current && !pairingLoadingRef.current) {
              if (payload.payload?.pairingSuccess && (payload.payload?.registered === true || payload.payload?.authenticated === true)) {
                useDevStore.getState().addBreadcrumb(6, 7, `Código digitado no celular! Vinculando dispositivo...`, 'EvolutionModal');
                setConnectionStatusMessage("Código digitado no celular! Vinculando dispositivo...");
              } else {
                setConnectionStatusMessage("Aguardando pareamento no celular...");
              }
            }
          } else {
            setConnectionStatusMessage("Escaneie o QR Code no seu WhatsApp.");
          }
        } else if ((st === "connected" || st === "connected_local") && (payload.payload?.authenticated === true || payload.payload?.is_authenticated === true) && !qrBase64Ref.current) {
          useDevStore.getState().addBreadcrumb(6, 7, `Conexão efetuada no celular! Finalizando vínculo...`, 'EvolutionModal');
          useDevStore.getState().addBreadcrumb(7, 7, `Instância autenticada e operacional (${st})`, 'EvolutionModal');
          handleSuccess();
        }
      })
      .subscribe((status) => {
        console.log(`[Realtime] Status inscrição modal:`, status);
        if (status === 'SUBSCRIBED') {
          pollInterval = setInterval(async () => {
            try {
              if(!tenantId || !activePollingIdRef.current) return;
              const currInst = existingInstancesRef.current.find((i) => i.id === activePollingIdRef.current);
              if(!currInst) return;
              
              const st = await fetchEngineStatus(tenantId, activePollingIdRef.current, currInst.api_key || "");
              const lastError = st?.data?.last_error || st?.data?.whatsapp_instance_runtime?.last_error;

              if (lastError && (lastError.includes("Chave de Acesso") || lastError.includes("Passkey") || lastError.includes("PASSKEY_BLOCKED"))) {
                setError(lastError);
                setLoading(false);
                setQrBase64(null);
                setActivePollingId(null);
                setPairingCode(null);
                setConnectionStatusMessage(null);
                setCodeEntered(false);
                clearInterval(pollInterval);
                return;
              }

              const runtimeQr = st?.data?.whatsapp_instance_runtime?.qr_code || st?.data?.qr_code || st?.qr_code || st?.qr_base64;
              if (runtimeQr) {
                setQrBase64(runtimeQr);
                setLoading(false);
                setError(null);
              }

              const isAuth = st?.data?.is_authenticated === true || st?.data?.authenticated === true;
              const isPendingPairingCode = Boolean(pairingCodeRef.current) && st?.data?.whatsapp_instance_runtime?.pairing_code !== 'CONNECTED_PENDING_SYNC';
              if ((st?.data?.status === "connected" || st?.data?.status === "connected_local") && isAuth && !runtimeQr && !isPendingPairingCode) {
                useDevStore.getState().addBreadcrumb(6, 7, `Conexão efetuada no celular! Finalizando vínculo...`, 'EvolutionModal');
                useDevStore.getState().addBreadcrumb(7, 7, `Instância autenticada e operacional (${st?.data?.status})`, 'EvolutionModal');
                handleSuccess();
                clearInterval(pollInterval);
              } else if (st?.data?.status === "connecting" || st?.data?.status === "qr_ready" || runtimeQr) {
                if (pairingCodeRef.current) {
                  if (pairingCodeRef.current && !pairingLoadingRef.current) {
                    if (st?.data?.whatsapp_instance_runtime?.pairing_code === 'CONNECTED_PENDING_SYNC') {
                      setConnectionStatusMessage("Código digitado no celular! Vinculando dispositivo...");
                    } else {
                      setConnectionStatusMessage("Aguardando pareamento no celular...");
                    }
                  }
                } else {
                  setConnectionStatusMessage("Escaneie o QR Code no seu WhatsApp.");
                }
              }
            } catch (e) {
              // ignora erro silencioso no polling
            }
          }, 1500);
        }
      });

    return () => {
      clearTimeout(timeoutId);
      if (pollInterval) clearInterval(pollInterval);
      supabase.removeChannel(channel);
      // Evita oscilação de tela: apenas limpa se mudou de fato de polling ID (modal cancelado/fechado)
      if (!activePollingIdRef.current) {
        setConnectionStatusMessage(null);
      }
    };
  }, [activePollingId, connectMode]);

  useEffect(() => {
    if (activePollingId && !isTargetConnected) {
      const inst = existingInstances.find(i => i.id === activePollingId);
      if (inst && inst.phone_number && !pairingPhone) {
        setPairingPhone(inst.phone_number);
      }
    }
  }, [activePollingId, existingInstances, isTargetConnected]);

  const handleRequestPairingCode = async (id: string, apiKey?: string, overridePhone?: string) => {
    const phoneToUse = overridePhone || pairingPhone;
    if (!phoneToUse) {
      alert("Por favor, digite o número do telefone com código do país (ex: 5511991649959).");
      return;
    }
    
    setQrBase64(null);
    
    const logger = useDevStore.getState();
    logger.setShowServerLogs(true);
    
    logger.addLog({
      type: 'info',
      message: `==================================================`,
      source: 'WhatsApp Pairing'
    });
    logger.addLog({
      type: 'info',
      message: `INICIANDO SOLICITAÇÃO DE PAIRING CODE PARA O NÚMERO: ${phoneToUse}`,
      source: 'WhatsApp Pairing'
    });
    
    setPairingLoading(true);
    setPairingCode(null);
    setCodeEntered(false);
    setHasSeenAwaitingState(false);
    setConnectionStatusMessage(null);
    setError(null);
    
    try {
      const tenantId = localStorage.getItem("current_tenant_id") || sessionStorage.getItem("current_tenant_id");
      const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || "http://localhost:9000";
      
      logger.addLog({
        type: 'info',
        message: `Passo 1/3: Comunicando com API do gateway: ${engineUrl}/api/v1/instances/${id}/pairing-code`,
        source: 'WhatsApp Pairing'
      });
      
      const res = await fetch(`${engineUrl}/api/v1/instances/${id}/pairing-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        },
        body: JSON.stringify({ phoneNumber: phoneToUse, force: true })
      });
      
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.alreadyConnected) {
          logger.addLog({
            type: 'info',
            message: `Instância já conectada: ${data.message || 'A conexão com o WhatsApp já está ativa.'}`,
            source: 'WhatsApp Pairing',
            details: data
          });
          setEvolutionConnection(true, id);
          useChatStore.getState().setInstanceStatus(id, 'connected');
          setConnectionStatusMessage("Esta instância já está conectada ao WhatsApp.");
          setLoading(false);
          return;
        }

        if (data.code) {
          logger.addLog({
            type: 'success',
            message: `Passo 2/3: Código gerado com sucesso: "${data.code}"! Por favor, insira este código no celular.`,
            source: 'WhatsApp Pairing',
            details: data
          });
          pairingCodeRef.current = data.code;
          setPairingCode(data.code);
          // Salva o número associado no banco apenas se tiver um número válido
          const cleanPhone = pairingPhone ? pairingPhone.replace(/\D/g, '') : '';
          if (cleanPhone && cleanPhone.length >= 7) {
            await supabase.from('whatsapp_instances').update({ phone_number: cleanPhone }).eq('id', id);
          }
          fetchExistingInstances();
          pollPairingStatus(id, apiKey);
        } else {
          const errMsg = data.error || "O servidor não retornou um código de pareamento válido.";
          logger.addLog({
            type: 'error',
            message: `Falha ao obter código: ${errMsg}`,
            source: 'WhatsApp Pairing',
            details: data
          });
          setError(errMsg);
        }
      } else {
        const errMsg = data.error || "Erro ao solicitar código de pareamento.";
        logger.addLog({
          type: 'error',
          message: `Falha na resposta da API ao gerar código: ${errMsg}`,
          source: 'WhatsApp Pairing',
          details: data
        });
        if (res.status === 400 && errMsg.includes('inicializando a ignição')) {
          setConnectionStatusMessage("Sincronizando ignição com WhatsApp... Obtendo código em instantes...");
          setTimeout(() => {
            handleRequestPairingCode();
          }, 1500);
        } else {
          setError(errMsg);
        }
      }
    } catch (err: any) {
      logger.addLog({
        type: 'warn',
        message: `Oscilação temporária de rede ao solicitar código de pareamento: ${err.message || err}`,
        source: 'WhatsApp Pairing'
      });
      const msg = err?.message || "";
      if (msg === "Failed to fetch" || msg.includes("network") || msg.includes("fetch")) {
        // Ignora erro genérico de rede para não poluir a tela enquanto o QR Code carrega
      } else {
        setError("Erro de comunicação com o servidor ao gerar o código.");
      }
    } finally {
      setPairingLoading(false);
    }
  };

  const pollPairingStatus = (id: string, apiKey?: string) => {
    const tenantId = localStorage.getItem("current_tenant_id") || sessionStorage.getItem("current_tenant_id");
    const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || "http://localhost:9000";
    const logger = useDevStore.getState();
    
    logger.addLog({
      type: 'info',
      message: `Passo 3/3: Iniciando polling de status da instância no servidor de produção para detectar vinculação...`,
      source: 'WhatsApp Pairing'
    });
    
    const interval = setInterval(async () => {
      try {
        if(!tenantId || !activePollingId) return;
        const res = await fetch(`${engineUrl}/api/v1/instances/${id}/status`, {
            headers: { 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            }
        });
        const respJson = await res.json();
        const data = respJson.data;
        const lastError = data?.last_error || data?.whatsapp_instance_runtime?.last_error;
        
        logger.addLog({
          type: 'info',
          message: `[Poll Status] Estado da Engine: "${data?.status || 'desconhecido'}" | Erro registrado no nó: "${data?.last_error || 'nenhum'}"`,
          source: 'WhatsApp Pairing',
          details: data
        });

        if (lastError && (lastError.includes("Chave de Acesso") || lastError.includes("Passkey") || lastError.includes("PASSKEY_BLOCKED"))) {
          setError(lastError);
          setLoading(false);
          setQrBase64(null);
          setActivePollingId(null);
          setPairingCode(null);
          setConnectionStatusMessage(null);
          setCodeEntered(false);
          clearInterval(interval);
          return;
        }
        
        if (data && (data.status === 'connected' || data.status === 'connected_local')) {
          logger.addLog({
            type: 'success',
            message: `SUCESSO: Conexão com o WhatsApp estabelecida! O celular confirmou o pareamento.`,
            source: 'WhatsApp Pairing'
          });
          setCodeEntered(true);
          handleSuccess();
          clearInterval(interval);
        } else if (data && data.status === 'connecting') {
          if (pairingCodeRef.current && !pairingLoadingRef.current) {
            if (data.whatsapp_instance_runtime?.pairing_code === 'CONNECTED_PENDING_SYNC' || data.pairingSuccess || (data.last_error && data.last_error.includes('515'))) {
              setCodeEntered(true);
              setConnectionStatusMessage("Pareamento confirmado no celular! Sincronizando chaves e liberando acesso ao sistema...");
            } else {
              setConnectionStatusMessage("Aguardando você digitar o código no WhatsApp do celular...");
            }
          }
        }
      } catch (e: any) {
        logger.addLog({
          type: 'warn',
          message: `Aviso no polling: falha temporária ao obter status da Engine (${e.message || e})`,
          source: 'WhatsApp Pairing'
        });
      }
    }, 2000);

    setTimeout(() => { 
      clearInterval(interval);
      setConnectionStatusMessage("Tempo de pareamento esgotado (3 min). Clique abaixo para gerar um novo código de 8 dígitos.");
      setPairingLoading(false);
      logger.addLog({
        type: 'info',
        message: `TIMEOUT: O tempo limite de 180s para confirmar o código no celular expirou. Clique em 'Gerar Novo Código' para continuar.`,
        source: 'WhatsApp Pairing'
      });
    }, 180000);
  };

  useEffect(() => {
    // If modal opens and we are marked as connected, let's load user from v2 status
    if (evolutionConnected && useChatStore.getState().connectedInstanceName) {
      const cId =
        localStorage.getItem("current_tenant_id") ||
        sessionStorage.getItem("current_tenant_id");
      const currInst = existingInstances.find(
        (i) => i.id === useChatStore.getState().connectedInstanceName,
      );
      if (cId && currInst && currInst.api_key) {
        fetchEngineStatus(
          cId,
          useChatStore.getState().connectedInstanceName!,
          currInst.api_key,
        )
          .then((st) => {
            if (
              (st?.data?.status === "connected" || st?.data?.status === "connected_local") &&
              st?.data?.whatsapp_instance_runtime?.user_profile
            ) {
              setEngineUser(st.data.whatsapp_instance_runtime.user_profile);
            } else if (st?.data?.status !== "connected" && st?.data?.status !== "connected_local") {
              setEvolutionConnection(false, null);
            }
          })
          .catch(() => {
            useChatStore
              .getState()
              .setModalReason(
                "Servidor Node Offline - A API principal não está respondendo. O serviço pode estar em manutenção ou indisponível.",
              );
          });
      }
    }
  }, [evolutionConnected]);

  if (isOpen === false) return null;

  const displayNameToUse = targetInstObj
    ? targetInstObj.display_name
    : engineUser?.name || "Motor Ativado";

  const navigate = useNavigate();
  const { 
    sessions: wacallsSessions = [], 
    qrCodes: wacallsQrCodes = {},
    createSession: createWacallsSession,
    pairSession: pairWacallsSession,
    logoutSession: logoutWacallsSession,
    fetchSessions: fetchWacallsSessions
  } = useWaCallsStore();
  
  const [showWacallsQr, setShowWacallsQr] = useState<string | null>(null);

  const [configTab, setConfigTab] = useState<"geral" | "grupos" | "voip">("geral");

  // Busca as sessões de voz do WaCalls ao carregar ou alternar para a aba VoIP
  useEffect(() => {
    if (isOpen && configTab === "voip") {
      fetchWacallsSessions().catch((err) => {
        console.error("Erro ao buscar sessões do WaCalls:", err);
      });
    }
  }, [isOpen, configTab]);

  const handleStartWacallsPair = async (sid: string) => {
    setShowWacallsQr(sid);
    try {
      const sess = (wacallsSessions || []).find(s => s && s.id === sid);
      if (sess) {
        await pairWacallsSession(sid);
      } else {
        await createWacallsSession(sid);
        await pairWacallsSession(sid);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao iniciar pareamento de chamadas de voz.");
      setShowWacallsQr(null);
    }
  };

  const handleCancelWacallsPair = (sid: string) => {
    setShowWacallsQr(null);
  };

  const handleDisconnectWacalls = async (sid: string) => {
    if (window.confirm("Desativar as chamadas de voz neste número? O dispositivo virtual de ligações pareado no WhatsApp será desconectado.")) {
      try {
        await logoutWacallsSession(sid);
      } catch (err: any) {
        alert(err.message || "Erro ao desativar chamadas de voz.");
      }
    }
  };

  const handleTestWacallsConnection = async (sid: string, instName: string) => {
    const logger = useDevStore.getState();
    
    logger.addLog({
      type: 'info',
      message: `==================================================`,
      source: 'WaCalls Diagnostic'
    });
    logger.addLog({
      type: 'info',
      message: `INICIANDO DIAGNÓSTICO DE VOZ (WaCalls) PARA A INSTÂNCIA: "${instName}" (${sid})`,
      source: 'WaCalls Diagnostic'
    });

    try {
      logger.addLog({
        type: 'info',
        message: `Passo 1/5: Testando resposta do Backend Node.js local...`,
        source: 'WaCalls Diagnostic'
      });
      
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || localStorage.getItem('tenantId');
      const nodeStatusStart = Date.now();
      const nodeResponse = await fetch(`${ENGINE_URL}/api/v1/instances/${sid}/status`, {
        headers: {
          'x-tenant-id': tenantId || ''
        }
      }).catch(() => null);
      
      if (nodeResponse && nodeResponse.ok) {
        logger.addLog({
          type: 'success',
          message: `✔ Backend Node.js respondendo na porta 9000! Latência: ${Date.now() - nodeStatusStart}ms`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'error',
          message: `✖ Falha ao conectar no Backend Node.js (${ENGINE_URL}). Verifique se a porta 9000 está ativa!`,
          source: 'WaCalls Diagnostic'
        });
      }

      logger.addLog({
        type: 'info',
        message: `Passo 2/5: Testando endpoint de sessões WaCalls no Backend...`,
        source: 'WaCalls Diagnostic'
      });
      
      const sessions = await fetchWacallsSessions().catch(() => null);
      if (sessions) {
        logger.addLog({
          type: 'success',
          message: `✔ Sucesso ao buscar sessões do WaCalls Go! Retornadas ${sessions.length} sessões ativas.`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'error',
          message: `✖ Falha de comunicação com o WaCalls Go (porta 8080) através do proxy do backend. Verifique se o servidor Go está ativo!`,
          source: 'WaCalls Diagnostic'
        });
      }

      logger.addLog({
        type: 'info',
        message: `Passo 3/5: Verificando se a instância atual tem sessão criada no WaCalls...`,
        source: 'WaCalls Diagnostic'
      });
      const sess = (sessions || []).find(s => s.id === sid);
      if (sess) {
        logger.addLog({
          type: 'success',
          message: `✔ Sessão de VoIP encontrada no WaCalls! Estado: ${sess.state} | Pareado: ${sess.paired ? 'SIM' : 'NÃO'}`,
          source: 'WaCalls Diagnostic',
          details: sess
        });
      } else {
        logger.addLog({
          type: 'warn',
          message: `⚠ Nenhuma sessão VoIP ativa encontrada para esta instância no WaCalls Go.`,
          source: 'WaCalls Diagnostic'
        });
      }

      logger.addLog({
        type: 'info',
        message: `Passo 4/5: Verificando a conexão do canal de eventos em tempo real (SSE)...`,
        source: 'WaCalls Diagnostic'
      });
      
      const isSseConnected = useWaCallsStore.getState().isConnectedSSE;
      if (isSseConnected) {
        logger.addLog({
          type: 'success',
          message: `✔ Canal SSE de voz está CONECTADO e pronto para receber eventos!`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'error',
          message: `✖ Canal SSE de voz está DESCONECTADO no frontend. Verifique os logs de background!`,
          source: 'WaCalls Diagnostic'
        });
      }

      logger.addLog({
        type: 'info',
        message: `Passo 5/5: Consolidando status final...`,
        source: 'WaCalls Diagnostic'
      });

      if (nodeResponse?.ok && sessions && isSseConnected) {
        logger.addLog({
          type: 'success',
          message: `🎉 DIAGNÓSTICO CONCLUÍDO COM SUCESSO! A infraestrutura local do WaCalls está 100% saudável.`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'warn',
          message: `⚠ Diagnóstico concluído com alguns alertas. Verifique os passos acima!`,
          source: 'WaCalls Diagnostic'
        });
      }

    } catch (e: any) {
      logger.addLog({
        type: 'error',
        message: `✖ Exceção crítica durante o diagnóstico: ${e.message || e}`,
        source: 'WaCalls Diagnostic'
      });
    }
  };

  const [savingParticipants, setSavingParticipants] = useState(false);

  const handleSaveGroupToCRM = async () => {
    if (!selectedGroup || !groupMetadata || !groupMetadata.participants) return;
    
    if (!confirm(`Deseja salvar/atualizar ${groupMetadata.participants.length} participantes no CRM?`)) return;
    
    setSavingParticipants(true);
    try {
      const cId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!cId) throw new Error("Tenant não encontrado");

      const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', cId).single();
      let settings = tenantData?.settings || {};
      let contactGroups = settings.contactGroups || [];
      
      const tagPrefix = `(Grupo WhatsApp) `;
      const expectedTagName = `${tagPrefix}${selectedGroup.subject}`;
      let targetTag = contactGroups.find((g: any) => g.name === expectedTagName);
      
      if (!targetTag) {
        targetTag = {
          id: crypto.randomUUID(),
          name: expectedTagName,
          color: '#10b981'
        };
        contactGroups.push(targetTag);
        settings.contactGroups = contactGroups;
        
        await supabase.from('tenants').update({ settings }).eq('id', cId);
        useChatStore.getState().fetchTenantInfo(cId);
      }

      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, phone, tags')
        .eq('tenant_id', cId);

      const existingMap = new Map();
      if (existingContacts) {
        existingContacts.forEach(c => {
          if (c.phone) {
            existingMap.set(c.phone, c);
          }
        });
      }

      const toInsert = [];
      const toUpdate = [];
      const parts = groupMetadata.participants;

      for (const p of parts) {
        const num = p.id.split('@')[0];
        const pName = p.notify || p.name || `+${num}`;
        
        const existing = existingMap.get(num);
        if (existing) {
          const currentTags = existing.tags || [];
          if (!currentTags.includes(targetTag.id)) {
            toUpdate.push({
              id: existing.id,
              tags: [...currentTags, targetTag.id]
            });
          }
        } else {
          toInsert.push({
            id: crypto.randomUUID(),
            tenant_id: cId,
            name: pName,
            phone: num,
            whatsapp_jid: p.id,
            tags: [targetTag.id]
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('contacts').insert(toInsert);
        if (error) throw error;
      }

      for (const upd of toUpdate) {
        await supabase.from('contacts').update({ tags: upd.tags }).eq('id', upd.id);
      }

      alert(`${parts.length} participantes processados com sucesso!\n\nInseridos: ${toInsert.length}\nAtualizados: ${toUpdate.length}\nEtiqueta: ${expectedTagName}`);

    } catch (e: any) {
      alert("Erro ao salvar contatos: " + e.message);
    } finally {
      setSavingParticipants(false);
    }
  };

  const isExpanded = isTargetConnected && configTab === 'grupos';

  useEffect(() => {
    if (connectionStatusMessage === "Aguardando pareamento no celular...") {
      setHasSeenAwaitingState(true);
    }
  }, [connectionStatusMessage]);

  useEffect(() => {
    if (
      pairingCode &&
      connectionStatusMessage &&
      connectionStatusMessage.includes("digitado no celular")
    ) {
      setCodeEntered(true);
    }
  }, [connectionStatusMessage, pairingCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-300">
      <div className={`bg-white/90 dark:bg-[#0b141a]/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] w-full flex flex-col border border-slate-200/50 dark:border-white/10 relative transition-all duration-500 overflow-hidden ${isExpanded ? 'max-w-6xl h-[95vh]' : 'max-w-md max-h-[92vh]'}`}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all bg-slate-100 dark:bg-zinc-800/60 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center border border-slate-200/50 dark:border-white/10 shadow-sm active:scale-90 hover:rotate-90 duration-200">
          <X size={16} />
        </button>
        <div className={`w-full overflow-y-auto styled-scrollbar p-5 sm:p-6 pt-7 flex flex-col ${isExpanded ? 'items-stretch' : 'items-center'} h-full relative`}>
        
        {!isExpanded && !activePollingId && (
           <h2 className="text-xl font-black tracking-tight text-slate-800 dark:text-white mb-1 flex items-center gap-2 self-center font-sans">
             <Smartphone className="text-emerald-500 w-5 h-5"/> {targetInstObj ? targetInstObj.display_name : 'App Connect'}
           </h2>
        )}

          {!activePollingId && (
            modalReason ? (
              <p className="text-xs font-semibold text-center text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl my-2 border border-amber-500/20 max-w-full">
                {modalReason}
              </p>
            ) : (
              <span className="text-[10px] text-center text-slate-500 dark:text-slate-400 mb-5 mt-1 font-bold uppercase tracking-wider bg-slate-100 dark:bg-zinc-800/40 py-1 px-3.5 rounded-full border border-slate-200/40 dark:border-white/5">
                Motor Inteligente
              </span>
            )
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs mb-4 flex items-start w-full gap-2 transition-all">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl text-sm font-semibold mb-4 flex items-center justify-center w-full gap-2 transition-all animate-in zoom-in duration-300">
              <CheckCircle size={20} className="animate-pulse" />
              <span>{successMsg}</span>
            </div>
          )}

          {isTargetConnected && !successMsg ? (
            <div className="flex flex-col w-full animate-in zoom-in slide-in-from-bottom-4 duration-500 delay-150">
              <div className="flex flex-col items-center bg-gradient-to-b from-emerald-500/10 to-transparent p-6 rounded-3xl border border-emerald-500/10 mb-2 relative overflow-hidden backdrop-blur-md w-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                {engineUser && !targetInstObj ? (
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] border border-emerald-500/30 flex items-center justify-center mb-3 overflow-hidden">
                    <UserCircle2
                      size={32}
                      className="text-emerald-500 drop-shadow"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] border border-emerald-500/30 flex items-center justify-center mb-3">
                    <CheckCircle
                      size={32}
                      className="text-emerald-500 drop-shadow"
                    />
                  </div>
                )}

                <h3 className="font-extrabold text-base text-slate-800 dark:text-emerald-400 tracking-tight">
                  {displayNameToUse}
                </h3>

                {engineUser?.id && (
                  <p className="text-[10px] bg-white/50 dark:bg-black/40 px-2 py-0.5 rounded text-slate-500 mt-1 font-mono border border-slate-200/50 dark:border-white/5">
                    +{engineUser.id.split(":")[0]}
                  </p>
                )}

                <div className="flex justify-center items-center gap-2 mt-3 text-xs font-semibold">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/25 shadow-sm">
                    <Signal size={12} className="animate-pulse" /> NATIVO BAILEYS CORE
                  </span>
                </div>
              </div>

              {/* Abas de Configuração */}
              <div className="flex w-full bg-slate-100 dark:bg-zinc-800/40 border border-slate-200/50 dark:border-white/5 rounded-2xl p-1 mt-4 mb-2">
                <button
                  onClick={() => setConfigTab("geral")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${configTab === "geral" ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Geral
                </button>
                <button
                  onClick={() => setConfigTab("grupos")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${configTab === "grupos" ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Grupos & Ops
                </button>
                <button
                  onClick={() => setConfigTab("voip")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${configTab === "voip" ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Ligações de Voz
                </button>
              </div>

              {configTab === "geral" && (
                <div className="w-full animate-in fade-in slide-in-from-left-4 duration-300">
                  {(() => {
                    const activeInst = targetInstObj || existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                    if (!activeInst) return null;
                    return (
                      <div className="w-full mt-4 flex flex-col bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-5 rounded-3xl shadow-sm gap-3">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-white/5">
                          <Activity size={16} className="text-emerald-500" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                            WhatsApp Edge BR
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="flex flex-col bg-white dark:bg-zinc-900 border border-slate-100 dark:border-white/5 p-3 rounded-2xl">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">IP de Saída</span>
                            <span className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                              {activeInst.egress_ip || "Desconhecido"}
                            </span>
                          </div>
                          <div className="flex flex-col bg-white dark:bg-zinc-900 border border-slate-100 dark:border-white/5 p-3 rounded-2xl">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Localização</span>
                            <span className="font-bold mt-1 text-slate-800 dark:text-slate-200">
                              {activeInst.egress_country ? `${activeInst.egress_country} (${activeInst.egress_city || "BR"})` : "Brasil (Simulado)"}
                            </span>
                          </div>
                          <div className="flex flex-col bg-white dark:bg-zinc-900 border border-slate-100 dark:border-white/5 p-3 rounded-2xl">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Reconexões</span>
                            <span className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                              {activeInst.reconnect_attempts || 0} / 5
                            </span>
                          </div>
                          <div className="flex flex-col bg-white dark:bg-zinc-900 border border-slate-100 dark:border-white/5 p-3 rounded-2xl">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Modo de Segurança</span>
                            <span className={`font-bold mt-1 ${activeInst.safety_mode ? "text-amber-500" : "text-emerald-500"}`}>
                              {activeInst.safety_mode ? "ATIVADO" : "INATIVO"}
                            </span>
                          </div>
                        </div>

                        {activeInst.last_error && (
                          <div className="mt-2 text-[11px] bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 text-red-500 p-3 rounded-xl flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <span className="flex-1 text-left">{activeInst.last_error}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="w-full mt-4 flex flex-col items-center bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-wider">
                      Cor da Instância
                    </p>
                    <div className="flex gap-2">
                      {INSTANCE_COLORS.map((color) => (
                        <button
                          key={color.value}
                          onClick={async () => {
                            const cId =
                              localStorage.getItem("current_tenant_id") ||
                              sessionStorage.getItem("current_tenant_id");
                            if (!cId) return;
                            const tInstanceId = targetInstObj
                              ? targetInstObj.id
                              : useChatStore.getState().connectedInstanceName;
                            if (!tInstanceId) return;

                            const { error } = await supabase
                              .from("whatsapp_instances")
                              .update({ color: color.value })
                              .eq("id", tInstanceId)
                              .eq("tenant_id", cId);

                            if (!error) {
                              fetchExistingInstances();
                            }
                          }}
                          className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${targetInstObj?.color === color.value ? "ring-2 ring-offset-2 ring-emerald-500 scale-110 dark:ring-offset-zinc-950" : "hover:scale-110 border border-black/10 dark:border-white/10"}`}
                          style={{ backgroundColor: color.value }}
                          title={color.label}
                        >
                          {targetInstObj?.color === color.value && (
                            <CheckCircle
                              size={14}
                              className="text-white drop-shadow-md"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full mt-3 flex flex-col items-center bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2.5 uppercase tracking-wider">
                      Som de Notificação
                    </p>
                    <div className="relative flex items-center w-full max-w-[200px]">
                      <span className="absolute left-3 pointer-events-none text-slate-400 dark:text-slate-500">
                        <Volume2 size={14} />
                      </span>
                      <select
                        value={targetInstObj?.notification_sound || "default"}
                        onChange={async (e) => {
                          const val = e.target.value;
                          playNotificationSound(val);
                          const cId =
                            localStorage.getItem("current_tenant_id") ||
                            sessionStorage.getItem("current_tenant_id");
                          if (!cId) return;
                          const tInstanceId = targetInstObj
                            ? targetInstObj.id
                            : useChatStore.getState().connectedInstanceName;
                          if (!tInstanceId) return;

                          const { error } = await supabase
                            .from("whatsapp_instances")
                            .update({ notification_sound: val })
                            .eq("id", tInstanceId)
                            .eq("tenant_id", cId);

                          if (!error) {
                            fetchExistingInstances();
                          }
                        }}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm cursor-pointer appearance-none text-center font-medium"
                      >
                        {NOTIFICATION_SOUNDS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span className="absolute right-3 pointer-events-none text-slate-400 dark:text-slate-500 text-[10px]">▼</span>
                    </div>
                  </div>

                  <div className="w-full mt-3 flex items-center justify-between bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-2xl">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Modo Ticket Ativo
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 leading-normal">
                        Habilita a abertura de chamados e controle de tickets nesta caixa.
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        const nextVal = !targetInstObj?.ticket_mode;
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (!cId) return;
                        const tInstanceId = targetInstObj
                          ? targetInstObj.id
                          : useChatStore.getState().connectedInstanceName;
                        if (!tInstanceId) return;

                        const { error } = await supabase
                          .from("whatsapp_instances")
                          .update({ ticket_mode: nextVal })
                          .eq("id", tInstanceId)
                          .eq("tenant_id", cId);

                        if (!error) {
                          fetchExistingInstances();
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${targetInstObj?.ticket_mode ? "bg-emerald-500" : "bg-gray-305 dark:bg-gray-700"}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${targetInstObj?.ticket_mode ? "translate-x-4" : "translate-x-0"}`}
                      />
                    </button>
                  </div>

                  {targetInstObj?.ticket_mode && (
                    <div className="w-full mt-2 flex items-center justify-between bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 rounded-2xl animate-in slide-in-from-top-1 duration-200">
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Ocultar Preenchimento de Ticket
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 leading-normal">
                          Executa e preenche automaticamente o ticket por IA em segundo plano, sem abrir o modal ao resolver a conversa.
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const nextVal = !targetInstObj?.hide_ticket_modal;
                          const cId =
                            localStorage.getItem("current_tenant_id") ||
                            sessionStorage.getItem("current_tenant_id");
                          if (!cId) return;
                          const tInstanceId = targetInstObj
                            ? targetInstObj.id
                            : useChatStore.getState().connectedInstanceName;
                          if (!tInstanceId) return;

                          const { error } = await supabase
                            .from("whatsapp_instances")
                            .update({ hide_ticket_modal: nextVal })
                            .eq("id", tInstanceId)
                            .eq("tenant_id", cId);

                          if (!error) {
                            fetchExistingInstances();
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${targetInstObj?.hide_ticket_modal ? "bg-emerald-500" : "bg-gray-305 dark:bg-gray-700"}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${targetInstObj?.hide_ticket_modal ? "translate-x-4" : "translate-x-0"}`}
                        />
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 w-full mt-4">
                    <button
                      onClick={async () => {
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (
                          !confirm(
                            `Tem certeza que deseja deslogar seu aparelho da engine ${targetInstObj?.display_name || ""}?`,
                          )
                        )
                          return;
                        if (!cId) return;
                        setLoading(true);
                        const tInstanceId = targetInstObj
                          ? targetInstObj.id
                          : useChatStore.getState().connectedInstanceName;
                        const currInst = existingInstances.find(
                          (i) => i.id === tInstanceId,
                        );
                        await logoutEngine(
                          cId,
                          tInstanceId!,
                          currInst?.api_key || "",
                        );
                        setEvolutionConnection(false, null);
                        setLoading(false);
                        setQrBase64(null);
                        setEngineUser(null);
                      }}
                      className="flex col-span-1 flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-500 border border-red-500/10 hover:border-red-500/30 transition-all text-[11px] font-bold active:scale-95 group shadow-sm"
                    >
                      <LogOut
                        size={18}
                        className="text-red-500/80 group-hover:scale-110 transition-transform"
                      />
                      Deslogar Aparelho
                    </button>

                    <button
                      onClick={async () => {
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (!cId) return;
                        setLoading(true);
                        const currInst = existingInstances.find(
                          (i) =>
                            i.id ===
                            useChatStore.getState().connectedInstanceName,
                        );
                        await reconnectEngine(
                          cId,
                          useChatStore.getState().connectedInstanceName!,
                          currInst?.api_key || "",
                        );
                        setTimeout(() => {
                          setLoading(false);
                          alert("Protocolo WS reiniciado pela Engine.");
                        }, 2000);
                      }}
                      className="flex col-span-1 flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 hover:border-emerald-500/30 transition-all text-[11px] font-bold active:scale-95 group shadow-sm"
                    >
                      <RefreshCcw
                        size={18}
                        className="text-emerald-500/80 group-hover:rotate-45 transition-transform"
                      />
                      Warm Boot (Restart)
                    </button>

                    <button
                      onClick={async () => {
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (!cId) return;
                        setLoading(true);
                        const currInst = existingInstances.find(
                          (i) =>
                            i.id ===
                            useChatStore.getState().connectedInstanceName,
                        );
                        const r = await syncEngineContacts(
                          cId,
                          useChatStore.getState().connectedInstanceName!,
                          currInst?.api_key || "",
                        );
                        setLoading(false);
                        alert(r.message || "OK");
                      }}
                      className="flex col-span-1 flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 hover:border-blue-500/30 transition-all text-[11px] font-bold active:scale-95 group shadow-sm"
                    >
                      <UserCircle2
                        size={18}
                        className="text-blue-500/80 group-hover:scale-110 transition-transform"
                      />
                      Sincronizar Contatos
                    </button>

                    <button
                      onClick={async () => {
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (!cId) return;
                        setLoading(true);
                        const currInst = existingInstances.find(
                          (i) =>
                            i.id ===
                            useChatStore.getState().connectedInstanceName,
                        );
                        const r = await forceEnginePresence(
                          cId,
                          useChatStore.getState().connectedInstanceName!,
                          currInst?.api_key || "",
                        );
                        setLoading(false);
                        alert(r.message || "OK");
                      }}
                      className="flex col-span-1 flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-violet-500/5 hover:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/10 hover:border-violet-500/30 transition-all text-[11px] font-bold active:scale-95 group shadow-sm"
                    >
                      <Signal
                        size={18}
                        className="text-violet-500/80 group-hover:scale-110 transition-transform"
                      />
                      Forçar Online
                    </button>

                    <button
                      onClick={async () => {
                        const cId =
                          localStorage.getItem("current_tenant_id") ||
                          sessionStorage.getItem("current_tenant_id");
                        if (
                          !confirm(
                            "Isso apagará o cache de mensagens em RAM. Deseja prosseguir?",
                          )
                        )
                          return;
                        if (!cId) return;
                        setLoading(true);
                        const currInst = existingInstances.find(
                          (i) =>
                            i.id ===
                            useChatStore.getState().connectedInstanceName,
                        );
                        const r = await clearEngineStore(
                          cId,
                          useChatStore.getState().connectedInstanceName!,
                          currInst?.api_key || "",
                        );
                        setLoading(false);
                        alert(r.message || "OK");
                      }}
                      className="flex col-span-2 flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10 hover:border-amber-500/30 transition-all text-[11px] font-bold active:scale-95 group shadow-sm"
                    >
                      <AlertCircle
                        size={18}
                        className="text-amber-500/80 group-hover:scale-105 transition-transform"
                      />
                      Limpar RAM (Memory Leak Prevention)
                    </button>
                  </div>
                </div>
              )}

                {configTab === "voip" && (
                  <div className="w-full mt-4 flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="w-full flex flex-col gap-4 border border-gray-250/20 dark:border-white/5 bg-black/5 dark:bg-black/20 p-5 rounded-3xl backdrop-blur-md">
                      
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">Módulo de Chamadas (Voz)</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Pareie um dispositivo de áudio virtual.</span>
                        </div>
                        {(() => {
                          const wacallsSid = targetInstObj?.id || targetInstObj?.display_name || targetInstanceName || useChatStore.getState().connectedInstanceName;
                          const sessionsList = wacallsSessions || [];
                          const currentWacallSession = sessionsList.find(s => s && s.id === wacallsSid);
                          return (
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              currentWacallSession?.paired 
                                ? "bg-emerald-100 dark:bg-emerald-950/40 text-[#00a884]"
                                : currentWacallSession?.status === "connecting"
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 animate-pulse"
                                : "bg-gray-100 dark:bg-[#202c33] text-gray-500 dark:text-gray-400"
                            }`}>
                              {currentWacallSession?.paired ? "Ativo" : currentWacallSession?.status === "connecting" ? "Pareando" : "Inativo"}
                            </span>
                          );
                        })()}
                      </div>

                      {(() => {
                        const wacallsSid = targetInstObj?.id || targetInstObj?.display_name || targetInstanceName || useChatStore.getState().connectedInstanceName;
                        const sessionsList = wacallsSessions || [];
                        const qrCodesObj = wacallsQrCodes || {};
                        const currentWacallSession = sessionsList.find(s => s && s.id === wacallsSid);
                        const currentWacallsQrCode = qrCodesObj[wacallsSid || ''];

                        return (
                          <>
                            {/* QR Code Inline */}
                            {showWacallsQr === wacallsSid && currentWacallsQrCode && (
                              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-black/30 rounded-2xl border border-gray-100 dark:border-white/5 mt-2 animate-in zoom-in-95 duration-200 w-full">
                                <p className="text-[10px] text-gray-400 mb-3 text-center">{"Escaneie o código com o WhatsApp > Aparelhos Conectados"}</p>
                                <div className="w-40 h-40 bg-white p-3 rounded-xl flex items-center justify-center border border-gray-200 shadow-sm">
                                  <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentWacallsQrCode)}`} 
                                    alt="QR Code" 
                                    className="w-36 h-36 object-contain" 
                                  />
                                </div>
                                <button 
                                  onClick={() => handleCancelWacallsPair(wacallsSid!)} 
                                  className="mt-3 text-xs text-red-500 hover:text-red-600 font-bold transition-colors"
                                >
                                  Cancelar Pareamento
                                </button>
                              </div>
                            )}

                            {showWacallsQr !== wacallsSid && (
                              <div className="flex flex-col gap-2 mt-2 w-full">
                                {!currentWacallSession?.paired ? (
                                  <button
                                    onClick={() => handleStartWacallsPair(wacallsSid!)}
                                    className="w-full text-xs py-3 bg-emerald-500/10 hover:bg-[#00a884] text-[#00a884] hover:text-white font-semibold rounded-2xl border border-emerald-500/20 hover:border-emerald-500 transition-all flex justify-center items-center gap-1.5 active:scale-95 shadow-sm"
                                  >
                                    <QrCode size={14} /> Ativar Chamadas de Voz
                                  </button>
                                ) : (
                                  <div className="grid grid-cols-3 gap-2">
                                    <button
                                      onClick={() => handleStartWacallsPair(wacallsSid!)}
                                      className="text-[11px] py-3 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-500 dark:text-blue-400 font-semibold rounded-2xl border border-blue-500/20 hover:border-blue-500 transition-all flex flex-col justify-center items-center gap-1 active:scale-95"
                                      title="Gerar novo QR code para re-conectar"
                                    >
                                      <RefreshCcw size={14} /> Re-parear Voz
                                    </button>
                                    <button
                                      onClick={() => handleDisconnectWacalls(wacallsSid!)}
                                      className="text-[11px] py-3 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 font-semibold rounded-2xl border border-red-500/20 hover:border-red-500 transition-all flex flex-col justify-center items-center gap-1 active:scale-95"
                                      title="Desativar voz e desparear device de chamadas"
                                    >
                                      <LogOut size={14} /> Desativar Voz
                                    </button>
                                    <button
                                      onClick={() => handleTestWacallsConnection(wacallsSid!, displayNameToUse)}
                                      className="text-[11px] py-3 bg-violet-500/10 hover:bg-violet-500 hover:text-white text-violet-500 font-semibold rounded-2xl border border-violet-500/20 hover:border-violet-500 transition-all flex flex-col justify-center items-center gap-1 active:scale-95"
                                      title="Testar conexões de ligações de voz e logar no Dev Logger"
                                    >
                                      <Activity size={14} /> Testar
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {/* Atalho para outra tela (Gestão Completa) */}
                      <div className="w-full border-t border-gray-250/20 dark:border-white/5 pt-4 mt-2 flex flex-col justify-center items-center gap-2 text-center">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Deseja gerenciar chaves de API, apagar ou reiniciar a instância principal?</span>
                        <button 
                          onClick={() => {
                            onClose(); // fecha o modal
                            navigate('/instances'); // vai para /instances
                          }}
                          className="text-xs font-bold text-emerald-500 hover:text-emerald-600 transition-colors flex items-center gap-1 active:scale-95 mt-1 bg-emerald-500/5 px-4 py-2 rounded-full border border-emerald-500/10 hover:border-emerald-500/20"
                        >
                          Ir para Gestão de Instâncias <Smartphone size={12}/>
                        </button>
                      </div>

                    </div>
                  </div>
                )}

                {configTab === "grupos" && (
                  <div className="w-full mt-4 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 flex-1 h-full overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full">
                      
                      {/* Left Column - Master */}
                      <div className="col-span-1 md:col-span-4 bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col gap-4 overflow-y-auto styled-scrollbar shadow-inner">
                        <h4 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                          <UserCircle2 size={16} className="text-emerald-500" />{" "}
                          Preferências do Aparelho
                        </h4>

                        <label className="flex items-center justify-between cursor-pointer group">
                          <div className="flex flex-col pr-4">
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Rejeitar Ligações
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                              Desligar automaticamente chamadas e enviar aviso
                            </span>
                          </div>
                          <div
                            onClick={async (e) => {
                              e.preventDefault();
                              const cId =
                                localStorage.getItem("current_tenant_id") ||
                                sessionStorage.getItem("current_tenant_id");
                              if (!cId) return;
                              const tInstanceId = targetInstObj
                                ? targetInstObj.id
                                : useChatStore.getState().connectedInstanceName;
                              if (!tInstanceId) return;

                              const newVal = !(
                                targetInstObj?.reject_calls === true
                              );

                              const { error } = await supabase
                                .from("whatsapp_instances")
                                .update({ reject_calls: newVal })
                                .eq("id", tInstanceId)
                                .eq("tenant_id", cId);

                              if (!error) {
                                fetchExistingInstances();
                              }
                            }}
                            className={`w-10 h-6 shrink-0 rounded-full transition-colors relative ${targetInstObj?.reject_calls === true ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${targetInstObj?.reject_calls === true ? "left-5" : "left-1"}`}
                            />
                          </div>
                        </label>

                        {/* Grupos da Instância */}
                        <div className="mt-2 flex flex-col gap-3 border-t border-gray-200 dark:border-white/10 pt-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                              Grupos ({engineGroups?.length || 0})
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setShowCreateGroup(!showCreateGroup)
                                }
                                className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
                              >
                                <PlusCircle size={12} /> Novo
                              </button>
                              <button
                                onClick={async () => {
                                  const cId =
                                    localStorage.getItem(
                                      "current_tenant_id",
                                    ) ||
                                    sessionStorage.getItem(
                                      "current_tenant_id",
                                    );
                                  if (!cId) return;
                                  const tInstanceId = targetInstObj
                                    ? targetInstObj.id
                                    : useChatStore.getState()
                                        .connectedInstanceName;
                                  if (!tInstanceId) return;
                                  setLoadingGroups(true);
                                  try {
                                    const currInst = existingInstances.find(
                                      (i) => i.id === tInstanceId,
                                    );
                                    const res = await fetchEngineGroups(
                                      cId,
                                      tInstanceId,
                                      currInst?.api_key || "",
                                    );
                                    if (res.groups) {
                                      setEngineGroups(
                                        Object.values(res.groups),
                                      );
                                    }
                                  } catch (e: any) {
                                    alert(
                                      "Erro ao buscar grupos: " + e.message,
                                    );
                                  } finally {
                                    setLoadingGroups(false);
                                  }
                                }}
                                className="text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
                              >
                                {loadingGroups ? (
                                  <Loader2
                                    size={12}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <RefreshCcw size={12} />
                                )}
                              </button>
                            </div>
                          </div>

                          {showCreateGroup && (
                            <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20 mt-2 mb-2 animate-in slide-in-from-top-2">
                              <h5 className="text-xs font-bold text-gray-800 dark:text-emerald-400 mb-2">
                                Criar Novo Grupo
                              </h5>
                              <input
                                type="text"
                                placeholder="Nome do Grupo"
                                value={newGroupSubject}
                                onChange={(e) =>
                                  setNewGroupSubject(e.target.value)
                                }
                                className="w-full text-xs p-2 rounded bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 mb-2 focus:outline-none focus:border-emerald-500"
                              />
                              <input
                                type="text"
                                placeholder="Participantes (números sep por vírgula)"
                                value={newGroupParticipants}
                                onChange={(e) =>
                                  setNewGroupParticipants(e.target.value)
                                }
                                className="w-full text-xs p-2 rounded bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 mb-2 focus:outline-none focus:border-emerald-500"
                              />
                              <button
                                onClick={async () => {
                                  if (
                                    !newGroupSubject ||
                                    !newGroupParticipants
                                  ) {
                                    alert("Preencha todos os campos");
                                    return;
                                  }
                                  const parts = newGroupParticipants
                                    .split(",")
                                    .map((p) => p.trim() + "@s.whatsapp.net");
                                  try {
                                    setLoadingGroups(true);
                                    const cId =
                                      localStorage.getItem(
                                        "current_tenant_id",
                                      ) ||
                                      sessionStorage.getItem(
                                        "current_tenant_id",
                                      );
                                    const tInstanceId = targetInstObj
                                      ? targetInstObj.id
                                      : useChatStore.getState()
                                          .connectedInstanceName;
                                    const currInst = existingInstances.find(
                                      (i) => i.id === tInstanceId,
                                    );
                                    await createEngineGroup(
                                      cId!,
                                      tInstanceId!,
                                      currInst?.api_key || "",
                                      newGroupSubject,
                                      parts,
                                    );
                                    alert("Grupo criado com sucesso!");
                                    setShowCreateGroup(false);
                                    setNewGroupSubject("");
                                    setNewGroupParticipants("");
                                    // refresh
                                    const res = await fetchEngineGroups(
                                      cId!,
                                      tInstanceId!,
                                      currInst?.api_key || "",
                                    );
                                    if (res.groups)
                                      setEngineGroups(
                                        Object.values(res.groups),
                                      );
                                  } catch (e: any) {
                                    alert("Erro: " + e.message);
                                  } finally {
                                    setLoadingGroups(false);
                                  }
                                }}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded transition-colors"
                              >
                                Confirmar Criação
                              </button>
                            </div>
                          )}

                          {engineGroups && engineGroups.length === 0 && (
                            <p className="text-xs text-center text-gray-500 py-4">
                              Nenhum grupo encontrado.
                            </p>
                          )}

                          {engineGroups && engineGroups.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto styled-scrollbar pr-2">
                              {engineGroups.map((g: any) => (
                                <div
                                  key={g.id}
                                  onClick={async () => {
                                    setSelectedGroup(g);
                                    setLoadingMetadata(true);
                                    const cId =
                                      localStorage.getItem(
                                        "current_tenant_id",
                                      ) ||
                                      sessionStorage.getItem(
                                        "current_tenant_id",
                                      );
                                    const tInstanceId = targetInstObj
                                      ? targetInstObj.id
                                      : useChatStore.getState()
                                          .connectedInstanceName;
                                    const currInst = existingInstances.find(
                                      (i) => i.id === tInstanceId,
                                    );
                                    try {
                                      const res =
                                        await fetchEngineGroupMetadata(
                                          cId!,
                                          tInstanceId!,
                                          currInst?.api_key || "",
                                          g.id,
                                        );
                                      setGroupMetadata(res.metadata);
                                      setGroupAvatar(null);
                                      fetchEngineGroupProfilePicture(cId!, tInstanceId!, currInst?.api_key || "", g.id)
                                        .then(p => { if (p.url) setGroupAvatar(p.url); })
                                        .catch(() => {});
                                    } catch (e) {
                                      console.error(e);
                                    } finally {
                                      setLoadingMetadata(false);
                                    }
                                  }}
                                  className={`shrink-0 p-3 rounded-xl cursor-pointer transition-all border group relative overflow-hidden ${selectedGroup?.id === g.id ? 'bg-emerald-500/20 border-emerald-500/50 shadow-sm' : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-emerald-500/10 hover:border-emerald-500/20'}`}
                                >
                                  {selectedGroup?.id === g.id && (
                                     <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500" />
                                  )}
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                      <h5 className={`text-xs font-bold truncate transition-colors ${selectedGroup?.id === g.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-white group-hover:text-emerald-500'}`}>
                                        {g.subject}
                                      </h5>
                                      <p className="text-[10px] text-gray-500 mt-0.5">
                                        {g.participants?.length || 0} membros
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Column - Detail */}
                      <div className="col-span-1 md:col-span-8 bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-6 flex flex-col overflow-hidden relative shadow-inner">
                        {!selectedGroup ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                            <Users size={48} className="text-emerald-500/30" />
                            <p className="text-sm font-medium">Selecione um grupo para gerenciar participantes</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 h-full overflow-hidden">
                            <div className="flex justify-between items-center bg-white dark:bg-black/40 p-4 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm shrink-0">
                              <h5 className="text-lg font-black tracking-tight text-gray-800 dark:text-white break-words flex items-center gap-2">
                                {groupAvatar ? (
                                  <img src={groupAvatar} alt="Group avatar" className="w-10 h-10 rounded-full border border-gray-200 dark:border-white/10" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600">
                                    <Users size={20} />
                                  </div>
                                )}
                                <span>{selectedGroup.subject}</span>
                                <button
                                  onClick={() => {
                                    setModalInput1(selectedGroup.subject);
                                    setActionModal({ type: 'subject', isOpen: true });
                                  }}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors text-gray-600 dark:text-gray-300"
                                  title="Alterar Nome"
                                >
                                  <PenSquare size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    setModalInput1("");
                                    setActionModal({ type: 'avatar', isOpen: true });
                                  }}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors text-gray-600 dark:text-gray-300"
                                  title="Alterar Foto do Grupo"
                                >
                                  <QrCode size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    setModalInput1("604800"); // Padrão 7 dias em segundos
                                    setActionModal({ type: 'ephemeral', isOpen: true });
                                  }}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors text-gray-600 dark:text-gray-300"
                                  title="Mensagens Temporárias"
                                >
                                  <Settings size={14} />
                                </button>
                              </h5>
                              
                              <button
                                onClick={handleSaveGroupToCRM}
                                disabled={savingParticipants || !groupMetadata}
                                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50 shrink-0"
                              >
                                {savingParticipants ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Salvar no CRM
                              </button>
                            </div>

                            {loadingMetadata ? (
                              <div className="flex flex-col items-center justify-center h-full gap-2">
                                <Loader2
                                  size={32}
                                  className="animate-spin text-emerald-500"
                                />
                                <span className="text-xs text-emerald-500 font-medium">Carregando Metadata...</span>
                              </div>
                            ) : groupMetadata ? (
                              <div className="flex flex-col h-full overflow-hidden">
                                {/* Permissões do Grupo */}
                                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-4 mb-4 flex items-center justify-between shrink-0 animate-in slide-in-from-top-2">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                                      Sincronizar Mensagens
                                    </span>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-500/70">
                                      Permitir leitura de mensagens deste grupo no CRM
                                    </span>
                                  </div>
                                  <div
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      if (!selectedGroup || !targetInstObj) return;
                                      const currentSettings = targetInstObj.settings || {};
                                      let allowed_groups = currentSettings.allowed_groups || [];
                                      
                                      let isAdding = false;
                                      if (allowed_groups.includes(selectedGroup.id)) {
                                        allowed_groups = allowed_groups.filter((g: string) => g !== selectedGroup.id);
                                      } else {
                                        allowed_groups = [...allowed_groups, selectedGroup.id];
                                        isAdding = true;
                                      }
                                      
                                      const newSettings = { ...currentSettings, allowed_groups };
                                      const cId = localStorage.getItem("current_tenant_id") || sessionStorage.getItem("current_tenant_id");
                                      if (!cId) return;
                                      
                                      const { error } = await supabase
                                        .from("whatsapp_instances")
                                        .update({ settings: newSettings })
                                        .eq("id", targetInstObj.id)
                                        .eq("tenant_id", cId);
                                        
                                      if (!error) {
                                        fetchExistingInstances();
                                        if (isAdding) {
                                          console.log("Grupo ativado e sincronizado com o CRM!");
                                          
                                          // Assegurar que o contato e a conversa existam para aparecer na lista de chat
                                          const num = selectedGroup.id.split("@")[0];
                                          const groupSubject = selectedGroup.subject || "Grupo Desconhecido";
                                          
                                          // Garantir que o contato exista
                                          let contactData;
                                          const { data: existingContact } = await supabase
                                            .from("contacts")
                                            .select("*")
                                            .eq("whatsapp_jid", selectedGroup.id)
                                            .eq("tenant_id", cId)
                                            .maybeSingle();

                                          if (existingContact) {
                                            contactData = existingContact;
                                            // Garante que o contato aponte para a instância ativa em que o grupo foi habilitado
                                            if (existingContact.instance_id !== targetInstObj.id) {
                                              const { data: updatedContact } = await supabase
                                                .from("contacts")
                                                .update({ instance_id: targetInstObj.id })
                                                .eq("id", existingContact.id)
                                                .select()
                                                .maybeSingle();
                                              if (updatedContact) contactData = updatedContact;
                                            }
                                          } else {
                                            const { data: newContact } = await supabase
                                              .from("contacts")
                                              .insert({
                                                tenant_id: cId,
                                                name: groupSubject,
                                                phone: num,
                                                whatsapp_jid: selectedGroup.id,
                                                instance_id: targetInstObj.id,
                                                profile_picture_url: groupMetadata?.pictureUrl || ""
                                              })
                                              .select()
                                              .single();
                                            contactData = newContact;
                                          }
                                            
                                          // Inserir ou recuperar a conversa
                                          if (contactData) {
                                            const { data: existingConv } = await supabase
                                              .from("conversations")
                                              .select("id, instance_id")
                                              .eq("contact_id", contactData.id)
                                              .eq("tenant_id", cId)
                                              .maybeSingle();
                                              
                                            if (!existingConv) {
                                              await supabase.from("conversations").insert({
                                                contact_id: contactData.id,
                                                tenant_id: cId,
                                                instance_id: targetInstObj.id,
                                                status: "open",
                                                unread_count: 0
                                              });
                                            } else if (existingConv.instance_id !== targetInstObj.id) {
                                              // Atualiza a conversa para apontar para a instância ativa onde o grupo foi habilitado
                                              await supabase
                                                .from("conversations")
                                                .update({ instance_id: targetInstObj.id, status: "open" })
                                                .eq("id", existingConv.id);
                                            }
                                            
                                            // Atualizar estado global para a conversa aparecer na lista na hora
                                            useChatStore.getState().fetchInitialData();
                                          }
                                        } else {
                                          console.log("Sincronização desativada para este grupo.");
                                        }
                                      } else {
                                        console.error("Erro ao atualizar sincronização:", error);
                                      }
                                    }}
                                    className={`w-10 h-6 shrink-0 rounded-full transition-colors relative cursor-pointer shadow-inner ${(targetInstObj?.settings?.allowed_groups || []).includes(selectedGroup.id) ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`}
                                  >
                                    <div
                                      className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${(targetInstObj?.settings?.allowed_groups || []).includes(selectedGroup.id) ? "left-5" : "left-1"}`}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-1 mb-4 pb-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                                  <button
                                    onClick={async () => {
                                      const cId =
                                        localStorage.getItem(
                                          "current_tenant_id",
                                        ) ||
                                        sessionStorage.getItem(
                                          "current_tenant_id",
                                        );
                                      const tInstanceId = targetInstObj
                                        ? targetInstObj.id
                                        : useChatStore.getState()
                                            .connectedInstanceName;
                                      const currInst = existingInstances.find(
                                        (i) => i.id === tInstanceId,
                                      );
                                      try {
                                        const res =
                                          await getEngineGroupInviteCode(
                                            cId!,
                                            tInstanceId!,
                                            currInst?.api_key || "",
                                            selectedGroup.id,
                                          );
                                        if (res.code) {
                                          setInviteCode(
                                            `https://chat.whatsapp.com/${res.code}`,
                                          );
                                        }
                                      } catch (e: any) {
                                        alert(
                                          "Erro ao obter convite: " + e.message,
                                        );
                                      }
                                    }}
                                    className="text-xs font-semibold bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-blue-500/20 transition-colors"
                                  >
                                    <Share2 size={14} /> Link Convite
                                  </button>

                                  <button
                                    onClick={() => {
                                      setModalInput1(groupMetadata.desc || "");
                                      setActionModal({ type: 'description', isOpen: true });
                                    }}
                                    className="text-xs font-semibold bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    <PenSquare size={14} /> Editar Desc
                                  </button>

                                  <button
                                    onClick={() => {
                                      setModalInput1("");
                                      setActionModal({ type: 'participants', isOpen: true });
                                    }}
                                    className="text-xs font-semibold bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    <UserPlus size={14} /> Add Membros
                                  </button>

                                  <button
                                    onClick={async () => {
                                      const settingStr = prompt(
                                        "Mudar configuração (announcement, not_announcement, unlocked, locked):",
                                      );
                                      if (settingStr) {
                                        const cId =
                                          localStorage.getItem(
                                            "current_tenant_id",
                                          ) ||
                                          sessionStorage.getItem(
                                            "current_tenant_id",
                                          );
                                        const tInstanceId = targetInstObj
                                          ? targetInstObj.id
                                          : useChatStore.getState()
                                              .connectedInstanceName;
                                        const currInst = existingInstances.find(
                                          (i) => i.id === tInstanceId,
                                        );
                                        try {
                                          await updateEngineGroupSettings(
                                            cId!,
                                            tInstanceId!,
                                            currInst?.api_key || "",
                                            selectedGroup.id,
                                            settingStr as any,
                                          );
                                          alert(
                                            "Configuração alterada com sucesso.",
                                          );
                                        } catch (e: any) {
                                          alert(
                                            "Erro ao alterar: " + e.message,
                                          );
                                        }
                                      }
                                    }}
                                    className="text-xs font-semibold bg-purple-500/10 text-purple-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-purple-500/20 transition-colors"
                                  >
                                    <Settings size={14} /> Conf. Grupo
                                  </button>

                                  <button
                                    onClick={async () => {
                                      if (!confirm("Deseja sair deste grupo?"))
                                        return;
                                      const cId =
                                        localStorage.getItem(
                                          "current_tenant_id",
                                        ) ||
                                        sessionStorage.getItem(
                                          "current_tenant_id",
                                        );
                                      const tInstanceId = targetInstObj
                                        ? targetInstObj.id
                                        : useChatStore.getState()
                                            .connectedInstanceName;
                                      const currInst = existingInstances.find(
                                        (i) => i.id === tInstanceId,
                                      );
                                      try {
                                        await leaveEngineGroup(
                                          cId!,
                                          tInstanceId!,
                                          currInst?.api_key || "",
                                          selectedGroup.id,
                                        );
                                        alert("Você saiu do grupo.");
                                        setSelectedGroup(null);
                                      } catch (e: any) {
                                        alert("Erro ao sair: " + e.message);
                                      }
                                    }}
                                    className="text-xs font-semibold bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-red-500/20 transition-colors ml-auto"
                                  >
                                    <LogOut size={14} /> Sair
                                  </button>
                                </div>

                                {inviteCode && (
                                  <div className="text-xs p-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl flex justify-between items-center break-all mb-4 shrink-0">
                                    <span className="font-mono">{inviteCode}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(
                                          inviteCode,
                                        );
                                        alert("Copiado!");
                                      }}
                                      className="shrink-0 ml-2 bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                                    >
                                      Copiar
                                    </button>
                                  </div>
                                )}
                                
                                <div className="w-full mb-3 flex flex-col md:flex-row md:items-center justify-between gap-2 shrink-0">
                                  <h6 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                    Participantes <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">{groupMetadata.participants?.length || 0}</span>
                                  </h6>
                                  <input
                                    type="text"
                                    placeholder="Buscar participante..."
                                    value={groupSearch}
                                    onChange={(e) =>
                                      setGroupSearch(e.target.value)
                                    }
                                    className="w-full max-w-xs bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all shadow-sm"
                                  />
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto styled-scrollbar pr-2 pb-4 flex-1">
                                  {groupMetadata.participants
                                    ?.filter((p: any) => {
                                      const term = groupSearch.toLowerCase();
                                      const num = p.id.split("@")[0];
                                      const name = (
                                        p.notify ||
                                        p.name ||
                                        ""
                                      ).toLowerCase();
                                      return (
                                        num.includes(term) ||
                                        name.includes(term)
                                      );
                                    })
                                    .map((p: any) => {
                                      const num = p.id.split("@")[0];
                                      const contactMatch = contacts?.find((c) => c.id.includes(num));
                                      const displayName = contactMatch?.name || contactMatch?.pushName || p.name || p.notify || "Desconhecido";
                                      const formattedPhone = formatPhoneNumber(p.id);

                                      return (
                                        <div
                                          key={p.id}
                                          className="flex flex-col bg-white dark:bg-black/30 p-3 rounded-xl border border-gray-200 dark:border-white/10 group/part relative overflow-hidden shadow-sm hover:shadow-md transition-all hover:border-emerald-500/30"
                                        >
                                          <div className="flex items-center gap-2 mb-1">
                                             <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                <UserCircle2 size={18} className="text-emerald-500" />
                                             </div>
                                             <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-gray-800 dark:text-white truncate">
                                                  {displayName}
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-mono">
                                                  {formattedPhone}
                                                </span>
                                             </div>
                                          </div>
                                          
                                          {p.admin && (
                                            <span className="absolute top-2 right-2 text-[9px] bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                              Admin
                                            </span>
                                          )}

                                          {/* Action overlay */}
                                          <div className="absolute inset-0 bg-white/95 dark:bg-[#111b21]/95 backdrop-blur flex flex-col items-center justify-center gap-2 opacity-0 group-hover/part:opacity-100 transition-opacity">
                                            <div className="flex gap-2">
                                              {!p.admin ? (
                                                <button
                                                  title="Promover a Admin"
                                                  onClick={async () => {
                                                    try {
                                                      const cId =
                                                        localStorage.getItem(
                                                          "current_tenant_id",
                                                        ) ||
                                                        sessionStorage.getItem(
                                                          "current_tenant_id",
                                                        );
                                                      const tInstanceId =
                                                        targetInstObj
                                                          ? targetInstObj.id
                                                          : useChatStore.getState()
                                                              .connectedInstanceName;
                                                      const currInst =
                                                        existingInstances.find(
                                                          (i) =>
                                                            i.id === tInstanceId,
                                                        );
                                                      await updateEngineGroupParticipants(
                                                        cId!,
                                                        tInstanceId!,
                                                        currInst?.api_key || "",
                                                        selectedGroup.id,
                                                        [p.id],
                                                        "promote",
                                                      );
                                                      alert("Promovido a admin");
                                                    } catch (e: any) {
                                                      alert(e.message);
                                                    }
                                                  }}
                                                  className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors flex items-center justify-center"
                                                >
                                                  <ShieldCheck size={16} />
                                                </button>
                                              ) : (
                                                <button
                                                  title="Rebaixar Admin"
                                                  onClick={async () => {
                                                    try {
                                                      const cId =
                                                        localStorage.getItem(
                                                          "current_tenant_id",
                                                        ) ||
                                                        sessionStorage.getItem(
                                                          "current_tenant_id",
                                                        );
                                                      const tInstanceId =
                                                        targetInstObj
                                                          ? targetInstObj.id
                                                          : useChatStore.getState()
                                                              .connectedInstanceName;
                                                      const currInst =
                                                        existingInstances.find(
                                                          (i) =>
                                                            i.id === tInstanceId,
                                                        );
                                                      await updateEngineGroupParticipants(
                                                        cId!,
                                                        tInstanceId!,
                                                        currInst?.api_key || "",
                                                        selectedGroup.id,
                                                        [p.id],
                                                        "demote",
                                                      );
                                                      alert("Rebaixado");
                                                    } catch (e: any) {
                                                      alert(e.message);
                                                    }
                                                  }}
                                                  className="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-colors flex items-center justify-center"
                                                >
                                                  <ShieldAlert size={16} />
                                                </button>
                                              )}
                                              <button
                                                title="Remover"
                                                onClick={async () => {
                                                  if (
                                                    !confirm(
                                                      "Remover participante?",
                                                    )
                                                  )
                                                    return;
                                                  try {
                                                    const cId =
                                                      localStorage.getItem(
                                                        "current_tenant_id",
                                                      ) ||
                                                      sessionStorage.getItem(
                                                        "current_tenant_id",
                                                      );
                                                    const tInstanceId =
                                                      targetInstObj
                                                        ? targetInstObj.id
                                                        : useChatStore.getState()
                                                            .connectedInstanceName;
                                                    const currInst =
                                                      existingInstances.find(
                                                        (i) =>
                                                          i.id === tInstanceId,
                                                      );
                                                    await updateEngineGroupParticipants(
                                                      cId!,
                                                      tInstanceId!,
                                                      currInst?.api_key || "",
                                                      selectedGroup.id,
                                                      [p.id],
                                                      "remove",
                                                    );
                                                    alert("Removido.");
                                                  } catch (e: any) {
                                                    alert(e.message);
                                                  }
                                                }}
                                                className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
                                              >
                                                <Trash2 size={16} />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-red-500">
                                Falha ao carregar detalhes.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          ) : (
            <div className="w-full max-h-[85vh] overflow-y-auto styled-scrollbar px-3 sm:px-6 py-4 flex flex-col items-center justify-start bg-white/70 dark:bg-[#111b21]/95 backdrop-blur-2xl rounded-3xl border border-gray-200/80 dark:border-white/10 shadow-2xl transition-all duration-300">
              {activePollingId ? (
                <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center w-full pb-2 max-w-md mx-auto">
                  <div className="flex flex-col items-center w-full">
                    {/* Header customizado SaaS Premium */}
                    <div className="w-full flex flex-col items-center text-center mb-4">
                      <div className="flex items-center gap-2 mb-2 bg-[#00a884]/10 dark:bg-[#00a884]/15 border border-[#00a884]/30 px-4 py-1 rounded-full shadow-sm">
                        <QrCode className="text-[#00a884] animate-pulse" size={15} />
                        <span className="text-[11px] font-extrabold text-[#00a884] tracking-wider uppercase">Conexão Oficial WhatsApp</span>
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center justify-center gap-2 tracking-tight">
                        Conectar Instância
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-[#8696a0] px-3 leading-relaxed mt-1">
                        Vincule a conta de WhatsApp da instância <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#00a884]/10 dark:bg-[#00a884]/20 border border-[#00a884]/30 text-[#00a884] font-mono font-bold text-xs shadow-sm">{displayNameToUse}</span>
                      </p>
                    </div>

                    {/* Abas Segmentadas de Modo de Conexão: QR Code vs Código de Pareamento */}
                    <div className="w-full max-w-sm bg-gray-100 dark:bg-[#111b21] p-1.5 rounded-2xl flex items-center mb-5 border border-gray-200 dark:border-[#202c33] shadow-inner">
                      <button
                        onClick={() => setConnectMode('qr')}
                        className={cn(
                          "flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer",
                          connectMode === 'qr'
                            ? "bg-white dark:bg-[#202c33] text-[#00a884] dark:text-[#00a884] shadow-md border border-gray-200/50 dark:border-emerald-500/30"
                            : "text-gray-500 dark:text-[#8696a0] hover:text-gray-800 dark:hover:text-white"
                        )}
                      >
                        <QrCode size={16} /> QR Code
                      </button>
                      <button
                        onClick={() => setConnectMode('pairing')}
                        className={cn(
                          "flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer relative",
                          connectMode === 'pairing'
                            ? "bg-white dark:bg-[#202c33] text-[#00a884] dark:text-[#00a884] shadow-md border border-gray-200/50 dark:border-emerald-500/30"
                            : "text-gray-500 dark:text-[#8696a0] hover:text-gray-800 dark:hover:text-white"
                        )}
                      >
                        <Smartphone size={16} /> Código de Pareamento
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute top-2 right-2"></span>
                      </button>
                    </div>

                    {/* Conteúdo Principal baseado na Aba Selecionada */}
                    {connectMode === 'qr' ? (
                      <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
                        {/* Slot superior: QR Code com Glow ou Card de Sucesso */}
                        <div className="w-full flex justify-center items-center mb-5">
                          {codeEntered ? (
                            <div className="w-full max-w-sm flex flex-col items-center py-5 px-5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl shadow-[0_0_30px_rgba(0,168,132,0.18)] animate-in zoom-in duration-300 backdrop-blur-md">
                              <div className="w-14 h-14 bg-emerald-500/20 rounded-full border-2 border-emerald-500/40 flex items-center justify-center mb-3 shadow-inner">
                                <CheckCircle size={30} className="text-[#00a884] animate-bounce" />
                              </div>
                              <h4 className="text-base font-extrabold text-gray-900 dark:text-white text-center mb-1">
                                QR Code Lido com Sucesso!
                              </h4>
                              <p className="text-xs text-gray-500 dark:text-[#8696a0] text-center mb-4 px-2 leading-relaxed">
                                O WhatsApp iniciou o vínculo com seu celular. Clique abaixo para prosseguir:
                              </p>
                              <button
                                onClick={() => handleSuccess()}
                                className="w-full py-3 bg-gradient-to-r from-[#00a884] to-teal-600 hover:from-[#008f6f] hover:to-teal-700 text-white rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer animate-pulse"
                              >
                                <CheckCircle size={16} /> Confirmar e Liberar Conexão
                              </button>
                            </div>
                          ) : (
                            <div className="relative p-4 bg-white dark:bg-[#0b141a] rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.25),0_0_30px_rgba(0,168,132,0.15)] border border-gray-200 dark:border-[#202c33] flex justify-center items-center transition-all duration-300 group">
                              <div className="absolute -inset-1 bg-gradient-to-r from-[#00a884]/30 to-teal-500/30 rounded-3xl blur-md opacity-75 group-hover:opacity-100 transition duration-500"></div>
                              <div className="relative bg-white p-3 rounded-2xl z-10 shadow-inner">
                                {qrBase64 ? (
                                  <div className="relative overflow-hidden rounded-xl">
                                    <img
                                      src={qrBase64}
                                      alt="QR Code WhatsApp"
                                      className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-xl object-contain"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-xl bg-gray-50 dark:bg-[#111b21] flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 dark:border-white/10">
                                    <div className="p-3.5 rounded-full bg-[#00a884]/10 dark:bg-[#00a884]/20 animate-pulse">
                                      <Loader2 className="animate-spin text-[#00a884]" size={30} />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-500 dark:text-[#8696a0]">
                                      Gerando QR Code oficial...
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Modo Código de Pareamento Premium VIP */
                      <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 mb-4">
                        {pairingLoading ? (
                          <div className="w-full p-8 bg-white/80 dark:bg-[#202c33]/90 backdrop-blur-md border border-gray-200/80 dark:border-[#2c3943]/60 rounded-3xl text-center shadow-lg flex flex-col items-center gap-3">
                            <div className="p-4 rounded-full bg-[#00a884]/15 text-[#00a884] animate-pulse">
                              <Loader2 className="animate-spin" size={32} />
                            </div>
                            <h4 className="text-sm font-extrabold text-gray-900 dark:text-white">Gerando Código VIP de Pareamento...</h4>
                            <p className="text-xs text-gray-500 dark:text-[#8696a0] max-w-xs leading-relaxed">
                              Estabelecendo handshake direto com os servidores oficiais do WhatsApp. Aguarde alguns instantes...
                            </p>
                          </div>
                        ) : pairingCode ? (
                          /* Cartão VIP do Código Gerado */
                          <div className="w-full p-5 bg-gradient-to-b from-white/90 to-emerald-50/50 dark:from-[#202c33] dark:to-[#111b21] backdrop-blur-xl border-2 border-[#00a884]/40 rounded-3xl text-center shadow-[0_20px_50px_rgba(0,168,132,0.18)] flex flex-col items-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 px-3 py-1 bg-[#00a884] text-white text-[9px] font-mono font-black uppercase rounded-bl-xl tracking-widest shadow-sm">
                              Código Válido
                            </div>

                            <div className="flex items-center gap-2 mb-2 text-[#00a884]">
                              <Smartphone size={18} className="animate-bounce" />
                              <span className="text-xs font-extrabold uppercase tracking-wider">Código de Pareamento de 8 Dígitos</span>
                            </div>

                            {/* Mostrador Digital VIP em Blocos */}
                            <div className="my-4 w-full flex items-center justify-center gap-2 sm:gap-3">
                              {/* Primeiro Bloco (4 Dígitos) */}
                              <div className="flex gap-1.5 bg-gray-100 dark:bg-[#0b141a] p-2 sm:p-2.5 rounded-2xl border border-gray-200 dark:border-emerald-500/30 shadow-inner">
                                {pairingCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).split('').map((char, idx) => (
                                  <div key={idx} className="w-8 h-10 sm:w-9 sm:h-12 bg-white dark:bg-[#111b21] border border-gray-300 dark:border-[#202c33] rounded-xl flex items-center justify-center text-lg sm:text-2xl font-mono font-black text-[#00a884] dark:text-[#e9edef] shadow-sm">
                                    {char.toUpperCase()}
                                  </div>
                                ))}
                              </div>

                              <span className="text-xl font-bold text-[#00a884] px-0.5">-</span>

                              {/* Segundo Bloco (4 Dígitos) */}
                              <div className="flex gap-1.5 bg-gray-100 dark:bg-[#0b141a] p-2 sm:p-2.5 rounded-2xl border border-gray-200 dark:border-emerald-500/30 shadow-inner">
                                {pairingCode.replace(/[^a-zA-Z0-9]/g, '').slice(4, 8).split('').map((char, idx) => (
                                  <div key={idx} className="w-8 h-10 sm:w-9 sm:h-12 bg-white dark:bg-[#111b21] border border-gray-300 dark:border-[#202c33] rounded-xl flex items-center justify-center text-lg sm:text-2xl font-mono font-black text-[#00a884] dark:text-[#e9edef] shadow-sm">
                                    {char.toUpperCase()}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Botão de Cópia Rápida com Feedback */}
                            <button
                              onClick={() => {
                                const cleanCode = pairingCode.replace(/[^a-zA-Z0-9]/g, '');
                                navigator.clipboard.writeText(cleanCode);
                                setCopiedCode(true);
                                setTimeout(() => setCopiedCode(false), 2500);
                              }}
                              className={cn(
                                "w-full py-3 px-4 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95",
                                copiedCode
                                  ? "bg-emerald-600 text-white ring-2 ring-emerald-400"
                                  : "bg-[#00a884] hover:bg-[#008f6f] text-white"
                              )}
                            >
                              {copiedCode ? (
                                <>
                                  <CheckCircle size={16} className="animate-bounce" /> Código Copiado com Sucesso!
                                </>
                              ) : (
                                <>
                                  <Smartphone size={16} /> Copiar Código ({pairingCode.toUpperCase().slice(0, 4)}-{pairingCode.toUpperCase().slice(4)})
                                </>
                              )}
                            </button>

                            <p className="text-[11px] text-gray-500 dark:text-[#8696a0] mt-3 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                              Aguardando você digitar este código no WhatsApp do seu celular...
                            </p>
                          </div>
                        ) : (
                          /* Formulário de Ignição do Código */
                          <div className="w-full p-5 bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md border border-gray-200/80 dark:border-[#2c3943]/60 rounded-3xl text-center shadow-lg flex flex-col items-center">
                            <div className="w-12 h-12 rounded-2xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center mb-3 border border-[#00a884]/30 shadow-inner">
                              <Smartphone size={24} />
                            </div>
                            <h4 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">
                              Conectar por Número de Telefone
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-[#8696a0] text-center mb-4 leading-relaxed">
                              Receba um código de 8 dígitos na tela para digitar diretamente no aplicativo do WhatsApp.
                            </p>

                            {targetInstObj?.phone_number ? (
                              <button
                                onClick={() => handleRequestPairingCode(activePollingId, targetInstObj?.api_key)}
                                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00a884] to-teal-600 hover:from-[#008f6f] hover:to-teal-700 text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2"
                              >
                                <Smartphone size={16} /> Gerar Código para {formatPhoneNumber(targetInstObj.phone_number)}
                              </button>
                            ) : (
                              <div className="flex flex-col gap-2.5 w-full">
                                <div className="relative">
                                  <input
                                    type="text"
                                    placeholder="DDD + Telefone (ex: 5511991649959)"
                                    value={pairingPhone}
                                    onChange={(e) => setPairingPhone(e.target.value)}
                                    className="w-full bg-white dark:bg-[#111b21] border border-gray-300 dark:border-[#2c3943]/60 rounded-2xl px-4 py-3 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] shadow-inner tracking-wide"
                                  />
                                </div>
                                <button
                                  onClick={() => handleRequestPairingCode(activePollingId, targetInstObj?.api_key)}
                                  className="w-full py-3.5 bg-gradient-to-r from-[#00a884] to-teal-600 hover:from-[#008f6f] hover:to-teal-700 text-white rounded-2xl font-extrabold text-xs transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                                >
                                  <Smartphone size={16} /> Solicitar Código de 8 Dígitos
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Console da Trilha de Migalhas (Live Stream DevLogger) */}
                    <div className="w-full max-w-sm bg-[#0b141a] dark:bg-[#0b141a] backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl text-left mb-4 shadow-[0_10px_30px_rgba(0,168,132,0.12)] relative overflow-hidden transition-all duration-300">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                            <Activity size={13} className="animate-spin-once" /> Trilha de Migalhas ao Vivo (Handshake)
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                          {breadcrumbsLogs.length > 0 ? `Passo ${breadcrumbsLogs[breadcrumbsLogs.length - 1]?.step || 1}/7` : 'Aguardando Leitura'}
                        </span>
                      </div>

                      <div className="max-h-36 overflow-y-auto styled-scrollbar font-mono text-[11px] space-y-2 pr-1 overflow-x-hidden">
                        {breadcrumbsLogs.length === 0 ? (
                          <div className="py-4 text-center text-slate-400 dark:text-slate-500 text-[11px] italic flex flex-col items-center justify-center gap-2">
                            <Loader2 size={18} className="animate-spin text-[#00a884]" />
                            <span>Escaneie o QR Code ou digite o código no celular para acompanhar a trilha...</span>
                          </div>
                        ) : (
                          breadcrumbsLogs.map((log, idx) => (
                            <div 
                              key={log.id || idx}
                              className={`flex flex-col p-2.5 rounded-xl border animate-in fade-in slide-in-from-bottom-2 duration-300 ${log.type === 'error' ? 'bg-red-500/15 border-red-500/40 text-red-300' : log.step >= 6 ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-200'}`}
                            >
                              <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1">
                                <span className="text-emerald-400 font-bold font-mono tracking-wide">Passo {log.step}/{log.total}</span>
                                <span className="text-[9px] opacity-75 font-mono">{log.timestamp}</span>
                              </div>
                              <p className="text-[11px] font-medium leading-relaxed font-mono flex items-start gap-1 break-words">
                                <span>{log.message}</span>
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Caixa de Instruções Dinâmicas "Como Conectar" */}
                    <div className="w-full max-w-sm bg-white/80 dark:bg-[#202c33]/90 backdrop-blur-md border border-gray-200/80 dark:border-[#2c3943]/60 p-4 rounded-2xl text-left mb-4 shadow-sm">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-[#e9edef] mb-3 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00a884] shadow-sm"></span> Como conectar ({connectMode === 'qr' ? 'via QR Code' : 'via Código de Pareamento'}):
                      </h4>
                      {connectMode === 'qr' ? (
                        <ol className="text-xs text-gray-600 dark:text-[#8696a0] space-y-2.5 leading-relaxed">
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">1</span>
                            <span>Abra o <strong>WhatsApp</strong> no seu celular</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">2</span>
                            <span>Toque em <strong>Menu (⋮)</strong> ou <strong>Configurações (⚙)</strong></span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">3</span>
                            <span>Toque em <strong>Dispositivos conectados</strong></span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">4</span>
                            <span>Toque em <strong>Conectar um dispositivo</strong></span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">5</span>
                            <span>Aponte a câmera para esta tela</span>
                          </li>
                        </ol>
                      ) : (
                        <ol className="text-xs text-gray-600 dark:text-[#8696a0] space-y-2.5 leading-relaxed">
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">1</span>
                            <span>Abra o <strong>WhatsApp</strong> no celular ➔ <strong>Dispositivos conectados</strong></span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">2</span>
                            <span>Toque em <strong>Conectar um dispositivo</strong></span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">3</span>
                            <span>Na tela da câmera, toque em <strong>"Conectar com número de telefone"</strong> no rodapé</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">4</span>
                            <span>Digite o <strong>código de 8 dígitos</strong> exibido nesta tela</span>
                          </li>
                        </ol>
                      )}
                    </div>

                    {/* Botões de Ação na base */}
                    <div className="flex gap-2.5 w-full max-w-sm">
                      <button
                        onClick={() => {
                          setQrBase64(null);
                          setConnectionStatusMessage(null);
                          setPairingCode(null);
                          setLoading(true);
                          handleConnectExisting(existingInstances.find(i => i.id === activePollingId), true);
                        }}
                        className="flex-1 py-3 px-4 bg-gradient-to-r from-[#00a884] to-teal-600 hover:from-[#008f6f] hover:to-teal-700 text-white rounded-xl transition-all font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                      >
                        <RefreshCcw size={14} className="animate-spin-once" /> Atualizar QR / Código
                      </button>
                      <button
                        onClick={() => {
                          setQrBase64(null);
                          setLoading(false);
                          setActivePollingId(null);
                          setPairingCode(null);
                          setPairingPhone('');
                          setConnectionStatusMessage(null);
                          setCodeEntered(false);
                          setHasSeenAwaitingState(false);
                        }}
                        className="py-3 px-4 bg-gray-200 dark:bg-[#202c33] border border-gray-300 dark:border-[#2c3943]/40 hover:bg-gray-300 dark:hover:bg-[#2c3943]/70 text-gray-800 dark:text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold text-xs active:scale-95 shadow-sm"
                        title="Fechar janela de pareamento"
                      >
                        <X size={14} /> Fechar
                      </button>
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 py-10">
                  <Loader2
                    className="animate-spin text-emerald-500"
                    size={48}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium tracking-wide">
                    Comunicando...
                  </span>
                </div>
              ) : successMsg ? (
                <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center justify-center w-full py-8 text-center">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full border-2 border-emerald-500/30 flex items-center justify-center mb-6 shadow-inner animate-bounce">
                    <CheckCircle
                      size={44}
                      className="text-emerald-500 drop-shadow-md"
                    />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                    Conexão Estabelecida!
                  </h3>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 max-w-xs leading-relaxed px-4">
                    {successMsg}
                  </p>
                </div>
              ) : targetInstObj ? (
                <div className="flex flex-col w-full animate-in fade-in zoom-in-95 duration-300 items-center py-6 px-4">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full border-2 border-emerald-500/30 flex items-center justify-center mb-6 shadow-inner">
                    <QrCode
                      size={36}
                      className="text-emerald-500 drop-shadow-md"
                    />
                  </div>
                  <h3 className="text-xl w-full font-bold text-gray-800 dark:text-white mb-2 text-center truncate px-2">
                    {targetInstObj.display_name}
                  </h3>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mb-8 px-2 leading-relaxed">
                    Esta conexão está offline no motor principal. Clique abaixo
                    para gerar o{" "}
                    <strong className="text-emerald-500 font-bold tracking-wide">
                      QR Code
                    </strong>{" "}
                    e ativá-la.
                  </p>
                  <button
                    onClick={() => handleConnectExisting(targetInstObj, true)}
                    className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-4 rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(0,168,132,0.5)] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={20} />
                    Gerar QR Code
                  </button>
                </div>
              ) : (
                <div className="flex flex-col w-full animate-in fade-in zoom-in-95 duration-300 items-center">
                  {/* Tabs */}
                  <div className="flex w-full bg-black/10 dark:bg-white/5 rounded-2xl p-1 mb-6">
                    <button
                      onClick={() => setTab("existing")}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${tab === "existing" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                    >
                      Associar Existente
                    </button>
                    <button
                      onClick={() => setTab("new")}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${tab === "new" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                    >
                      Criar Nova
                    </button>
                  </div>

                  {tab === "existing" ? (
                    <div className="w-full flex flex-col gap-3 min-h-[160px] animate-in slide-in-from-right-4 duration-300">
                      <div className="w-full mb-2">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          Nome ou ID da Instância
                        </label>
                        <input
                          autoFocus
                          type="text"
                          id="ext-name"
                          value={extName}
                          onChange={(e) => setExtName(e.target.value)}
                          placeholder="Identificador da Instância"
                          className="w-full bg-white/50 dark:bg-black/40 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all shadow-sm"
                        />
                      </div>
                      <div className="w-full mb-4">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          API Key (Segurança)
                        </label>
                        <input
                          type="password"
                          id="ext-apikey"
                          value={extApiKey}
                          onChange={(e) => setExtApiKey(e.target.value)}
                          placeholder="Sua chave secreta (API Key)"
                          className="w-full bg-white/50 dark:bg-black/40 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all font-mono shadow-sm"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          const nameVal = extName.trim();
                          const apikeyVal = extApiKey.trim();

                          if (!nameVal || !apikeyVal) {
                            setError(
                              "Ops! O Nome/ID e a API Key são obrigatórios.",
                            );
                            return;
                          }

                          setLoading(true);
                          setError(null);
                          setQrBase64(null);

                          try {
                            const tenantId =
                              localStorage.getItem("current_tenant_id") ||
                              sessionStorage.getItem("current_tenant_id");
                            if (!tenantId)
                              throw new Error("Tenant não identificado");

                            const { data: list, error: err } = await supabase
                              .from("whatsapp_instances")
                              .select("*")
                              .eq("tenant_id", tenantId);

                            if (err) throw err;

                            const match = list?.find(
                              (i) =>
                                i.id === nameVal || i.display_name === nameVal,
                            );

                            if (!match) {
                              throw new Error(
                                "🚫 Instância não encontrada com este nome.",
                              );
                            }
                            if (
                              match.api_key &&
                              match.api_key.trim() !== apikeyVal
                            ) {
                              throw new Error(
                                "⛔ API Key incorreta! Acesso negado.",
                              );
                            }

                            if (
                              match.connection_status === "connected" ||
                              match.status === "connected" ||
                              match.connection_status === "connected_local" ||
                              match.status === "connected_local"
                            ) {
                              useChatStore
                                .getState()
                                .updateTenantInstance(match.id);
                              setEvolutionConnection(true, match.id);
                              useChatStore
                                .getState()
                                .syncEvolutionContacts(match.id);
                              setLoading(false);
                              setTimeout(onClose, 1000);
                              return;
                            }

                            setActivePollingId(match.id);
                            await createInstance(
                              tenantId,
                              match.id,
                              match.api_key || "",
                            );
                          } catch (err: any) {
                            setError(
                              err.message ||
                                "Erro ao conectar. Tente novamente.",
                            );
                            setLoading(false);
                          }
                        }}
                        className="bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-200 w-full px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Link size={18} />
                        Conectar com Segurança
                      </button>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col">
                      <div className="w-full mb-4">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          Nome da Instância
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="Ex: WhatsApp Operacional"
                          className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div className="w-full mb-4">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          ApiKey da Instância
                        </label>
                        <input
                          type="text"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                          placeholder="Deixe em branco para auto-gerar"
                          className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all font-mono"
                        />
                      </div>

                      <div className="w-full mb-4">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          Cor da Instância
                        </label>
                        <div className="flex gap-2">
                          {INSTANCE_COLORS.map((color) => (
                            <button
                              key={color.value}
                              onClick={() => setCustomColor(color.value)}
                              className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${customColor === color.value ? "ring-2 ring-offset-2 ring-emerald-500 scale-110" : "hover:scale-105 border border-black/10 dark:border-white/10"}`}
                              style={{ backgroundColor: color.value }}
                              title={color.label}
                            >
                              {customColor === color.value && (
                                <CheckCircle
                                  size={14}
                                  className="text-white drop-shadow"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="w-full mb-4">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">
                          Som de Notificação
                        </label>
                        <select
                          value={customSound}
                          onChange={(e) => {
                            setCustomSound(e.target.value);
                            playNotificationSound(e.target.value);
                          }}
                          className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                        >
                          {NOTIFICATION_SOUNDS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleGenerateNew}
                        className="bg-emerald-500 hover:bg-emerald-400 w-full text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 mt-4"
                      >
                        <PlusCircle size={18} />
                        Gerar Nova Conexão
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
      
      {/* Modal Premium de Ações de Grupo */}
      {actionModal && actionModal.isOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white/90 dark:bg-[#1a222c]/90 backdrop-blur-2xl w-full max-w-sm rounded-[2rem] border border-white/20 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] p-8 flex flex-col items-center zoom-in-95 animate-in duration-300">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
               {actionModal.type === 'subject' && <PenSquare size={28} />}
               {actionModal.type === 'description' && <PenSquare size={28} />}
               {actionModal.type === 'participants' && <UserPlus size={28} />}
               {actionModal.type === 'avatar' && <QrCode size={28} />}
               {actionModal.type === 'ephemeral' && <Settings size={28} />}
               {actionModal.type === 'settings' && <ShieldCheck size={28} />}
            </div>
            
            <h3 className="text-xl font-black text-gray-800 dark:text-white text-center mb-2 tracking-tight">
              {actionModal.type === 'subject' && 'Alterar Nome'}
              {actionModal.type === 'description' && 'Editar Descrição'}
              {actionModal.type === 'participants' && 'Adicionar Membros'}
              {actionModal.type === 'avatar' && 'Foto do Grupo'}
              {actionModal.type === 'ephemeral' && 'Mensagens Temporárias'}
              {actionModal.type === 'settings' && 'Configurações'}
            </h3>
            
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
              {actionModal.type === 'subject' && 'Digite o novo nome para este grupo.'}
              {actionModal.type === 'description' && 'Insira a nova descrição do grupo.'}
              {actionModal.type === 'participants' && 'Digite os números com DDD separados por vírgula.'}
              {actionModal.type === 'avatar' && 'Insira a URL da nova imagem de perfil do grupo.'}
              {actionModal.type === 'ephemeral' && 'Defina o tempo de expiração em segundos (Ex: 86400 para 24h, 604800 para 7 dias, ou 0 para desativar).'}
              {actionModal.type === 'settings' && 'Altere quem pode enviar mensagens ou editar dados do grupo.'}
            </p>

            <div className="w-full space-y-4">
              <input
                autoFocus
                type="text"
                value={modalInput1}
                onChange={(e) => setModalInput1(e.target.value)}
                placeholder={
                  actionModal.type === 'subject' ? 'Novo Nome' :
                  actionModal.type === 'participants' ? 'Ex: 5511999999999' :
                  actionModal.type === 'avatar' ? 'URL da Imagem' :
                  actionModal.type === 'ephemeral' ? 'Expiração em Segundos' :
                  'Novo valor...'
                }
                className="w-full bg-black/5 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="flex gap-3 w-full mt-8">
              <button
                onClick={() => setActionModal(null)}
                className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    const cId = localStorage.getItem("current_tenant_id") || sessionStorage.getItem("current_tenant_id");
                    const tInstanceId = targetInstanceName || useChatStore.getState().connectedInstanceName;
                    const currInst = existingInstances.find((i) => i.id === tInstanceId);
                    
                    if (!cId || !tInstanceId || !selectedGroup) throw new Error("Dados ausentes.");

                    if (actionModal.type === 'subject') {
                      await updateEngineGroupSubject(cId, tInstanceId, currInst?.api_key || "", selectedGroup.id, modalInput1);
                      setSelectedGroup({ ...selectedGroup, subject: modalInput1 });
                    } else if (actionModal.type === 'description') {
                      await updateEngineGroupDescription(cId, tInstanceId, currInst?.api_key || "", selectedGroup.id, modalInput1);
                      if (groupMetadata) setGroupMetadata({ ...groupMetadata, desc: modalInput1 });
                    } else if (actionModal.type === 'participants') {
                      const numeros = modalInput1.split(",").map((p) => p.trim() + "@s.whatsapp.net");
                      await updateEngineGroupParticipants(cId, tInstanceId, currInst?.api_key || "", selectedGroup.id, numeros, "add");
                      // Ideally fetch metadata again
                    } else if (actionModal.type === 'avatar') {
                      await updateEngineGroupProfilePicture(cId, tInstanceId, currInst?.api_key || "", selectedGroup.id, modalInput1);
                      setGroupAvatar(modalInput1);
                    } else if (actionModal.type === 'ephemeral') {
                      await toggleEngineGroupEphemeral(cId, tInstanceId, currInst?.api_key || "", selectedGroup.id, parseInt(modalInput1, 10));
                    }
                    
                    setActionModal(null);
                  } catch (e: any) {
                    console.error("Erro na ação do modal:", e);
                    // Opcionalmente podemos mostrar um erro visual aqui
                  }
                }}
                className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/30 transition-all active:scale-95"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
