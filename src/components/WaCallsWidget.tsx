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
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="fixed z-[100] w-full max-w-[340px] md:w-80 overflow-hidden rounded-[24px] border border-gray-200/50 dark:border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-xl bg-white/95 dark:bg-[#111b21]/95 font-sans transition-all bottom-4 left-4 right-4 mx-auto md:bottom-24 md:right-6 md:left-auto md:mx-0"
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-[#00a884] to-[#008f72] text-white select-none">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnectedSSE ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-rose-400 shadow-[0_0_8px_#f87171]"} animate-pulse`} />
              <span className="text-xs font-bold uppercase tracking-wider">Chamadas de Voz VoIP</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-all text-white/90 hover:text-white"
                title="Configurações de Áudio"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpenWidget(false)}
                className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-all text-white/90 hover:text-white"
                title="Fechar Discador"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Menu de Configurações do Microfone */}
          {showSettings && (
            <div className="p-4 border-b border-gray-150 dark:border-white/5 bg-gray-50/70 dark:bg-[#202c33]/40 rounded-b-2xl animate-in slide-in-from-top-2 duration-255">
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Selecione o Microfone
              </label>
              <select
                value={micDeviceId || ""}
                onChange={(e) => setMicDeviceId(e.target.value || null)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-250 dark:border-white/5 bg-white dark:bg-[#111b21] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] transition-all shadow-sm"
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
          <div className="p-5 min-h-[170px] flex flex-col justify-between">
            {activeCall ? (
              /* 1. Tela de Chamada Ativa */
              <div className="flex flex-col items-center justify-center text-center flex-1 py-3 animate-in fade-in duration-200">
                <div className="relative mb-4 flex items-center justify-center">
                  <div className="absolute w-24 h-24 rounded-full bg-[#00a884]/10 animate-ping duration-[1800ms]" />
                  <div className="absolute w-20 h-20 rounded-full bg-[#00a884]/15 animate-pulse duration-[1000ms]" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#00a884] to-[#05cd9e] flex items-center justify-center text-white shadow-md">
                    <User className="w-7 h-7" />
                  </div>
                </div>

                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base tracking-tight leading-tight">
                  {formatPeer(activeCall.peer)}
                </h3>
                
                <div className="flex items-center gap-1.5 mt-2 mb-6 px-3 py-1 rounded-full bg-gray-100/80 dark:bg-[#202c33]/70 border border-gray-200/20">
                  <Clock className="w-3.5 h-3.5 text-[#00a884] animate-pulse" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-mono font-bold">
                    {activeCall.status === "connected" ? (
                      formatDuration(callDuration)
                    ) : (
                      <span className="animate-pulse flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-[#00a884]" />
                        {activeCall.status === "starting" ? "Iniciando..." : "Chamando..."}
                      </span>
                    )}
                  </span>
                </div>

                {/* Ações de Chamada Ativa */}
                <div className="flex items-center gap-6 mt-1">
                  <button
                    onClick={handleToggleMute}
                    className={`p-3.5 rounded-full transition-all duration-200 active:scale-90 border shadow-sm ${
                      isMuted 
                        ? "bg-rose-500 text-white border-rose-400/20" 
                        : "bg-gray-100 dark:bg-[#202c33] text-gray-600 dark:text-gray-300 hover:bg-gray-250 dark:hover:bg-gray-700/80 border-transparent"
                    }`}
                    title={isMuted ? "Habilitar Microfone" : "Mudar Microfone"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={handleEndCall}
                    className="p-4 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition-all duration-200 active:scale-85 hover:rotate-90 hover:scale-105 shadow-[0_4px_14px_rgba(244,63,94,0.35)]"
                    title="Desligar Ligação"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ) : incoming ? (
              /* 2. Tela de Chamada Recebida */
              <div className="flex flex-col items-center justify-center text-center flex-1 py-3 animate-in fade-in duration-200">
                <div className="relative mb-4 flex items-center justify-center">
                  <div className="absolute w-24 h-24 rounded-full bg-blue-500/10 animate-ping duration-[1800ms]" />
                  <div className="absolute w-20 h-20 rounded-full bg-blue-500/15 animate-pulse duration-[1000ms]" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md">
                    <Phone className="w-7 h-7 animate-bounce" />
                  </div>
                </div>

                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base tracking-tight leading-tight">
                  Recebendo Chamada...
                </h3>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 mb-6">
                  {formatPeer(incoming.peer)}
                </p>

                <div className="flex items-center gap-6 mt-1">
                  <button
                    onClick={handleRejectCall}
                    className="p-3.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition-all duration-200 active:scale-90 shadow-[0_4px_14px_rgba(244,63,94,0.25)]"
                    title="Recusar Chamada"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleAcceptCall}
                    className="p-3.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white transition-all duration-200 active:scale-90 shadow-[0_4px_14px_rgba(0,168,132,0.3)] animate-bounce"
                    title="Aceitar Chamada"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              /* 3. Discador Padrão (Chamada Manual) */
              <form onSubmit={handleStartCall} className="flex flex-col gap-4 flex-1 justify-center animate-in fade-in duration-200">
                <div className="text-center mb-1 select-none">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Discar número para fazer ligação de voz
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Ex: 5511999999999"
                    className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-[#202c33] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] transition-all shadow-inner placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  <button
                    type="submit"
                    disabled={!phoneNumber.trim()}
                    className="p-2.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white disabled:opacity-40 disabled:hover:bg-[#00a884] transition-all active:scale-95 shadow-[0_3px_10px_rgba(0,168,132,0.2)] flex items-center justify-center cursor-pointer"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-center mt-1 border-t border-gray-150/40 dark:border-white/5 pt-3 select-none">
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
