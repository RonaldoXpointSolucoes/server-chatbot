import { create } from "zustand";
import { openCall, OpenCall } from "../lib/webrtc";
import { hasUserAccessToInstance } from "./chatStore";
import { shouldNotifyForEvent } from "../services/notificationPreferences";


const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export type CallStatus = "starting" | "ringing" | "connected" | "ended";

export type CallSummary = {
  sessionId: string;
  callId: string;
  owner: string | null;
  direction: "outbound" | "inbound";
  peer: string;
  startedAt: number;
  status: CallStatus;
};

export type IncomingPayload = {
  sessionId: string;
  callId: string;
  peer: string;
  offeredAt: number;
};

export type SessionState = "disconnected" | "connecting" | "connected";

export type SessionInfo = {
  id: string;
  name: string;
  jid: string;
  status: SessionState;
  paired: boolean;
};

type State = {
  calls: CallSummary[];
  incoming: IncomingPayload | null;
  ownConnections: Map<string, OpenCall>;
  micDeviceId: string | null;
  sessions: SessionInfo[];
  qrCodes: Record<string, string>; // sid -> qr
  clientId: string;
  isConnectedSSE: boolean;
  isOpenWidget: boolean;
};

type Actions = {
  setMicDeviceId: (id: string | null) => void;
  startCall: (sid: string, phone: string, record?: boolean) => Promise<string>;
  acceptCall: (sid: string, callId: string) => Promise<string>;
  rejectCall: (sid: string, callId: string) => Promise<void>;
  endCall: (sid: string, callId: string) => Promise<void>;
  initSSE: () => void;
  closeSSE: () => void;
  fetchSessions: () => Promise<SessionInfo[]>;
  createSession: (sid: string) => Promise<any>;
  logoutSession: (sid: string) => Promise<void>;
  pairSession: (sid: string) => Promise<any>;
  setIsOpenWidget: (open: boolean) => void;
};

const getClientId = (): string => {
  const KEY = "wacalls.clientId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = typeof crypto.randomUUID === "function" 
      ? crypto.randomUUID() 
      : "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
};

let eventSource: EventSource | null = null;

export const useWaCallsStore = create<State & Actions>((set, get) => ({
  calls: [],
  incoming: null,
  ownConnections: new Map(),
  micDeviceId: null,
  sessions: [],
  qrCodes: {},
  clientId: getClientId(),
  isConnectedSSE: false,
  isOpenWidget: false,

  setMicDeviceId: (id) => set({ micDeviceId: id }),
  setIsOpenWidget: (open) => set({ isOpenWidget: open }),

  startCall: async (sid, phone, record = false) => {
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = "55" + cleanPhone;
    }
    
    // 1. Inicia a chamada na API
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone, record }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro ao iniciar chamada (Status ${response.status})`);
    }

    const { call } = await response.json();
    
    // 2. Abre o WebRTC Data Channel e inicia a transmissão de mídia
    try {
      const conn = await openCall(sid, call.callId, get().micDeviceId);
      set((state) => {
        const next = new Map(state.ownConnections);
        next.set(call.callId, conn);
        
        // Adiciona a chamada localmente de forma preventiva para abrir o widget de imediato
        const localCall: CallSummary = {
          sessionId: sid,
          callId: call.callId,
          owner: get().clientId,
          direction: "outbound",
          peer: cleanPhone + "@s.whatsapp.net",
          startedAt: Date.now(),
          status: "starting"
        };
        
        // Evita duplicidade se o SSE for ultra rápido
        const updatedCalls = state.calls.some(c => c.callId === call.callId)
          ? state.calls
          : [...state.calls, localCall];

        return { 
          ownConnections: next,
          calls: updatedCalls,
          isOpenWidget: true 
        };
      });
    } catch (e: any) {
      console.error("[useWaCallsStore/startCall] Falha ao abrir WebRTC:", e.message);
      // Cancela a chamada se falhar na mídia
      await get().endCall(sid, call.callId);
      throw e;
    }

    return call.callId;
  },

  acceptCall: async (sid, callId) => {
    // 1. Aceita a chamada na API
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/calls/${callId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Falha ao aceitar chamada na API (Status ${response.status})`);
    }

    const { call } = await response.json();

    // 2. Abre a conexão WebRTC
    try {
      const conn = await openCall(sid, call.callId, get().micDeviceId);
      set((state) => {
        const next = new Map(state.ownConnections);
        next.set(call.callId, conn);
        
        // Atualiza a chamada localmente e garante abertura do painel
        const updatedCalls = state.calls.map(c => 
          c.callId === call.callId ? { ...c, status: "connected" as const } : c
        );

        return { 
          ownConnections: next, 
          incoming: null,
          calls: updatedCalls,
          isOpenWidget: true
        };
      });
    } catch (e) {
      // Se falhar na conexão de mídia, encerra a chamada
      await get().endCall(sid, call.callId);
      throw e;
    }

    return call.callId;
  },

  rejectCall: async (sid, callId) => {
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/calls/${callId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Falha ao rejeitar chamada (Status ${response.status})`);
    }

    set({ incoming: null });
  },

  endCall: async (sid, callId) => {
    // Tenta avisar a API
    await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/calls/${callId}`, {
      method: "DELETE",
    }).catch(console.error);

    // Limpa localmente imediatamente por precaução
    set((state) => {
      const conn = state.ownConnections.get(callId);
      if (conn) {
        conn.close();
      }
      const next = new Map(state.ownConnections);
      next.delete(callId);
      
      return {
        calls: state.calls.filter((c) => c.callId !== callId),
        ownConnections: next,
        incoming: state.incoming?.callId === callId ? null : state.incoming,
      };
    });
  },

  fetchSessions: async () => {
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions`);
    if (!response.ok) throw new Error("Erro ao buscar sessões WaCalls.");
    const data = await response.json();
    const sessionsList = data.sessions || [];
    const filteredSessions = sessionsList.filter((s: any) => hasUserAccessToInstance(s.id));
    set({ sessions: filteredSessions });
    return filteredSessions;
  },

  createSession: async (sid) => {
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sid })
    });
    if (!response.ok) throw new Error("Erro ao criar sessão WaCalls.");
    const data = await response.json();
    await get().fetchSessions();
    return data;
  },

  logoutSession: async (sid) => {
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/logout`, {
      method: "POST"
    });
    if (!response.ok) throw new Error("Erro ao desconectar sessão de voz.");
    await get().fetchSessions();
  },

  pairSession: async (sid) => {
    const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/pair`, {
      method: "POST"
    });
    if (!response.ok) throw new Error("Erro ao re-parear sessão WaCalls.");
    // O endpoint /pair do Go retorna 204 No Content, sem corpo JSON
    return true;
  },

  initSSE: () => {
    if (eventSource) return;

    const clientId = get().clientId;
    console.log(`[useWaCallsStore] Conectando ao canal SSE com clientId: ${clientId}`);
    
    eventSource = new EventSource(`${API_URL}/api/v1/wacalls/events?clientId=${encodeURIComponent(clientId)}`);
    set({ isConnectedSSE: true });

    eventSource.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data);
        if (ev.type === "disabled") {
          console.log("[useWaCallsStore/SSE] WaCalls está desativado no servidor.");
          set({ isConnectedSSE: false });
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          return;
        }

        console.log("[useWaCallsStore/SSE Event]:", ev);

        if (ev.type === "session-list") {
          const filteredSessions = (ev.sessions || []).filter((s: any) => hasUserAccessToInstance(s.id));
          set({ sessions: filteredSessions });
        } else if (ev.type === "session-qr") {
          if (hasUserAccessToInstance(ev.sessionId)) {
            set((state) => ({
              qrCodes: { ...state.qrCodes, [ev.sessionId]: ev.qr }
            }));
          }
        } else if (ev.type === "auth-state") {
          set((state) => {
            const nextQr = { ...state.qrCodes };
            if (ev.paired) delete nextQr[ev.sessionId];
            else if (ev.qr && hasUserAccessToInstance(ev.sessionId)) nextQr[ev.sessionId] = ev.qr;

            return {
              qrCodes: nextQr,
              sessions: state.sessions.map((s) =>
                s.id === ev.sessionId ? { ...s, paired: ev.paired, status: ev.state } : s
              )
            };
          });
        } else if (ev.type === "call-list") {
          const filteredCalls = (ev.calls || []).filter((c: any) => hasUserAccessToInstance(c.sessionId));
          set({ calls: filteredCalls });
        } else if (ev.type === "call-status") {
          if (hasUserAccessToInstance(ev.sessionId)) {
            set((state) => ({
              calls: state.calls.map((c) =>
                c.callId === ev.id
                  ? { ...c, sessionId: ev.sessionId, status: ev.status, peer: ev.peer, startedAt: ev.startedAt }
                  : c
              ),
            }));
          }
        } else if (ev.type === "call-ended") {
          set((state) => {
            const conn = state.ownConnections.get(ev.id);
            if (conn) {
              conn.close();
            }
            const next = new Map(state.ownConnections);
            next.delete(ev.id);

            // Se for uma chamada encerrada, dispara evento no DOM apenas se o usuário tiver acesso a esta sessão
            if (hasUserAccessToInstance(ev.sessionId)) {
              const domEvent = new CustomEvent("wacall:ended", {
                detail: {
                  sessionId: ev.sessionId,
                  callId: ev.id,
                  reason: ev.reason,
                  endedAt: ev.endedAt
                }
              });
              window.dispatchEvent(domEvent);
            }

            return {
              calls: state.calls.filter((c) => c.callId !== ev.id),
              ownConnections: next,
              incoming: state.incoming?.callId === ev.id ? null : state.incoming,
            };
          });
        } else if (ev.type === "incoming") {
          // RBAC & Preferências: Só notifica chamada recebida se o operador tiver acesso e a notificação de chamada estiver ativada
          if (hasUserAccessToInstance(ev.sessionId) && shouldNotifyForEvent(ev.sessionId, 'incoming_call', 'sound')) {
            set({
              incoming: {
                sessionId: ev.sessionId,
                callId: ev.callId,
                peer: ev.peer,
                offeredAt: ev.offeredAt,
              },
            });
          } else {
            console.log(`[useWaCallsStore/SSE] Chamada recebida para a caixa "${ev.sessionId}" ignorada pois o operador não tem acesso.`);
          }
        } else if (ev.type === "incoming-claimed") {
          set((state) => (state.incoming?.callId === ev.id ? { incoming: null } : state));
        }
      } catch (err) {
        console.error("[useWaCallsStore/SSE Parse Error]:", err);
      }
    };

    eventSource.onerror = (e) => {
      console.log("[useWaCallsStore/SSE Connection Error] Servidor de chamadas offline. Programando reconexão em 30s...", e);
      set({ isConnectedSSE: false });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      
      // Auto-reconexão em 30 segundos
      setTimeout(() => {
        const currentClientId = get().clientId;
        if (currentClientId) {
          console.log("[useWaCallsStore/SSE] Restabelecendo SSE...");
          get().initSSE();
        }
      }, 30000);
    };

    // Registrar ouvinte de visibilidade para reconectar o SSE instantaneamente ao focar a aba
    if (typeof window !== 'undefined' && !(window as any)._hasWaCallsSseListeners) {
      (window as any)._hasWaCallsSseListeners = true;
      
      const checkAndReconnectSse = () => {
        if (!eventSource && get().clientId) {
          console.log("[useWaCallsStore/SSE Window Event] Foco restabelecido, reiniciando SSE...");
          get().initSSE();
        }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkAndReconnectSse();
        }
      });
      window.addEventListener('focus', checkAndReconnectSse);
      window.addEventListener('online', checkAndReconnectSse);
    }
  },

  closeSSE: () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    set({ isConnectedSSE: false });
  }
}));
