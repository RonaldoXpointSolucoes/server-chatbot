import React, { useState, useEffect, useRef } from "react";
import { useWaCallsStore, CallSummary } from "../store/useWaCallsStore";
import { useChatStore, instanceCache } from "../store/chatStore";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Settings, 
  X, 
  Dialer, 
  User, 
  Grid3X3,
  Loader2,
  Clock
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function WaCallsWidget() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const contacts = useChatStore((s) => s.contacts) || [];
  const activeChannelFilter = useChatStore((s) => s.activeChannelFilter);
  const connectedInstanceName = useChatStore((s) => s.connectedInstanceName);
  const evolution_api_instance = useChatStore((s) => s.evolution_api_instance);
  
  const {
    calls,
    incoming,
    ownConnections,
    micDeviceId,
    isConnectedSSE,
    sessions,
    isOpenWidget,
    setMicDeviceId,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    setIsOpenWidget
  } = useWaCallsStore();

  const activeInstanceId = evolution_api_instance || activeChannelFilter || connectedInstanceName;

  const [phoneNumber, setPhoneNumber] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [callDuration, setCallDuration] = useState(0);

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Encontra a chamada ativa local vinculada
  const activeCall = calls.find(
    (c) => ownConnections.has(c.callId) || (incoming && c.callId === incoming.callId)
  );

  // Carrega dispositivos de entrada de áudio
  useEffect(() => {
    async function loadDevices() {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devList.filter((d) => d.kind === "audioinput");
        setDevices(audioInputs);
        if (audioInputs.length > 0 && !micDeviceId) {
          setMicDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Erro ao enumerar dispositivos de áudio:", err);
      }
    }
    loadDevices();
  }, [micDeviceId, setMicDeviceId]);

  // Rastreia e incrementa a duração da chamada ativa
  useEffect(() => {
    if (activeCall && activeCall.status === "connected") {
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [activeCall?.status]);

  // Toca o ringtone se houver chamada recebida
  useEffect(() => {
    if (incoming) {
      if (!ringtoneRef.current) {
        // Criar elemento de áudio oscilador sintético para chamada telefônica
        // para evitar carregar arquivos externos que possam dar 404
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Função auxiliar para tocar o ringtone sintético
        let playInterval: ReturnType<typeof setInterval>;
        const startSynthRing = () => {
          playInterval = setInterval(() => {
            if (!incoming) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            // Frequência de toque telefônico clássico europeu/brasileiro (440Hz + 480Hz)
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 1.5);
          }, 3000);
        };
        
        startSynthRing();
        (ringtoneRef as any).current = {
          stop: () => {
            clearInterval(playInterval);
            try { audioCtx.close(); } catch(e){}
          }
        };
      }
    } else {
      if (ringtoneRef.current) {
        try {
          (ringtoneRef.current as any).stop();
        } catch(e){}
        ringtoneRef.current = null;
      }
    }

    return () => {
      if (ringtoneRef.current) {
        try {
          (ringtoneRef.current as any).stop();
        } catch(e){}
      }
    };
  }, [incoming]);

  // Controla o mute do microfone
  const handleToggleMute = () => {
    if (!activeCall) return;
    const conn = ownConnections.get(activeCall.callId);
    if (conn && conn.micStream) {
      const audioTrack = conn.micStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // Se estava mutado (true), habilita (true), e vice-versa
        setIsMuted(!isMuted);
      }
    }
  };

  const handleStartCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInstanceId) {
      alert("Nenhuma conexão de WhatsApp ativa selecionada no painel.");
      return;
    }
    if (!phoneNumber.trim()) return;

    try {
      await startCall(activeInstanceId, phoneNumber);
      setPhoneNumber("");
      setIsMuted(false);
    } catch (err: any) {
      alert(err.message || "Erro ao efetuar chamada.");
    }
  };

  const handleAcceptCall = async () => {
    if (!incoming) return;
    try {
      setIsMuted(false);
      await acceptCall(incoming.sessionId, incoming.callId);
    } catch (err: any) {
      alert(err.message || "Erro ao aceitar chamada.");
    }
  };

  const handleRejectCall = async () => {
    if (!incoming) return;
    try {
      await rejectCall(incoming.sessionId, incoming.callId);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    try {
      await endCall(activeCall.sessionId, activeCall.callId);
    } catch (err: any) {
      console.error(err);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatPeer = (peerJid: string) => {
    return peerJid.split("@")[0];
  };

  const activeChat = contacts.find(c => c.id === activeChatId);
  const chatInstanceId = activeChat 
    ? (activeChat.instance_id || activeChannelFilter || evolution_api_instance || connectedInstanceName)
    : (activeChannelFilter || evolution_api_instance || connectedInstanceName);
  const chatInstanceNameResolved = chatInstanceId ? (instanceCache.getName(chatInstanceId) || chatInstanceId) : null;
  const isCurrentBoxVoipReady = chatInstanceNameResolved 
    ? (sessions || []).some(s => s && (s.id === chatInstanceNameResolved || s.id === chatInstanceId) && s.paired) 
    : false;

  const shouldShowPanel = !!(isOpenWidget || activeCall || incoming);

  return (
    <AnimatePresence>
      {/* Painel Widget de Chamadas */}
      {shouldShowPanel && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-24 right-6 z-[100] w-80 overflow-hidden rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-xl bg-white/80 dark:bg-[#111b21]/90 font-sans"
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#00a884] text-white">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnectedSSE ? "bg-green-300" : "bg-red-400"}`} />
              <span className="text-sm font-semibold">Chamadas de Voz VoIP</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                title="Configurações de Áudio"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpenWidget(false)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                title="Fechar Discador"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

            {/* Menu de Configurações do Microfone */}
            {showSettings && (
              <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#202c33]/50">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Selecione o Microfone
                </label>
                <select
                  value={micDeviceId || ""}
                  onChange={(e) => setMicDeviceId(e.target.value || null)}
                  className="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111b21] dark:text-white"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microfone ${d.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                  {devices.length === 0 && <option value="">Sem microfones disponíveis</option>}
                </select>
              </div>
            )}

            {/* Conteúdo Principal */}
            <div className="p-4 min-h-[160px] flex flex-col justify-between">
              {activeCall ? (
                /* 1. Tela de Chamada Ativa */
                <div className="flex flex-col items-center justify-center text-center flex-1 py-4">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 bg-[#00a884]/20 rounded-full animate-ping scale-150" />
                    <div className="relative w-16 h-16 rounded-full bg-[#00a884] flex items-center justify-center text-white">
                      <User className="w-8 h-8" />
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">
                    {formatPeer(activeCall.peer)}
                  </h3>
                  
                  <div className="flex items-center gap-1.5 mt-1 mb-6">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 font-mono">
                      {activeCall.status === "connected" ? (
                        formatDuration(callDuration)
                      ) : (
                        <span className="animate-pulse">
                          {activeCall.status === "starting" ? "Iniciando..." : "Chamando..."}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Ações de Chamada Ativa */}
                  <div className="flex items-center gap-6 mt-2">
                    <button
                      onClick={handleToggleMute}
                      className={`p-3 rounded-full transition-colors ${
                        isMuted 
                          ? "bg-red-100 dark:bg-red-950/40 text-red-500" 
                          : "bg-gray-100 dark:bg-[#202c33] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={handleEndCall}
                      className="p-3.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
                    >
                      <PhoneOff className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              ) : incoming ? (
                /* 2. Tela de Chamada Recebida */
                <div className="flex flex-col items-center justify-center text-center flex-1 py-4">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-bounce scale-125" />
                    <div className="relative w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white">
                      <Phone className="w-8 h-8 animate-pulse" />
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                    Recebendo Chamada...
                  </h3>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mt-1 mb-6">
                    {formatPeer(incoming.peer)}
                  </p>

                  <div className="flex items-center gap-6">
                    <button
                      onClick={handleRejectCall}
                      className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
                    >
                      <PhoneOff className="w-5 h-5" />
                    </button>

                    <button
                      onClick={handleAcceptCall}
                      className="p-3 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white transition-colors shadow-lg animate-bounce"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* 3. Discador Padrão (Chamada Manual) */
                <form onSubmit={handleStartCall} className="flex flex-col gap-4 flex-1 justify-center">
                  <div className="text-center mb-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Discar número para fazer ligação de voz
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Ex: 5511999999999"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#202c33] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                    />
                    <button
                      type="submit"
                      disabled={!phoneNumber.trim()}
                      className="p-2 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white disabled:opacity-50 disabled:hover:bg-[#00a884] transition-colors"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="text-center mt-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      O número deve conter o código do país e DDD
                    </span>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
