import { float32ToInt16LE, int16LEToFloat32 } from "./pcm";

const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export const SAMPLE_RATE = 16000;
export const PCM_CHANNEL_LABEL = "pcm";
export const CAPTURE_WORKLET_URL = "/worklets/capture-processor.js";
export const PLAYBACK_WORKLET_URL = "/worklets/playback-processor.js";
export const CAPTURE_PROCESSOR_NAME = "capture-processor";
export const PLAYBACK_PROCESSOR_NAME = "playback-processor";

export type OpenCall = {
  pc: RTCPeerConnection;
  micStream: MediaStream;
  remoteStream: MediaStream | null;
  close: () => void;
};

export const openCall = async (
  sid: string,
  callId: string,
  micDeviceId: string | null,
): Promise<OpenCall> => {
  console.log(`[WaCalls/WebRTC] 📞 Iniciando openCall para chamada '${callId}'. Solicitando acesso ao microfone...`);
  let micStream: MediaStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
    });
  } catch (err) {
    console.warn("[WaCalls/WebRTC] ⚠ Falha ao obter microfone selecionado. Tentando obter microfone padrão...", err);
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  console.log("[WaCalls/WebRTC] ✔ Acesso ao microfone concedido.");

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  });

  console.log("[WaCalls/WebRTC] Criando Data Channel 'pcm' para áudio bidirecional raw...");
  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

  // Rastrear estados do Data Channel
  dc.onopen = () => console.log("[WaCalls/WebRTC] 🟢 Data Channel 'pcm' aberto com sucesso e pronto para tráfego PCM!");
  dc.onclose = () => console.warn("[WaCalls/WebRTC] 🔴 Data Channel 'pcm' fechado.");
  dc.onerror = (err) => console.error("[WaCalls/WebRTC] ✖ Erro no Data Channel:", err);

  // Rastrear estados do ICE Connection e PeerConnection
  pc.oniceconnectionstatechange = () => {
    console.log(`[WaCalls/WebRTC] ICE Connection State: ${pc.iceConnectionState}`);
  };
  pc.onconnectionstatechange = () => {
    console.log(`[WaCalls/WebRTC] Peer Connection State: ${pc.connectionState}`);
  };

  console.log("[WaCalls/WebRTC] Configurando AudioContext de 16kHz...");
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await ctx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  await ctx.resume();

  const micSource = ctx.createMediaStreamSource(micStream);
  const captureNode = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (dc.readyState === "open") dc.send(float32ToInt16LE(e.data));
  };
  micSource.connect(captureNode);
  captureNode.connect(ctx.destination);

  const playbackNode = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR_NAME);
  const streamDest = ctx.createMediaStreamDestination();
  playbackNode.connect(streamDest);
  playbackNode.connect(ctx.destination);
  dc.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    playbackNode.port.postMessage(int16LEToFloat32(e.data));
  };

  console.log("[WaCalls/WebRTC] Gerando SDP Offer...");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  console.log("[WaCalls/WebRTC] Iniciando ICE Candidates Gathering...");
  await Promise.race([
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") resolve();
      else
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") resolve();
        });
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 5000))
  ]);
  console.log("[WaCalls/WebRTC] ICE Gathering concluído ou atingiu timeout limite de 5s. Enviando SDP Offer para o backend...");

  const response = await fetch(`${API_URL}/api/v1/wacalls/sessions/${sid}/calls/${callId}/webrtc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sdp_offer: pc.localDescription!.sdp })
  });

  if (!response.ok) {
    throw new Error('Falha ao enviar oferta WebRTC para o servidor.');
  }

  const { sdp_answer } = await response.json();
  console.log("[WaCalls/WebRTC] SDP Answer recebido. Aplicando Remote Description...");
  await pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });
  console.log("[WaCalls/WebRTC] Remote Description aplicado. Aguardando conexão de mídia...");

  return {
    pc,
    micStream,
    remoteStream: streamDest.stream,
    close: () => {
      console.log(`[WaCalls/WebRTC] 🚪 Fechando conexão WebRTC para chamada '${callId}'...`);
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        ctx.close().catch(() => {});
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
};
