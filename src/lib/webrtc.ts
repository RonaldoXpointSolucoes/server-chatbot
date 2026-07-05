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
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
  });

  const pc = new RTCPeerConnection({ iceServers: [] });

  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

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

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") resolve();
    else
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      });
  });

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
  await pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });

  return {
    pc,
    micStream,
    remoteStream: streamDest.stream,
    close: () => {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        ctx.close();
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
};
