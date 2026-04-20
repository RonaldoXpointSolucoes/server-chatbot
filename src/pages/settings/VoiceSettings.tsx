import React, { useState, useEffect } from 'react';
import { Mic, Waves, Sparkles, Settings2, ShieldCheck, ChevronDown, Check, Save, Info, Play, Square, Loader2 } from 'lucide-react';
import { useSettingsStore, VoiceSettings } from '../../store/settingsStore';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../store/chatStore';

export default function VoiceSettingsPage() {
  const { voiceSettings, setVoiceSettings } = useSettingsStore();
  const [formData, setFormData] = useState<VoiceSettings>(voiceSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    setFormData(voiceSettings);
  }, [voiceSettings]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setVoiceSettings(formData);
      setIsSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      // Feedback proativo pro frontend recarregar
      const addToast = useChatStore.getState().addToast;
      if (addToast) addToast('Configurações de voz atualizadas com sucesso!', 'success');
    }, 600);
  };

  const handleChange = (field: keyof VoiceSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Todas as vozes especiais identificadas no Vertex AI TTS / Gemini
  const voices = [
    { id: 'Aoede', name: 'Aoede (Female)' },
    { id: 'Achernar', name: 'Achernar (Female)' },
    { id: 'Achird', name: 'Achird (Male)' },
    { id: 'Algenib', name: 'Algenib (Male)' },
    { id: 'Algieba', name: 'Algieba (Male)' },
    { id: 'Alnilam', name: 'Alnilam (Male)' },
    { id: 'Autonoe', name: 'Autonoe (Female)' },
    { id: 'Callirrhoe', name: 'Callirrhoe (Female)' },
    { id: 'Charon', name: 'Charon (Male)' },
    { id: 'Despina', name: 'Despina (Female)' },
    { id: 'Enceladus', name: 'Enceladus (Male)' },
    { id: 'Erinome', name: 'Erinome (Female)' },
    { id: 'Fenrir', name: 'Fenrir (Male)' },
    { id: 'Gacrux', name: 'Gacrux (Female)' },
    { id: 'Iapetus', name: 'Iapetus (Male)' },
    { id: 'Kore', name: 'Kore (Female)' },
    { id: 'Laomedeia', name: 'Laomedeia (Female)' },
    { id: 'Leda', name: 'Leda (Female)' },
    { id: 'Orus', name: 'Orus (Male)' },
    { id: 'Puck', name: 'Puck (Male)' },
    { id: 'Pulcherrima', name: 'Pulcherrima (Female)' },
    { id: 'Rasalgethi', name: 'Rasalgethi (Male)' },
    { id: 'Sadachbia', name: 'Sadachbia (Male)' },
    { id: 'Sadaltager', name: 'Sadaltager (Male)' },
    { id: 'Schedar', name: 'Schedar (Male)' },
    { id: 'Sulafat', name: 'Sulafat (Female)' },
    { id: 'Umbriel', name: 'Umbriel (Male)' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix (Female)' },
    { id: 'Zephyr', name: 'Zephyr (Female)' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi (Male)' },
    // Mantendo vozes padrão brasileiras da v1 caso o modelo selecionado seja o Standard
    { id: 'pt-BR-Journey-F', name: '[GCP Padrão] Journey F (Feminina)' },
    { id: 'pt-BR-Journey-D', name: '[GCP Padrão] Journey D (Masculina)' },
    { id: 'pt-BR-Neural2-C', name: '[GCP Padrão] Neural2 C (Profissional)' },
  ];

  const handleTestVoice = async () => {
    if (isPlaying && audioElement) {
      audioElement.pause();
      setIsPlaying(false);
      return;
    }

    try {
      setIsLoadingAudio(true);
      const gcpKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
      if (!gcpKey) {
        useChatStore.getState().addToast?.("Chave VITE_GOOGLE_CLOUD_API_KEY não configurada.", "error");
        setIsLoadingAudio(false);
        return;
      }

      // Se houver instruções, vamos fazer ela ler um texto dinâmico.
      // Se não tiver, lê um texto padrão de boas-vindas.
      let promptTeste = "Olá! Esta é uma demonstração do meu timbre e energia. Como posso ajudar nas suas vendas hoje?";
      
      let actualVoiceName = formData.voiceName || "pt-BR-Journey-F";
      const lang = formData.languageCode || "pt-BR";
      
      // Auto-formata vozes curtas do Vertex (ex: 'Despina' vira 'pt-BR-Chirp3-HD-Despina')
      if (!actualVoiceName.includes('-')) {
        actualVoiceName = `${lang}-Chirp3-HD-${actualVoiceName}`;
      }

      const payload = {
        input: { text: promptTeste },
        voice: { 
          languageCode: lang, 
          name: actualVoiceName 
        },
        audioConfig: { 
          audioEncoding: "OGG_OPUS",
          speakingRate: formData.speed || 1.05,
          pitch: formData.pitch || 0
        }
      };

      const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${gcpKey}`;
      let res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      let data = await res.json();
      
      if (!res.ok) {
        // Fallback para testar Neural se Journey não permitida ou não existir
        if (data.error && (data.error.message.includes('Journey') || data.error.message.includes('does not exist'))) {
           useChatStore.getState().addToast?.('Voz selecionada indisponível nativamente. Tocando com motor Neural2 de alta qualidade.', 'info');
           
           // Replace with standard premium
           payload.voice.name = 'pt-BR-Neural2-C';
           res = await fetch(endpoint, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(payload)
           });
           data = await res.json();
           
           if (!res.ok) {
             throw new Error(data.error?.message || "Erro ao testar voz após o fallback");
           }
        } else {
           throw new Error(data.error?.message || "Erro ao testar voz");
        }
      }

      const audioBlob = await fetch(`data:audio/ogg;base64,${data.audioContent}`).then(r => r.blob());
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      
      setAudioElement(audio);
      audio.play();
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
      };
    } catch(err: any) {
      console.error(err);
      useChatStore.getState().addToast?.(`Erro: ${err.message}`, "error");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  return (
    <div className="flex-1 w-full h-full bg-[#111b21] overflow-y-auto styled-scrollbar relative">
      
      {/* Dynamic Background Premium */}
      <div className="absolute top-0 left-0 w-full h-[300px] overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-20%] left-[10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] opacity-60"></div>
         <div className="absolute top-[30%] right-[10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[120px] opacity-40"></div>
      </div>

      <div className="max-w-4xl mx-auto p-8 relative z-10">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-lg shadow-indigo-500/20">
               <div className="w-full h-full bg-[#182229] rounded-[11px] flex items-center justify-center">
                 <Mic className="text-indigo-400" size={20} />
               </div>
             </div>
             <h1 className="text-2xl font-bold tracking-tight text-white">Gestão da Voz <span className="text-indigo-400">AI</span></h1>
          </div>
          <p className="text-slate-400 text-sm ml-13 max-w-xl">
            Configure a personalidade, o modelo e as instruções de estilo para o motor de Text-To-Speech. Estas configurações são globais e afetam todas as instâncias do WhatsApp ao gerar áudio nativo.
          </p>
        </div>

        {/* Content Tabs mock just to match user premium feel */}
        <div className="flex gap-2 mb-6">
           <div className="px-4 py-2 rounded-full border border-[#2a3942] bg-[#182229] text-slate-400 text-sm flex items-center gap-2 cursor-pointer hover:bg-[#202c33] transition-colors"><Waves size={16}/> Imagem</div>
           <div className="px-4 py-2 rounded-full border border-[#2a3942] bg-[#182229] text-slate-400 text-sm flex items-center gap-2 cursor-pointer hover:bg-[#202c33] transition-colors"><ShieldCheck size={16}/> Vídeo</div>
           <div className="px-5 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-sm font-medium flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.1)]"><Mic size={16}/> Voz</div>
           <div className="px-4 py-2 rounded-full border border-[#2a3942] bg-[#182229] text-slate-400 text-sm flex items-center gap-2 cursor-pointer hover:bg-[#202c33] transition-colors"><Sparkles size={16}/> Música</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="col-span-2 space-y-6">
            {/* Main Config Card */}
            <div className="bg-[#182229]/80 backdrop-blur-xl border border-[#2a3942] rounded-2xl p-6 shadow-xl shadow-black/20">
              
              <div className="space-y-5">
                {/* Task Field */}
                <div>
                  <label className="text-[13px] font-medium text-slate-400 ml-1 mb-1.5 block">Tarefa</label>
                  <div className="relative">
                     <select disabled className="w-full h-11 bg-[#111b21] border border-[#2a3942] rounded-xl px-4 text-slate-300 text-sm appearance-none opacity-80 cursor-not-allowed">
                        <option>Text-to-speech</option>
                     </select>
                     <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  </div>
                </div>

                {/* Model Field */}
                <div>
                  <label className="text-[13px] font-medium text-slate-400 ml-1 mb-1.5 block">Modelo</label>
                  <div className="relative">
                     <select 
                        value={formData.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                        className="w-full h-11 bg-[#111b21] border border-[#2a3942] rounded-xl px-4 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer"
                     >
                        <option value="google-cloud-tts">Google Cloud TTS Standard</option>
                        <option value="gemini-flash-tts">Gemini 3.1 Flash TTS (Preview)</option>
                     </select>
                     <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-[#2a3942] to-transparent my-4"></div>

                {/* Language & Voice Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px] font-medium text-slate-400 ml-1 mb-1.5 block">Language</label>
                    <div className="relative">
                       <select 
                          value={formData.languageCode}
                          onChange={(e) => handleChange('languageCode', e.target.value)}
                          className="w-full h-11 bg-[#111b21] border border-[#2a3942] rounded-xl px-4 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer"
                       >
                          <option value="pt-BR">Portuguese (Brazil)</option>
                          <option value="en-US">English (United States)</option>
                          <option value="es-ES">Spanish (Spain)</option>
                       </select>
                       <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                    </div>
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-slate-400 ml-1 mb-1.5 block">Voice</label>
                    <div className="relative">
                       <select 
                          value={formData.voiceName}
                          onChange={(e) => handleChange('voiceName', e.target.value)}
                          className="w-full h-11 bg-[#111b21] border border-[#2a3942] rounded-xl px-4 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer"
                       >
                          {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                       </select>
                       <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                    </div>
                  </div>
                </div>
                
                {/* Output Parameters Indicator */}
                <div className="flex items-center gap-3 pt-2">
                   <Settings2 size={16} className="text-slate-500" />
                   <div>
                     <p className="text-sm font-medium text-slate-300">Parâmetros de Compressão Nativa</p>
                     <p className="text-xs font-mono text-slate-500 mt-0.5 tracking-tight">OGG_OPUS, 24000 Hz, PTT_NATIVE</p>
                   </div>
                </div>

              </div>
            </div>

            {/* System Prompt / Instructions Card */}
            <div className="bg-[#182229]/80 backdrop-blur-xl border border-[#2a3942] rounded-2xl p-6 shadow-xl shadow-black/20 relative group overflow-hidden">
               {/* Border glow hover effect */}
               <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
               
               <div className="flex items-start justify-between mb-3 relative z-10">
                 <div>
                   <h3 className="text-[14px] font-semibold text-white flex items-center gap-2">
                     <Sparkles size={14} className="text-indigo-400" />
                     Instruções de estilo (System Prompt)
                   </h3>
                   <p className="text-[12px] text-slate-400 mt-1">Como a IA deve soar e se comportar na geração da voz.</p>
                 </div>
               </div>

               <div className="relative z-10">
                 <textarea
                    value={formData.instructions}
                    onChange={(e) => handleChange('instructions', e.target.value)}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl p-4 text-[#e9edef] text-sm leading-relaxed focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none styled-scrollbar h-36"
                    placeholder="Speak in Brazilian Portuguese. Use a highly empathetic, warm..."
                 />
                 {formData.model === 'google-cloud-tts' && (
                    <div className="mt-3 flex items-start gap-2 bg-[#202c33]/80 p-3 rounded-lg border border-[#2a3942]">
                      <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-[11.5px] text-slate-300 leading-snug">
                        <strong className="text-slate-200">Nota:</strong> O modelo Google Cloud TTS Standard não processa instruções de estilo nativamente. Para que a voz aplique o Prompt acima, altere o modelo para <span className="text-indigo-300">Gemini 3.1 Flash TTS</span> na configuração acima. (Aguardando disponibilidade da v3.1 na API).
                      </p>
                    </div>
                 )}
               </div>
            </div>

            {/* Save Action */}
            <div className="flex gap-4 justify-end pt-2 pb-10">
              
              <button 
                onClick={handleTestVoice}
                disabled={isLoadingAudio}
                className={cn(
                  "h-11 px-5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all duration-300",
                  isPlaying 
                    ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                    : "bg-[#202c33] text-white border border-[#2a3942] hover:bg-[#2a3942]"
                )}
              >
                {isLoadingAudio ? (
                   <Loader2 size={18} className="animate-spin text-slate-400" />
                ) : isPlaying ? (
                   <><Square size={16} className="fill-current" /> Parar Áudio</>
                ) : (
                   <><Play size={16} className="fill-current text-indigo-400 ml-0.5" /> Ouvir Prévia</>
                )}
              </button>

              <button 
                onClick={handleSave}
                disabled={isSaving}
                className={cn(
                  "h-11 px-6 rounded-xl font-medium text-sm flex items-center gap-2 transition-all duration-300 shadow-lg shadow-indigo-500/20",
                  saved 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-indigo-500 hover:bg-indigo-600 text-white border border-transparent"
                )}
              >
                {isSaving ? (
                   <Loader2 size={18} className="animate-spin" />
                ) : saved ? (
                   <><Check size={18} /> Salvo com Sucesso</>
                ) : (
                   <><Save size={18} /> Salvar Configurações</>
                )}
              </button>
            </div>

          </div>

          {/* Right Sidebar - Preview / Info */}
          <div className="col-span-1 space-y-4">
             <div className="bg-gradient-to-b from-[#182229] to-[#111b21] border border-[#2a3942] rounded-2xl p-5 shadow-xl">
               <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                 <Waves size={16} className="text-emerald-400" />
                 Preview de Moduladores
               </h4>

               <div className="space-y-6">
                 <div>
                   <div className="flex justify-between items-center mb-2">
                     <label className="text-[12px] font-medium text-slate-300">Velocidade da Voz</label>
                     <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 rounded">{formData.speed.toFixed(2)}x</span>
                   </div>
                   <input 
                     type="range" 
                     min="0.5" max="2.0" step="0.05"
                     value={formData.speed}
                     onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
                     className="w-full accent-emerald-500 h-1 bg-[#202c33] rounded-lg appearance-none cursor-pointer"
                   />
                   <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                     <span>Lento</span><span>Padrão</span><span>Rápido</span>
                   </div>
                 </div>

                 <div>
                   <div className="flex justify-between items-center mb-2">
                     <label className="text-[12px] font-medium text-slate-300">Pitch (Timbre)</label>
                     <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 rounded">{formData.pitch > 0 ? '+' : ''}{formData.pitch.toFixed(1)}</span>
                   </div>
                   <input 
                     type="range" 
                     min="-10" max="10" step="0.5"
                     value={formData.pitch}
                     onChange={(e) => handleChange('pitch', parseFloat(e.target.value))}
                     className="w-full accent-indigo-500 h-1 bg-[#202c33] rounded-lg appearance-none cursor-pointer"
                   />
                   <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                     <span>Grave</span><span>Neutro</span><span>Agudo</span>
                   </div>
                 </div>
               </div>
             </div>

             {/* Pro TIP */}
             <div className="bg-[#182229] border border-emerald-500/20 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full"></div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-2">Pro Tip</h4>
                <p className="text-[13px] text-slate-300 leading-relaxed relative z-10">
                  As vozes "Journey" do Google Cloud carregam uma curva de entonação muito mais expressiva, pausando nativamente nas vírgulas. Deixe a velocidade em <strong className="text-emerald-400">1.05x</strong> para soar idêntico ao ritmo brasileiro de mensagens de áudio.
                </p>
             </div>
          </div>

        </div>

      </div>
    </div>
  );
}
