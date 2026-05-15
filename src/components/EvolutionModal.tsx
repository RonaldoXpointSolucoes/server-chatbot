import { useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
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
  const { evolutionConnected, setEvolutionConnection, modalReason, contacts } =
    useChatStore();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineUser, setEngineUser] = useState<any>(null);

  const [tab, setTab] = useState<"existing" | "new">("new");
  const [existingInstances, setExistingInstances] = useState<any[]>([]);

  const [extName, setExtName] = useState("");
  const [extApiKey, setExtApiKey] = useState("");
  const [customName, setCustomName] = useState<string>("");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [customColor, setCustomColor] = useState<string>("#10b981");
  const [customSound, setCustomSound] = useState<string>("default");
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
  const [modalInput2, setModalInput2] = useState("");

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

  const handleConnectExisting = async (inst: any) => {
    setLoading(true);
    setError(null);
    setQrBase64(null);
    try {
      if (
        inst.connection_status === "connected" ||
        inst.status === "connected"
      ) {
        useChatStore.getState().updateTenantInstance(inst.id);
        setEvolutionConnection(true, inst.id);
        useChatStore.getState().syncEvolutionContacts(inst.id);
        setLoading(false);
        setTimeout(onClose, 1000);
        return;
      }

      const cId =
        localStorage.getItem("current_tenant_id") ||
        sessionStorage.getItem("current_tenant_id");
      if (!cId) throw new Error("Tenant não identificado");

      setActivePollingId(inst.id);
      await createInstance(cId, inst.id, inst.api_key || "");
    } catch (err: any) {
      setError(err.message || "Erro ao conectar motor.");
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
    setQrBase64(null);

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
      setError(err.message || "Erro de comunicação com o sistema.");
      setLoading(false);
    }
  };

  // SUBSCRIPTION DO REALTIME DE CONEXÃO
  useEffect(() => {
    if (!activePollingId) return;

    const tenantId =
      localStorage.getItem("current_tenant_id") ||
      sessionStorage.getItem("current_tenant_id");
    const channelName = `tenant:${tenantId}:instance:${activePollingId}`;

    console.log(`[Realtime] Inscrito no canal: ${channelName}`);
    const channel = supabase.channel(channelName);

    // Timeout de segurança contra loop infinito
    const timeoutId = setTimeout(() => {
      if (loading) {
        setError(
          "Erro: Timeout de Conexão. O Motor não respondeu em 20 segundos. Verifique as chaves ou se a engine está online.",
        );
        setLoading(false);
        setQrBase64(null);
        setActivePollingId(null);
      }
    }, 20000); // 20s timeout

    channel
      .on("broadcast", { event: "instance.qr_updated" }, (payload: any) => {
        if (payload.payload?.qr_code) {
          setQrBase64(payload.payload.qr_code);
          setLoading(false);
        }
      })
      .on("broadcast", { event: "instance.status" }, (payload: any) => {
        const st = payload.payload?.status;
        if (st === "offline") {
          setError(
            payload.payload?.reason
              ? `Falha com código: ${payload.payload.reason}`
              : "A conexão caiu ou foi rejeitada.",
          );
          setLoading(false);
          setQrBase64(null);
          setActivePollingId(null);
        } else if (st === "connected") {
          setLoading(false);
          setQrBase64(null);
          setActivePollingId(null);
          setEvolutionConnection(true, activePollingId);
          useChatStore.getState().syncEvolutionContacts(activePollingId);
          setTimeout(onClose, 1000);
        }
      })
      .subscribe((status) => {
        console.log(`[Realtime] Status inscrição modal:`, status);
      });

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [activePollingId, loading]);

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
              st?.data?.status === "connected" &&
              st?.data?.whatsapp_instance_runtime?.user_profile
            ) {
              setEngineUser(st.data.whatsapp_instance_runtime.user_profile);
            } else if (st?.data?.status !== "connected") {
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

  const targetInstObj = targetInstanceName
    ? existingInstances.find((i) => i.id === targetInstanceName)
    : null;

  const isTargetConnected = targetInstObj
    ? targetInstObj.status === "connected" ||
      targetInstObj.connection_status === "connected"
    : evolutionConnected;

  const displayNameToUse = targetInstObj
    ? targetInstObj.display_name
    : engineUser?.name || "Motor Ativado";

  const [configTab, setConfigTab] = useState<"geral" | "grupos">("geral");

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
        .select('id, phone_number, tags')
        .eq('tenant_id', cId);

      const existingMap = new Map();
      if (existingContacts) {
        existingContacts.forEach(c => {
          if (c.phone_number) {
            existingMap.set(c.phone_number, c);
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
            phone_number: num,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-300">
      <div className={`bg-white/70 dark:bg-[#111b21]/70 backdrop-blur-2xl rounded-3xl shadow-2xl w-full flex flex-col border border-white/50 dark:border-white/10 relative transition-all duration-500 overflow-hidden ${isExpanded ? 'max-w-6xl h-[95vh]' : 'max-w-sm max-h-[90vh]'}`}>
        <button onClick={onClose} className="absolute top-5 right-5 z-20 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white/50 dark:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center">X</button>
        <div className={`w-full overflow-y-auto styled-scrollbar p-8 flex flex-col ${isExpanded ? 'items-stretch' : 'items-center'} h-full relative`}>
        
        {!isExpanded && (
           <h2 className="text-2xl font-black tracking-tight text-gray-800 dark:text-white mb-1 flex items-center gap-2 self-center">
             <Smartphone className="text-emerald-500"/> {targetInstObj ? targetInstObj.display_name : 'App Connect'}
           </h2>
        )}

          {modalReason ? (
            <p className="text-sm font-medium text-center text-orange-600 bg-orange-500/10 p-3 rounded-2xl my-3 border border-orange-500/20">
              {modalReason}
            </p>
          ) : (
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-6 mt-1 font-medium bg-black/5 dark:bg-white/5 py-1 px-3 rounded-full">
              Motor Inteligente
            </p>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs mb-4 flex items-start w-full gap-2 transition-all">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {isTargetConnected ? (
            <div className="flex flex-col w-full animate-in zoom-in slide-in-from-bottom-4 duration-500 delay-150">
              <div className="flex flex-col items-center bg-emerald-500/10 p-6 rounded-3xl border border-emerald-500/20 mb-2 relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                {engineUser && !targetInstObj ? (
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-500/50 flex items-center justify-center mb-4 overflow-hidden">
                    <UserCircle2
                      size={40}
                      className="text-emerald-500 drop-shadow-md"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-500/50 flex items-center justify-center mb-4">
                    <CheckCircle
                      size={40}
                      className="text-emerald-500 drop-shadow-md"
                    />
                  </div>
                )}

                <h3 className="font-bold text-lg text-emerald-700 dark:text-emerald-400">
                  {displayNameToUse}
                </h3>

                {engineUser?.id && (
                  <p className="text-[10px] bg-white/50 dark:bg-black/40 px-2 py-0.5 rounded text-gray-500 mt-1 font-mono">
                    +{engineUser.id.split(":")[0]}
                  </p>
                )}

                <div className="flex justify-center items-center gap-2 mt-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    <Signal size={14} className="animate-pulse" /> NATIVO
                    BAILLEYS CORE
                  </span>
                </div>

                {/* Abas de Configuração */}
                <div className="flex w-full bg-black/5 dark:bg-white/5 rounded-2xl p-1 mt-6 mb-2">
                  <button
                    onClick={() => setConfigTab("geral")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${configTab === "geral" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                  >
                    Geral
                  </button>
                  <button
                    onClick={() => setConfigTab("grupos")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${configTab === "grupos" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                  >
                    Grupos & Ops
                  </button>
                </div>

                {configTab === "geral" && (
                  <div className="w-full animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="w-full mt-4 flex flex-col items-center">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-tight">
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
                            className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${targetInstObj?.color === color.value ? "ring-2 ring-offset-2 ring-emerald-500 scale-110" : "hover:scale-105 border border-white/20"}`}
                            style={{ backgroundColor: color.value }}
                            title={color.label}
                          >
                            {targetInstObj?.color === color.value && (
                              <CheckCircle
                                size={14}
                                className="text-white drop-shadow"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="w-full mt-4 flex flex-col items-center">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-tight">
                        Som de Notificação
                      </p>
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
                        className="w-full max-w-[200px] bg-white/50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all shadow-sm text-center"
                      >
                        {NOTIFICATION_SOUNDS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 w-full mt-6">
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
                        className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-red-500/10 hover:text-red-500 border border-transparent hover:border-red-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                      >
                        <LogOut
                          size={18}
                          className="group-hover:text-red-500 text-gray-400 transition-colors"
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
                        className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                      >
                        <RefreshCcw
                          size={18}
                          className="group-hover:text-emerald-500 text-gray-400 animate-in spin-in transition-colors"
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
                        className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                      >
                        <UserCircle2
                          size={18}
                          className="group-hover:text-emerald-500 text-gray-400 transition-colors"
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
                        className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                      >
                        <Signal
                          size={18}
                          className="group-hover:text-emerald-500 text-gray-400 transition-colors"
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
                        className="flex col-span-2 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-orange-500/10 hover:text-orange-500 border border-transparent hover:border-orange-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                      >
                        <AlertCircle
                          size={18}
                          className="group-hover:text-orange-500 text-gray-400 transition-colors"
                        />
                        Limpar RAM (Memory Leak Prevention)
                      </button>
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
                                            .eq("id", selectedGroup.id)
                                            .maybeSingle();

                                          if (existingContact) {
                                            contactData = existingContact;
                                          } else {
                                            const { data: newContact } = await supabase
                                              .from("contacts")
                                              .insert({
                                                id: selectedGroup.id,
                                                tenant_id: cId,
                                                name: groupSubject,
                                                phone: num,
                                                whatsapp_jid: selectedGroup.id,
                                                is_group: true,
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
                                              .select("id")
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
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center min-h-[260px] bg-white/30 dark:bg-black/30 p-2 sm:p-5 rounded-3xl border border-white/20 dark:border-white/5 shadow-inner">
              {loading ? (
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 py-10">
                  <Loader2
                    className="animate-spin text-emerald-500"
                    size={48}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium tracking-wide">
                    Comunicando...
                  </span>
                </div>
              ) : qrBase64 ? (
                <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center w-full pb-4">
                  <div className="p-3 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/50">
                    <img
                      src={qrBase64}
                      alt="QR Code"
                      className="w-[200px] h-[200px] rounded-2xl"
                    />
                  </div>
                  <p className="text-center text-xs mt-6 mb-2 text-gray-500 dark:text-gray-400 font-medium">
                    Escaneie o QR Code no seu WhatsApp.
                  </p>
                  <button
                    onClick={() => {
                      setQrBase64(null);
                      setLoading(false);
                      setActivePollingId(null);
                    }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 uppercase mt-2 bg-emerald-500/10 px-4 py-2 rounded-full hover:bg-emerald-500/20 transition-colors"
                  >
                    Cancelar
                  </button>
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
                    onClick={() => handleConnectExisting(targetInstObj)}
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
                              match.status === "connected"
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
