import { create } from "zustand";
import { openCall, OpenCall } from "../lib/webrtc";

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
    const cleanPhone = phone.replace(/\D/g, "");
    
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
        return { ownConnections: next };
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
        return { ownConnections: next, incoming: null };
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
    set({ sessions: sessionsList });
    return sessionsList;
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
        console.log("[useWaCallsStore/SSE Event]:", ev);

        if (ev.type === "session-list") {
          set({ sessions: ev.sessions });
        } else if (ev.type === "session-qr") {
          set((state) => ({
            qrCodes: { ...state.qrCodes, [ev.sessionId]: ev.qr }
          }));
        } else if (ev.type === "auth-state") {
          set((state) => {
            const nextQr = { ...state.qrCodes };
            if (ev.paired) delete nextQr[ev.sessionId];
            else if (ev.qr) nextQr[ev.sessionId] = ev.qr;

            return {
              qrCodes: nextQr,
              sessions: state.sessions.map((s) =>
                s.id === ev.sessionId ? { ...s, paired: ev.paired, status: ev.state } : s
              )
            };
          });
        } else if (ev.type === "call-list") {
          set({ calls: ev.calls });
        } else if (ev.type === "call-status") {
          set((state) => ({
            calls: state.calls.map((c) =>
              c.callId === ev.id
                ? { ...c, sessionId: ev.sessionId, status: ev.status, peer: ev.peer, startedAt: ev.startedAt }
                : c
            ),
          }));
        } else if (ev.type === "call-ended") {
          set((state) => {
            const conn = state.ownConnections.get(ev.id);
            if (conn) {
              conn.close();
            }
            const next = new Map(state.ownConnections);
            next.delete(ev.id);

            // Se for uma chamada encerrada, dispara evento no DOM para que o chat possa registrar no histórico de forma reativa
            const domEvent = new CustomEvent("wacall:ended", {
              detail: {
                sessionId: ev.sessionId,
                callId: ev.id,
                reason: ev.reason,
                endedAt: ev.endedAt
              }
            });
            window.dispatchEvent(domEvent);

            return {
              calls: state.calls.filter((c) => c.callId !== ev.id),
              ownConnections: next,
              incoming: state.incoming?.callId === ev.id ? null : state.incoming,
            };
          });
        } else if (ev.type === "incoming") {
          set({
            incoming: { sessionId: ev.sessionId, callId: ev.id, peer: ev.peer, offeredAt: ev.offeredAt }
          });
        } else if (ev.type === "incoming-claimed") {
          set((state) => (state.incoming?.callId === ev.id ? { incoming: null } : state));
        }
      } catch (err) {
        console.error("[useWaCallsStore/SSE Parse Error]:", err);
      }
    };

    eventSource.onerror = (e) => {
      console.warn("[useWaCallsStore/SSE Connection Error] Falha de conexão detectada. Programando reconexão em 5s...", e);
      set({ isConnectedSSE: false });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      
      // Auto-reconexão em 5 segundos
      setTimeout(() => {
        const currentClientId = get().clientId;
        if (currentClientId) {
          console.log("[useWaCallsStore/SSE] Restabelecendo SSE...");
          get().initSSE();
        }
      }, 5000);
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
