export const NOTIFICATION_SOUNDS = [
  { id: 'default', name: 'Pop Padrão' },
  { id: 'bell', name: 'Sino Suave' },
  { id: 'chime', name: 'Mensagem Curta' },
  { id: 'bubble', name: 'Bolha' },
  { id: 'alert', name: 'Alerta Rápido' },
  { id: 'echo', name: 'Eco Duplo' },
  { id: 'digital', name: 'Digital' },
  { id: 'success', name: 'Sucesso' },
  { id: 'marimba', name: 'Marimba' },
  { id: 'pluck', name: 'Pluck' },
];

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// Gera sons puros via Web Audio API (Zero assets, carregamento instantâneo)
export const playNotificationSound = (soundId: string = 'default') => {
  try {
    const ctx = initAudio();
    const t = ctx.currentTime;
    
    const playTone = (freq: number, type: OscillatorType, startTime: number, duration: number, vol: number = 0.5) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    switch (soundId) {
      case 'bell':
        playTone(880, 'sine', t, 0.5, 0.4);
        playTone(1760, 'sine', t + 0.1, 0.8, 0.2);
        break;
      case 'chime':
        playTone(1200, 'sine', t, 0.3, 0.3);
        playTone(1600, 'sine', t + 0.15, 0.4, 0.3);
        break;
      case 'bubble':
        playTone(400, 'sine', t, 0.1, 0.5);
        playTone(600, 'sine', t + 0.05, 0.1, 0.5);
        playTone(800, 'sine', t + 0.1, 0.1, 0.5);
        break;
      case 'alert':
        playTone(1000, 'square', t, 0.1, 0.2);
        playTone(1000, 'square', t + 0.15, 0.1, 0.2);
        break;
      case 'echo':
        playTone(800, 'triangle', t, 0.2, 0.4);
        playTone(800, 'triangle', t + 0.2, 0.2, 0.2);
        playTone(800, 'triangle', t + 0.4, 0.2, 0.1);
        break;
      case 'digital':
        playTone(2000, 'sawtooth', t, 0.05, 0.1);
        playTone(2500, 'sawtooth', t + 0.08, 0.05, 0.1);
        playTone(3000, 'sawtooth', t + 0.16, 0.05, 0.1);
        break;
      case 'success':
        playTone(523.25, 'sine', t, 0.2, 0.3); // C5
        playTone(659.25, 'sine', t + 0.15, 0.2, 0.3); // E5
        playTone(783.99, 'sine', t + 0.3, 0.4, 0.3); // G5
        break;
      case 'marimba':
        playTone(600, 'sine', t, 0.2, 0.6);
        playTone(1200, 'sine', t, 0.1, 0.2); // Harmônico
        break;
      case 'pluck':
        playTone(900, 'triangle', t, 0.1, 0.5);
        break;
      case 'default':
      default:
        // Pop Padrão (similar a bolha rápida)
        playTone(600, 'sine', t, 0.15, 0.4);
        break;
    }
  } catch (e) {
    console.error("Audio API falhou:", e);
  }
};
