import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { Settings2, Save, Link as LinkIcon, Briefcase, Store, MapPin, Clock, Plus, Trash2, Camera, Video, Utensils, Smartphone, Wifi, Battery, Signal, Home, Search, ClipboardList, User } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HorarioPeriodo {
  inicio: string;
  fim: string;
}

interface DiaTrabalho {
  dia: string;
  aberto: boolean;
  periodos: HorarioPeriodo[];
}

const DIAS_PADRAO: DiaTrabalho[] = [
  { dia: 'Segunda-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Terça-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Quarta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Quinta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Sexta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Sábado', aberto: true, periodos: [{ inicio: '18:00', fim: '00:00' }] },
  { dia: 'Domingo', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
];

const gerarTextoHorario = (dias: DiaTrabalho[]) => {
  const partes: string[] = [];
  dias.forEach(d => {
    if (d.aberto && d.periodos.length > 0) {
      const turnosText = d.periodos
        .map(p => `das ${p.inicio.replace(':', 'h')} às ${p.fim.replace(':', 'h')}`)
        .join(' e ');
      partes.push(`${d.dia}: ${turnosText}`);
    } else {
      partes.push(`${d.dia}: Não abre`);
    }
  });
  return partes.join('. ');
};

export default function AccountSettings() {
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const updateTenantSettings = useChatStore(state => state.updateTenantSettings);

  const [nomeIa, setNomeIa] = useState('');
  const [endereco, setEndereco] = useState('');
  const [diasHorarios, setDiasHorarios] = useState<DiaTrabalho[]>(DIAS_PADRAO);
  const [linkCardapio, setLinkCardapio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [googleMaps, setGoogleMaps] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Estados para Cardápio JSON Online
  const [cardapioJsonUrl, setCardapioJsonUrl] = useState('');
  const [cardapioJsonToken, setCardapioJsonToken] = useState('');
  const [cardapioJsonPayload, setCardapioJsonPayload] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');
  const [activeResultTab, setActiveResultTab] = useState<'preview' | 'json'>('preview');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    console.log("AccountSettings montou. tenantInfo:", tenantInfo);
    if (tenantInfo?.settings) {
      setNomeIa(tenantInfo.settings.nome_ia || '');
      setEndereco(tenantInfo.settings.endereco || '');
      setLinkCardapio(tenantInfo.settings.link_cardapio || '');
      setInstagram(tenantInfo.settings.instagram || '');
      setGoogleMaps(tenantInfo.settings.google_maps || '');
      setYoutube(tenantInfo.settings.youtube || '');
      setTiktok(tenantInfo.settings.tiktok || '');
      setCardapioJsonUrl(tenantInfo.settings.cardapio_json_url || '');
      setCardapioJsonToken(tenantInfo.settings.cardapio_json_token || '');
      setCardapioJsonPayload(tenantInfo.settings.cardapio_json_payload || '');
      
      if (tenantInfo.settings.horarios_estrutura) {
        setDiasHorarios(tenantInfo.settings.horarios_estrutura);
      } else {
        setDiasHorarios(DIAS_PADRAO);
      }
    }
  }, [tenantInfo]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    const textoGerado = gerarTextoHorario(diasHorarios);
    console.log("Iniciando save com variáveis:", { nomeIa, endereco, textoGerado, linkCardapio, instagram, googleMaps, youtube, tiktok });
    try {
      await updateTenantSettings({ 
        nome_ia: nomeIa,
        endereco: endereco,
        horario_funcionamento: textoGerado,
        horarios_estrutura: diasHorarios,
        link_cardapio: linkCardapio,
        instagram,
        google_maps: googleMaps,
        youtube,
        tiktok,
        cardapio_json_url: cardapioJsonUrl,
        cardapio_json_token: cardapioJsonToken,
        cardapio_json_payload: cardapioJsonPayload
      });
      console.log("Save concluído!");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao salvar as configurações:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRequest = async () => {
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      if (!cardapioJsonUrl) {
        throw new Error('A URL do endpoint é obrigatória para realizar o teste.');
      }

      if (cardapioJsonPayload) {
        try {
          JSON.parse(cardapioJsonPayload);
        } catch (e) {
          throw new Error('O corpo da requisição (JSON Payload) não é um JSON válido. Verifique chaves, aspas duplas e vírgulas.');
        }
      }

      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: cardapioJsonUrl,
          token: cardapioJsonToken,
          payload: cardapioJsonPayload ? JSON.parse(cardapioJsonPayload) : null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Erro na requisição. Status: ${res.status}`);
      }

      const resData = await res.json();
      setTestResult(resData);

      if (resData && resData.data && Array.isArray(resData.data.grupos) && resData.data.grupos.length > 0) {
        setActiveGroupId(resData.data.grupos[0].id);
      } else {
        setActiveGroupId(null);
      }
    } catch (err: any) {
      setTestError(err.message || 'Ocorreu um erro desconhecido ao testar a requisição.');
    } finally {
      setTestLoading(false);
    }
  };

  const handleToggleDia = (index: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => 
      idx === index ? { ...item, aberto: !item.aberto } : item
    ));
  };

  const handleAddPeriodo = (diaIndex: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        return {
          ...item,
          periodos: [...item.periodos, { inicio: '18:00', fim: '23:00' }]
        };
      }
      return item;
    }));
  };

  const handleRemovePeriodo = (diaIndex: number, periodoIndex: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        return {
          ...item,
          periodos: item.periodos.filter((_, pIdx) => pIdx !== periodoIndex)
        };
      }
      return item;
    }));
  };

  const handleChangePeriodo = (diaIndex: number, periodoIndex: number, campo: 'inicio' | 'fim', valor: string) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        const novosPeriodos = item.periodos.map((p, pIdx) => 
          pIdx === periodoIndex ? { ...p, [campo]: valor } : p
        );
        return { ...item, periodos: novosPeriodos };
      }
      return item;
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      
      {/* Header Premium */}
      <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex items-center justify-between px-8 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              Conta
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#aebac1]">
              Gerencie as configurações e variáveis globais da sua empresa.
            </p>
          </div>
        </div>

        <div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} className={cn(saving && "animate-pulse")} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-xl animate-in slide-in-from-top-2 duration-300">
              Configurações salvas com sucesso!
            </div>
          )}

          {/* Seção Variáveis Globais da Empresa */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Variáveis Globais da Empresa (Luna IA)</h2>
                <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure os dados da sua empresa que serão inseridos de forma dinâmica nos prompts da Luna.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Store size={16} className="text-gray-400" />
                    Nome da Empresa / Nome da IA
                  </label>
                  <input 
                    type="text"
                    value={nomeIa}
                    onChange={(e) => setNomeIa(e.target.value)}
                    placeholder="Ex: Pizzaria Bella Italia ou Luna"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[NOME_DA_EMPRESA]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <LinkIcon size={16} className="text-gray-400" />
                    Link do Cardápio Digital
                  </label>
                  <input 
                    type="url"
                    value={linkCardapio}
                    onChange={(e) => setLinkCardapio(e.target.value)}
                    placeholder="https://seu-cardapio.com.br"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_CARDAPIO]</code>.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                  <MapPin size={16} className="text-gray-400" />
                  Endereço da Unidade
                </label>
                <input 
                  type="text"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Ex: Av. Paulista, 1000 - Bela Vista, São Paulo - SP"
                  className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                  Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[ENDERECO_DA_EMPRESA]</code>.
                </p>
              </div>

              {/* Redes Sociais e Mapas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100 dark:border-[#222d34]/60">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Camera size={16} className="text-pink-500" />
                    Link do Instagram
                  </label>
                  <input 
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_INSTAGRAM]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <MapPin size={16} className="text-emerald-500" />
                    Link do Google Maps
                  </label>
                  <input 
                    type="url"
                    value={googleMaps}
                    onChange={(e) => setGoogleMaps(e.target.value)}
                    placeholder="https://maps.google.com/?q=sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_GOOGLE_MAPS]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Video size={16} className="text-red-500" />
                    Link do YouTube
                  </label>
                  <input 
                    type="url"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    placeholder="https://youtube.com/c/sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_YOUTUBE]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <LinkIcon size={16} className="text-purple-400" />
                    Link do TikTok
                  </label>
                  <input 
                    type="url"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="https://tiktok.com/@sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_TIKTOK]</code>.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-gray-400" />
                  Horário de Funcionamento (Configurador Semanal)
                </label>
                
                <div className="space-y-4 bg-[#f8f9fa] dark:bg-[#182229] border border-gray-200/50 dark:border-[#222d34] rounded-2xl p-6 shadow-inner">
                  {diasHorarios.map((d, dIdx) => (
                    <div key={d.dia} className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 border-b border-gray-100 dark:border-[#222d34]/60 last:border-b-0">
                      {/* Nome do dia e Toggle */}
                      <div className="flex items-center justify-between md:justify-start gap-4 min-w-[200px]">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 w-28">{d.dia}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleDia(dIdx)}
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner",
                              d.aberto ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"
                            )}
                          >
                            <span 
                              className={cn(
                                "w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform duration-200 shadow-sm",
                                d.aberto ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-wider select-none w-14",
                            d.aberto ? "text-emerald-500" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {d.aberto ? 'ABERTO' : 'FECHADO'}
                          </span>
                        </div>
                      </div>

                      {/* Períodos de funcionamento */}
                      {d.aberto ? (
                        <div className="flex-1 flex flex-col gap-2.5">
                          {d.periodos.map((p, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                              <div className="flex items-center bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-3 py-1.5 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mr-2">Início</span>
                                <input
                                  type="time"
                                  value={p.inicio}
                                  onChange={(e) => handleChangePeriodo(dIdx, pIdx, 'inicio', e.target.value)}
                                  className="bg-transparent border-none text-xs text-gray-800 dark:text-gray-100 outline-none w-16"
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-1">às</span>
                              <div className="flex items-center bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-3 py-1.5 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mr-2">Fim</span>
                                <input
                                  type="time"
                                  value={p.fim}
                                  onChange={(e) => handleChangePeriodo(dIdx, pIdx, 'fim', e.target.value)}
                                  className="bg-transparent border-none text-xs text-gray-800 dark:text-gray-100 outline-none w-16"
                                />
                              </div>

                              {d.periodos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePeriodo(dIdx, pIdx)}
                                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                  title="Remover período"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          
                          <button
                            type="button"
                            onClick={() => handleAddPeriodo(dIdx)}
                            className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 w-fit mt-1 px-2 py-1 rounded bg-indigo-500/5 hover:bg-indigo-500/10 transition-all border border-indigo-500/10"
                          >
                            <Plus size={12} />
                            Adicionar Turno
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center h-9 text-xs font-semibold text-gray-400 dark:text-gray-500">
                          Luna responderá que a empresa está fechada neste dia.
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-3 leading-relaxed">
                  Os horários configurados serão consolidados automaticamente em texto legível para a inteligência artificial substituir no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[HORARIO_FUNCIONAMENTO]</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Seção Cardápio JSON Online (Integração de Produtos) */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                <LinkIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Cardápio JSON Online</h2>
                <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure a busca e consulta de produtos diretamente via API JSON.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                  URL do Endpoint
                </label>
                <input 
                  type="text"
                  value={cardapioJsonUrl}
                  onChange={(e) => setCardapioJsonUrl(e.target.value)}
                  placeholder="Ex: https://service.xpointsolucoes.com.br:8443/v6/server/nuvem/ProdutoPdvService/GetCardapioCompleto"
                  className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    Token de Autorização (Bearer)
                  </label>
                  <input 
                    type="text"
                    value={cardapioJsonToken}
                    onChange={(e) => setCardapioJsonToken(e.target.value)}
                    placeholder="Bearer eyJ0eXAi..."
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    Corpo da Requisição (JSON Payload)
                  </label>
                  <textarea 
                    value={cardapioJsonPayload}
                    onChange={(e) => setCardapioJsonPayload(e.target.value)}
                    placeholder='{"AGuidEstab": "6D0187D9-E905-4479-AB15-B908F0222607"}'
                    rows={3}
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleTestRequest}
                  disabled={testLoading || !cardapioJsonUrl}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testLoading ? 'Testando...' : 'Testar Requisição'}
                </button>
              </div>

              {testError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl text-sm animate-in fade-in duration-300 font-mono whitespace-pre-wrap">
                  <strong>Erro no teste:</strong> {testError}
                </div>
              )}

              {testResult && (
                <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                  
                  {/* Cabeçalho de Status e Abas */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#222d34]/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Resultado do Teste:</span>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                        testResult.status === 200 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                      )}>
                        Status: {testResult.status}
                      </span>
                    </div>

                    <div className="flex items-center bg-gray-200/50 dark:bg-black/20 p-1 rounded-xl w-fit font-sans">
                      <button
                        type="button"
                        onClick={() => setActiveResultTab('preview')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          activeResultTab === 'preview'
                            ? "bg-white dark:bg-[#2a3942] text-gray-800 dark:text-gray-100 shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        )}
                      >
                        Visualização do Cardápio
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveResultTab('json')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          activeResultTab === 'json'
                            ? "bg-white dark:bg-[#2a3942] text-gray-800 dark:text-gray-100 shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        )}
                      >
                        JSON Bruto
                      </button>
                    </div>
                  </div>

                  {/* Aba de Visualização do Cardápio */}
                  {activeResultTab === 'preview' && (
                    <div className="flex justify-center py-4 bg-slate-100/50 dark:bg-black/30 rounded-2xl">
                      {testResult.data && Array.isArray(testResult.data.grupos) && Array.isArray(testResult.data.produtos) ? (
                        <div className="w-[360px] h-[560px] bg-white text-gray-800 rounded-[36px] border-[8px] border-slate-800 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col relative font-sans">
                          {/* Barra de Status */}
                          <div className="h-6 bg-white flex justify-between items-center px-6 pt-1 text-[10px] font-bold text-gray-500 z-10 select-none flex-shrink-0">
                            <span>12:00</span>
                            <div className="flex items-center gap-1">
                              <Signal size={10} />
                              <Wifi size={10} />
                              <Battery size={10} className="rotate-90" />
                            </div>
                          </div>

                          {/* Cabeçalho do Cardápio Fiel ao Layout da Loja */}
                          <div className="bg-white px-4 pt-2 pb-4 text-center border-b border-gray-100 flex-shrink-0 flex flex-col items-center">
                            <div className="flex items-center gap-4 justify-center mb-1 text-emerald-600">
                              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">W</div>
                              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">I</div>
                            </div>
                            <h3 className="text-base font-black text-gray-900 tracking-tight uppercase">
                              {nomeIa || 'BURGUER PLUS'}
                            </h3>
                            <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5 justify-center">
                              <MapPin size={10} />
                              {endereco ? (endereco.split('-')[0].trim()) : 'Taboão da Serra - SP'}
                            </span>
                            <span className="mt-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                              LOJA ABERTA
                            </span>
                          </div>

                          {/* Categorias (Navegação Horizontal) */}
                          <div className="flex items-center gap-5 overflow-x-auto px-4 pb-2 pt-3 border-b border-gray-100 scrollbar-none flex-shrink-0 bg-white">
                            {testResult.data.grupos.map((g: any) => {
                              const isActive = activeGroupId === g.id;
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => setActiveGroupId(g.id)}
                                  className={cn(
                                    "pb-1.5 text-xs font-black tracking-wider uppercase whitespace-nowrap transition-all border-b-2 relative",
                                    isActive 
                                      ? "border-red-600 text-red-600 font-extrabold"
                                      : "border-transparent text-gray-400 hover:text-gray-600"
                                  )}
                                >
                                  {g.description}
                                </button>
                              );
                            })}
                          </div>

                          {/* Lista de Produtos do Grupo */}
                          <div className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100 bg-white">
                            {(() => {
                              const filtered = (testResult.data.produtos || []).filter((p: any) => p.groupId === activeGroupId);
                              if (filtered.length === 0) {
                                return (
                                  <div className="text-center py-12 text-xs text-gray-400">
                                    Nenhum produto cadastrado neste grupo.
                                  </div>
                                );
                              }
                              return filtered.map((p: any) => {
                                const imageUrl = p.image ? p.image.split('|')[0] : '';
                                const hasPromo = p.name.toLowerCase().includes('costela') || p.name.toLowerCase().includes('combo');
                                const originalPrice = p.price * 1.35;

                                return (
                                  <div 
                                    key={p.id} 
                                    className="flex items-start justify-between gap-4 py-4"
                                  >
                                    <div className="flex-1 space-y-1">
                                      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                                        {p.name}
                                      </h4>
                                      {p.description && (
                                        <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                                          {p.description}
                                        </p>
                                      )}
                                      <div className="pt-1.5 flex flex-col gap-0.5">
                                        {hasPromo ? (
                                          <div className="text-xs text-gray-400 flex items-center gap-1">
                                            <span>De</span>
                                            <span className="line-through">
                                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(originalPrice)}
                                            </span>
                                            <span>por</span>
                                            <span className="text-sm font-extrabold text-emerald-600">
                                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-sm font-extrabold text-gray-900">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                          </span>
                                        )}
                                        {p.active === false && (
                                          <span className="w-fit bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mt-1">
                                            Pausado
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Imagem */}
                                    {imageUrl ? (
                                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center shadow-sm">
                                        <img 
                                          src={imageUrl} 
                                          alt={p.name} 
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLElement).style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0 border border-gray-200/50">
                                        <Utensils size={18} />
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Barra de Navegação Inferior Mockada */}
                          <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-around text-gray-400 px-2 flex-shrink-0">
                            <button type="button" className="flex flex-col items-center justify-center gap-0.5 text-red-600">
                              <Home size={18} />
                              <span className="text-[9px] font-bold">Início</span>
                            </button>
                            <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                              <Search size={18} />
                              <span className="text-[9px] font-bold">Buscar</span>
                            </button>
                            <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                              <ClipboardList size={18} />
                              <span className="text-[9px] font-bold">Pedidos</span>
                            </button>
                            <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                              <User size={18} />
                              <span className="text-[9px] font-bold">Perfil</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-xs text-amber-500 font-mono">
                          A estrutura do JSON retornado não possui "grupos" e "produtos" válidos para visualização.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Aba de JSON Bruto */}
                  {activeResultTab === 'json' && (
                    <div className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-xs font-mono text-gray-700 dark:text-[#d1d7db] bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl border border-slate-200/50 dark:border-[#304046]/30 animate-in fade-in duration-250">
                      {JSON.stringify(testResult.data, null, 2)}
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
 
        </div>
      </div>
    </div>
  );
}
